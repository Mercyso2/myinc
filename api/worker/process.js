import { ensurePublicBucket } from "./_storage.js";
import { carouselInput, carouselPrompt, mergeCarouselUrls } from "./_carousel.js";
import { downloadVideoBytes, pollVideoJob, startVideoJob, videoEnabled } from "./_video.js";

const env = (key, fallback = "") => {
  const value = process.env[key];
  return value === undefined || value === null || String(value).trim() === "" ? fallback : String(value).trim();
};

const required = (key) => {
  const value = env(key);
  if (!value) throw new Error(`${key} ausente na Vercel Function.`);
  return value;
};

const SUPABASE_URL = required("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = required("OPENAI_API_KEY");
const MEDIA_BUCKET = env("MEDIA_BUCKET", "creative-media");
const WORKER_ID = env("WORKER_ID", "vercel-ai-worker-v3");
const MAX_ATTEMPTS = Math.max(1, Number(env("WORKER_MAX_ATTEMPTS", env("QUEUE_MAX_ATTEMPTS", "3"))));
const MAX_JOBS = Math.max(1, Math.min(10, Number(env("VERCEL_WORKER_MAX_JOBS", "2"))));

function short(value, max = 1200) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
}

function safeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function rest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  const body = await response.text();
  const json = safeJson(body);
  if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${short(json || body)}`);
  return json;
}

const first = (result) => (Array.isArray(result) ? result[0] : result);
const insert = async (table, row) => first(await rest(table, { method: "POST", body: JSON.stringify(row) }));
const patch = async (table, query, row) => first(await rest(`${table}?${query}`, { method: "PATCH", body: JSON.stringify(row) }));
const selectOne = async (table, query) => first(await rest(`${table}?${query}`));

async function uploadObject(path, bytes, contentType) {
  await ensurePublicBucket();
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: bytes,
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Storage upload ${response.status}: ${body}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

async function log(row) {
  try {
    await insert("system_logs", {
      module: "vercel-ai-worker-v3",
      type: "worker",
      status: row.status || "info",
      friendly_message: row.message || "Evento do worker Vercel v3.",
      technical_detail: row.detail || null,
      brand_id: row.brand_id || null,
      post_id: row.post_id || null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Falha ao gravar log", error);
  }
}

async function lockNextJob() {
  const now = encodeURIComponent(new Date().toISOString());
  const query = [
    "select=*",
    "status=eq.queued",
    `or=(next_attempt_at.is.null,next_attempt_at.lte.${now})`,
    "order=priority.asc,created_at.asc",
    "limit=1",
  ].join("&");
  const job = await selectOne("generation_jobs", query);
  if (!job) return null;

  const attempt = Number(job.attempt_count || 0) + 1;
  return patch("generation_jobs", `id=eq.${job.id}&status=eq.queued`, {
    status: "processing",
    progress: 5,
    attempt_count: attempt,
    locked_by: WORKER_ID,
    locked_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

async function getPost(postId) {
  const post = await selectOne("posts", `select=*&id=eq.${postId}&limit=1`);
  if (!post) throw new Error("Post nao encontrado.");
  return post;
}

async function brandContext(brandId) {
  const [profile, rules, prompts, refs, visualRules] = await Promise.all([
    selectOne("brand_profiles", `select=*&brand_id=eq.${brandId}&limit=1`).catch(() => null),
    rest(`ai_brain_rules?select=category,content,priority&brand_id=eq.${brandId}&active=eq.true&archived_at=is.null&order=priority.asc&limit=14`).catch(() => []),
    rest(`ai_prompt_templates?select=name,content&brand_id=eq.${brandId}&active=eq.true&archived_at=is.null&limit=8`).catch(() => []),
    rest(`library_items?select=name,notes,ai_usage_rule,url,status,item_type&brand_id=eq.${brandId}&ai_allowed=eq.true&archived_at=is.null&limit=12`).catch(() => []),
    rest(`brand_visual_rules?select=rule_type,content&brand_id=eq.${brandId}&active=eq.true&archived_at=is.null&limit=12`).catch(() => []),
  ]);
  return { profile, rules, prompts, references: refs, visualRules };
}

async function openAiJson(messages) {
  const model = env("OPENAI_TEXT_MODEL", "gpt-5.5");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI texto: ${short(data.error || data)}`);
  const raw = data.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("OpenAI texto nao retornou JSON valido.");
  }
}

async function processContent(job, post) {
  const ctx = await brandContext(post.brand_id);
  const payload = await openAiJson([
    {
      role: "system",
      content:
        "Voce e um social media senior premium para incorporadoras brasileiras. Responda somente JSON valido.",
    },
    {
      role: "user",
      content: [
        "Crie copy final para post MYINC com qualidade de agencia.",
        `Post: ${short(post, 2400)}`,
        `Contexto da marca: ${short(ctx, 4200)}`,
        "Retorne JSON com title, headline, caption, hashtags, cta, image_prompt, creative_brief, master_prompt, quality_score, quality_review, carousel_pages e video_script quando fizer sentido.",
        "Obrigatorio: portugues do Brasil, sem promessas absolutas de valorizacao, visual premium, CTA claro e prompt de imagem sem texto/logotipo/letras/numeros.",
      ].join("\n"),
    },
  ]);

  const qualityScore = Math.max(0, Math.min(100, Number(payload.quality_score || post.quality_score || 88)));
  const row = {
    title: payload.title || post.title,
    headline: payload.headline || post.headline,
    caption: payload.caption || post.caption,
    hashtags: Array.isArray(payload.hashtags) ? payload.hashtags : post.hashtags,
    cta: payload.cta || post.cta,
    image_prompt: payload.image_prompt || post.image_prompt,
    creative_brief: payload.creative_brief || post.creative_brief,
    master_prompt: payload.master_prompt || post.master_prompt,
    quality_score: qualityScore,
    quality_review: payload.quality_review || post.quality_review || { overall_score: qualityScore },
    video_prompt: payload.video_script ? JSON.stringify(payload.video_script, null, 2) : post.video_prompt,
    status: qualityScore >= 88 ? "copy_gerada" : "ajuste_solicitado",
    error_message: null,
    technical_detail: null,
    updated_at: new Date().toISOString(),
  };

  const updated = await patch("posts", `id=eq.${post.id}`, row);
  await insert("post_versions", {
    brand_id: post.brand_id,
    post_id: post.id,
    version_label: `V3-COPY-${Date.now()}`,
    caption: row.caption,
    image_prompt: row.image_prompt,
    quality_score: row.quality_score,
    is_current: true,
    output_json: payload,
  });
  return updated;
}

function imageSize(format = "") {
  const f = String(format).toLowerCase();
  const explicit = env("OPENAI_IMAGE_SIZE", "");
  if (explicit) return explicit;
  if (f.includes("quadrado") || f.includes("thumbnail")) return env("OPENAI_IMAGE_SIZE_SQUARE", "1024x1024");
  if (f.includes("facebook") && !f.includes("story")) return env("OPENAI_IMAGE_SIZE_FACEBOOK", "1536x1024");
  return env("OPENAI_IMAGE_SIZE_PORTRAIT", env("OPENAI_IMAGE_SIZE_STORY", "1024x1536"));
}

function imageModelCandidates() {
  const primary = env("OPENAI_IMAGE_MODEL", "gpt-image-1.5");
  const fallback = env("OPENAI_IMAGE_FALLBACK_MODELS", "gpt-image-1,gpt-image-1-mini")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallback])];
}

function imageQualityCandidates() {
  const preferred = env("OPENAI_IMAGE_QUALITY", "high");
  return [...new Set([preferred, "medium", "auto"].filter(Boolean))];
}

function imagePrompt(post, ctx, extra = "") {
  const format = String(post.format ?? "Feed 4:5 / 1080x1350");
  return [
    "CRIE UMA IMAGEM PUBLICITARIA PREMIUM PARA SOCIAL MEDIA DA MYINC INCORPORADORA.",
    "A imagem precisa parecer campanha real de incorporadora de alto padrao, nao template barato, nao panfleto e nao card generico.",
    "IMPORTANTE: gerar ARTE BASE SEM TEXTO, SEM LOGO, SEM LETRAS, SEM NUMEROS, SEM WATERMARK E SEM MARCAS.",
    "O texto, logo, headline e CTA serao aplicados depois pelo app/editor.",
    `FORMATO FINAL DO APP: ${format}. Preparar composicao segura para corte/publicacao social.`,
    `TEMA: ${post.title || post.theme || post.headline || "MYINC"}.`,
    `BRIEF: ${post.image_prompt || post.creative_brief || post.caption || "Arquitetura contemporanea brasileira premium"}.`,
    `OBJETIVO: ${post.objective || "gerar desejo, autoridade e leads qualificados"}. CANAL: ${post.channel || "Instagram/Facebook"}.`,
    "DIRECAO DE ARTE: arquitetura contemporanea brasileira, alto padrao, estetica editorial, materiais nobres, pedra natural, madeira, vidro, concreto bem acabado e paisagismo premium.",
    "FOTOGRAFIA/RENDER: realismo fotografico, lente arquitetonica profissional, perspectiva correta, luz natural cinematografica, alta faixa dinamica, profundidade elegante e acabamento impecavel.",
    "COMPOSICAO: assunto principal forte, muito respiro, area segura limpa para headline e CTA, hierarquia visual clara, recorte pronto para Instagram.",
    "PALETA MYINC: grafite profundo, off-white, areia, madeira natural, verde paisagismo e cobre como acento discreto.",
    "NEGATIVE PROMPT: watermark, assinatura, texto deformado, logo falso, panfleto, colagem, template, mockup generico, render barato, baixa resolucao, pessoas deformadas, maos defeituosas, geometria impossivel, objetos duplicados, marca de terceiros.",
    `MEMORIA DA MARCA E REFERENCIAS: ${short(ctx, 4200)}.`,
    extra,
  ]
    .filter(Boolean)
    .join("\n");
}

async function fetchUrlBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar imagem da OpenAI: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function generateImageBytes(prompt, size) {
  const errors = [];
  for (const model of imageModelCandidates()) {
    for (const quality of imageQualityCandidates()) {
      const payload = {
        model,
        prompt,
        size,
        n: 1,
        quality,
      };
      const payloads = [
        { ...payload, output_format: env("OPENAI_IMAGE_FORMAT", "png") },
        payload,
      ];

      for (const body of payloads) {
        const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));
        const encoded = data?.data?.[0]?.b64_json;
        const imageUrl = data?.data?.[0]?.url;

        if (response.ok && (encoded || imageUrl)) {
          const bytes = encoded ? Buffer.from(encoded, "base64") : await fetchUrlBytes(imageUrl);
          if (bytes.length < 120000) {
            errors.push(`${model}/${quality}/${size}: imagem pequena demais (${bytes.length} bytes)`);
            continue;
          }
          return { bytes, model, quality, size };
        }

        errors.push(`${model}/${quality}/${size}: HTTP ${response.status} ${short(data.error || data, 600)}`);
      }
    }
  }

  throw new Error(`Provedor de imagem nao retornou arte valida. ${errors.join(" | ")}`);
}

async function createImageAsset(post, prompt, meta = {}) {
  const generation = await generateImageBytes(prompt, imageSize(post.format));
  const kind = meta.kind || "image";
  const path = `${post.brand_id}/${post.id}/${kind}-${crypto.randomUUID()}.png`;
  const publicUrl = await uploadObject(path, generation.bytes, "image/png");

  const head = await fetch(publicUrl, { method: "HEAD" }).catch(() => null);
  if (!head || !head.ok) throw new Error(`URL publica inacessivel apos upload: ${publicUrl}`);

  const asset = await insert("media_assets", {
    brand_id: post.brand_id,
    post_id: post.id,
    name: meta.name || `Imagem premium ${post.title || "MYINC"}`,
    type: meta.type || "Imagem gerada",
    media_type: meta.type || "Imagem gerada",
    bucket: MEDIA_BUCKET,
    path,
    url: publicUrl,
    public_url: publicUrl,
    preview_url: publicUrl,
    mime_type: "image/png",
    size_bytes: generation.bytes.length,
    status: "ativo",
    tags: meta.tags || ["ia", "myinc", "vercel-worker", "premium"],
    origin: `vercel-v3:${generation.model}`,
    usage_context: meta.usage || "post_image",
    ai_allowed: true,
    storage_bucket: MEDIA_BUCKET,
    storage_path: path,
    is_final: true,
    notes: prompt,
    metadata: {
      image_model: generation.model,
      image_quality: generation.quality,
      image_size: generation.size,
      source: "vercel-v3",
      ...(meta.metadata || {}),
    },
  });

  return { asset, publicUrl, model: generation.model, prompt, bytes: generation.bytes.length };
}

async function processImage(job, post) {
  const ctx = await brandContext(post.brand_id);
  const prompt = imagePrompt(post, ctx);
  const out = await createImageAsset(post, prompt);
  const updated = await patch("posts", `id=eq.${post.id}`, {
    media_url: out.publicUrl,
    status: "aguardando_revisao",
    error_message: null,
    technical_detail: `Imagem gerada pelo worker Vercel v3 (${out.model}; ${out.bytes} bytes).`,
    updated_at: new Date().toISOString(),
  });
  await insert("post_versions", {
    brand_id: post.brand_id,
    post_id: post.id,
    version_label: `V3-IMAGE-${Date.now()}`,
    caption: post.caption,
    image_prompt: prompt,
    media_url: out.publicUrl,
    is_current: true,
    output_json: { media_url: out.publicUrl, asset_id: out.asset?.id, image_model: out.model, size_bytes: out.bytes },
  });
  return updated;
}

async function processCarouselPage(job, post) {
  const { page, totalPages } = carouselInput(job);
  const ctx = await brandContext(post.brand_id);
  const prompt = carouselPrompt({ post, page, totalPages, contextText: short(ctx, 2600) });
  const out = await createImageAsset(post, prompt, {
    kind: `carousel-p${page}`,
    type: "Carrossel",
    usage: "carousel_page",
    name: `Carrossel pagina ${page} - ${post.title || "MYINC"}`,
    tags: ["ia", "myinc", "carousel", `page-${page}`],
    metadata: { kind: "carousel_page", page, total_pages: totalPages },
  });
  const existing = await rest(`media_assets?select=url,public_url,metadata,created_at&post_id=eq.${post.id}&usage_context=eq.carousel_page&order=created_at.asc`).catch(() => []);
  const urls = mergeCarouselUrls(existing, out.publicUrl);
  const done = urls.length >= totalPages;
  const updated = await patch("posts", `id=eq.${post.id}`, {
    carousel_media_urls: urls,
    media_url: urls[0] || out.publicUrl,
    status: done ? "aguardando_revisao" : "gerando_carrossel",
    technical_detail: `Carrossel: ${urls.length}/${totalPages} paginas geradas.`,
    updated_at: new Date().toISOString(),
  });
  await insert("post_versions", {
    brand_id: post.brand_id,
    post_id: post.id,
    version_label: `V3-CAROUSEL-P${page}-${Date.now()}`,
    caption: post.caption,
    image_prompt: prompt,
    media_url: out.publicUrl,
    is_current: done,
    output_json: { media_url: out.publicUrl, asset_id: out.asset?.id, image_model: out.model, page, total_pages: totalPages },
  });
  return updated;
}

async function processVideo(job, post) {
  if (!videoEnabled()) {
    throw new Error("Video desativado. Configure ENABLE_OPENAI_VIDEO=true ou ENABLE_VIDEO_WORKER=true na Vercel.");
  }
  const ctx = await brandContext(post.brand_id);

  if (!post.video_job_id) {
    const started = await startVideoJob({ apiKey: OPENAI_API_KEY, post, contextText: short(ctx, 2600) });
    await patch("posts", `id=eq.${post.id}`, {
      video_job_id: started.id,
      video_status: started.status,
      video_progress: started.progress,
      status: "gerando_video",
      updated_at: new Date().toISOString(),
    });
    return { pending: true, status: started.status, videoId: started.id };
  }

  const state = await pollVideoJob({ apiKey: OPENAI_API_KEY, videoId: post.video_job_id });
  if (["queued", "in_progress", "processing"].includes(String(state.status))) {
    await patch("posts", `id=eq.${post.id}`, {
      video_status: state.status,
      video_progress: state.progress || 0,
      status: "gerando_video",
      updated_at: new Date().toISOString(),
    });
    return { pending: true, status: state.status, videoId: post.video_job_id };
  }
  if (state.status !== "completed") throw new Error(`Video falhou ou ficou em status inesperado: ${short(state)}`);

  const bytes = await downloadVideoBytes({ apiKey: OPENAI_API_KEY, videoId: post.video_job_id });
  if (bytes.length < 200000) throw new Error(`MP4 muito pequeno (${bytes.length} bytes).`);
  const path = `${post.brand_id}/${post.id}/video-${crypto.randomUUID()}.mp4`;
  const videoUrl = await uploadObject(path, bytes, "video/mp4");
  const asset = await insert("media_assets", {
    brand_id: post.brand_id,
    post_id: post.id,
    name: `Reels ${post.title || "MYINC"}`,
    type: "Video gerado",
    media_type: "Video gerado",
    bucket: MEDIA_BUCKET,
    path,
    url: videoUrl,
    public_url: videoUrl,
    preview_url: post.media_url || videoUrl,
    mime_type: "video/mp4",
    size_bytes: bytes.length,
    status: "ativo",
    origin: `vercel-video:${env("OPENAI_VIDEO_MODEL", "sora-2-pro")}`,
    usage_context: "video_reels",
    ai_allowed: true,
    storage_bucket: MEDIA_BUCKET,
    storage_path: path,
    is_final: true,
    metadata: { video_id: post.video_job_id, source: "vercel-v3" },
  });
  const updated = await patch("posts", `id=eq.${post.id}`, {
    video_url: videoUrl,
    media_url: videoUrl,
    video_status: "completed",
    video_progress: 100,
    status: "aguardando_revisao",
    error_message: null,
    technical_detail: null,
    updated_at: new Date().toISOString(),
  });
  await insert("post_versions", {
    brand_id: post.brand_id,
    post_id: post.id,
    version_label: `V3-VIDEO-${Date.now()}`,
    caption: post.caption,
    media_url: videoUrl,
    is_current: true,
    output_json: { video_url: videoUrl, asset_id: asset?.id, video_id: post.video_job_id },
  });
  return updated;
}

async function complete(job, result) {
  await patch("generation_jobs", `id=eq.${job.id}`, {
    status: "completed",
    progress: 100,
    result,
    output_json: result,
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    error_message: null,
    technical_detail: null,
  });
}

async function requeue(job, result) {
  await patch("generation_jobs", `id=eq.${job.id}`, {
    status: "queued",
    progress: 35,
    error_message: null,
    technical_detail: `Pendente: ${result.status || "processing"}`,
    next_attempt_at: new Date(Date.now() + Number(env("VIDEO_RETRY_SECONDS", "60")) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
}

async function fail(job, error) {
  const detail = error?.message || String(error);
  const attempt = Number(job.attempt_count || 1);
  const max = Number(job.max_attempts || MAX_ATTEMPTS);
  if (attempt >= max) {
    await patch("generation_jobs", `id=eq.${job.id}`, {
      status: "failed",
      progress: 100,
      error_message: detail,
      technical_detail: detail,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (job.post_id) {
      await patch("posts", `id=eq.${job.post_id}`, {
        status: "erro_ia",
        error_message: "Falha definitiva no worker Vercel.",
        technical_detail: detail,
        updated_at: new Date().toISOString(),
      });
    }
  } else {
    await patch("generation_jobs", `id=eq.${job.id}`, {
      status: "queued",
      progress: 0,
      error_message: detail,
      technical_detail: detail,
      next_attempt_at: new Date(Date.now() + Math.min(900000, attempt * 60000)).toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}

async function runJob(job) {
  const post = await getPost(job.post_id);
  const type = String(job.job_type || job.type || "content");
  await patch("generation_jobs", `id=eq.${job.id}`, { progress: 15, updated_at: new Date().toISOString() });

  let result;
  if (type === "content") result = await processContent(job, post);
  else if (type === "image") result = await processImage(job, post);
  else if (type === "carousel_page") result = await processCarouselPage(job, post);
  else if (type === "video") result = await processVideo(job, post);
  else throw new Error(`Tipo de job nao suportado: ${type}`);

  if (result?.pending) {
    await requeue(job, result);
    await log({
      status: "info",
      message: "Job ainda pendente e reagendado.",
      detail: `job=${job.id}; type=${type}; status=${result.status}`,
      brand_id: post.brand_id,
      post_id: post.id,
    });
    return;
  }

  await complete(job, result);
  await log({
    status: "sucesso",
    message: "Job processado pela Vercel Function v3.",
    detail: `job=${job.id}; type=${type}`,
    brand_id: post.brand_id,
    post_id: post.id,
  });
}

export default async function handler(req, res) {
  const secret = env("CRON_SECRET", "");
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      worker: WORKER_ID,
      maxJobs: MAX_JOBS,
      imageModels: imageModelCandidates(),
      imageSizeDefault: imageSize("Feed 1080x1350"),
      videoEnabled: videoEnabled(),
    });
  }

  const started = Date.now();
  let processed = 0;
  const errors = [];

  for (let index = 0; index < MAX_JOBS; index++) {
    const job = await lockNextJob();
    if (!job) break;
    try {
      await runJob(job);
      processed++;
    } catch (error) {
      await fail(job, error);
      errors.push(error?.message || String(error));
      await log({
        status: "erro",
        message: "Falha no worker Vercel v3.",
        detail: `job=${job.id}; error=${error?.message || String(error)}`,
        post_id: job.post_id,
      });
    }
  }

  return res.status(200).json({ ok: true, worker: WORKER_ID, processed, errors, ms: Date.now() - started });
}
