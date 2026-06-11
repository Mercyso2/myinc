import { ensurePublicBucket } from "./_storage.js";
import { carouselInput, carouselPrompt, mergeCarouselUrls } from "./_carousel.js";
import { downloadVideoBytes, pollVideoJob, startVideoJob, videoEnabled } from "./_video.js";

const env = (key, fallback = "") => process.env[key] || fallback;
const required = (key) => {
  const value = env(key);
  if (!value) throw new Error(`${key} ausente na Vercel Function.`);
  return value;
};

const SUPABASE_URL = required("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = required("OPENAI_API_KEY");
const MEDIA_BUCKET = env("MEDIA_BUCKET", "creative-media");
const WORKER_ID = env("WORKER_ID", "vercel-ai-worker-v2");
const MAX_ATTEMPTS = Number(env("WORKER_MAX_ATTEMPTS", "3"));
const MAX_JOBS = Math.max(1, Math.min(3, Number(env("VERCEL_WORKER_MAX_JOBS", "1"))));

function short(value, max = 1200) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
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
  const json = body ? JSON.parse(body) : null;
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
      module: "vercel-ai-worker-v2",
      type: "worker",
      status: row.status || "info",
      friendly_message: row.message || "Evento do worker Vercel v2.",
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
  const [profile, rules, prompts, refs] = await Promise.all([
    selectOne("brand_profiles", `select=*&brand_id=eq.${brandId}&limit=1`).catch(() => null),
    rest(`ai_brain_rules?select=category,content,priority&brand_id=eq.${brandId}&active=eq.true&archived_at=is.null&order=priority.asc&limit=12`).catch(() => []),
    rest(`ai_prompt_templates?select=name,content&brand_id=eq.${brandId}&active=eq.true&archived_at=is.null&limit=8`).catch(() => []),
    rest(`library_items?select=name,notes,ai_usage_rule,url,status,item_type&brand_id=eq.${brandId}&ai_allowed=eq.true&archived_at=is.null&limit=10`).catch(() => []),
  ]);
  return { profile, rules, prompts, references: refs };
}

async function openAiJson(messages) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env("OPENAI_TEXT_MODEL", "gpt-4.1"),
      response_format: { type: "json_object" },
      messages,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI texto: ${short(data.error || data)}`);
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

async function processContent(job, post) {
  const ctx = await brandContext(post.brand_id);
  const payload = await openAiJson([
    { role: "system", content: "Voce e um social media senior premium para incorporadoras. Responda somente JSON valido." },
    {
      role: "user",
      content: [
        "Crie copy final para post MYINC.",
        `Post: ${short(post, 2200)}`,
        `Contexto da marca: ${short(ctx, 3200)}`,
        "Retorne JSON com title, headline, caption, hashtags, cta, image_prompt, creative_brief e quality_score.",
      ].join("\n"),
    },
  ]);

  const row = {
    title: payload.title || post.title,
    headline: payload.headline || post.headline,
    caption: payload.caption || post.caption,
    hashtags: Array.isArray(payload.hashtags) ? payload.hashtags : post.hashtags,
    cta: payload.cta || post.cta,
    image_prompt: payload.image_prompt || post.image_prompt,
    creative_brief: payload.creative_brief || post.creative_brief,
    quality_score: Number(payload.quality_score || post.quality_score || 85),
    status: "copy_gerada",
    updated_at: new Date().toISOString(),
  };

  const updated = await patch("posts", `id=eq.${post.id}`, row);
  await insert("post_versions", {
    brand_id: post.brand_id,
    post_id: post.id,
    version_label: `V2-COPY-${Date.now()}`,
    caption: row.caption,
    image_prompt: row.image_prompt,
    quality_score: row.quality_score,
    is_current: true,
    output_json: payload,
  });
  return updated;
}

function imageSize(format = "") {
  const explicit = env("OPENAI_IMAGE_SIZE", "");
  if (explicit) return explicit;
  const f = String(format).toLowerCase();
  return f.includes("story") || f.includes("reels") || f.includes("video") ? "1024x1536" : "1024x1024";
}

async function createImageAsset(post, prompt, meta = {}) {
  const model = env("OPENAI_IMAGE_MODEL", "gpt-image-1-mini");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      size: imageSize(post.format),
      n: 1,
      quality: env("OPENAI_IMAGE_QUALITY", "medium"),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI imagem: ${short(data.error || data)}`);

  const encoded = data?.data?.[0]?.b64_json;
  const imageUrl = data?.data?.[0]?.url;
  if (!encoded && !imageUrl) throw new Error("OpenAI imagem nao retornou b64_json nem url.");
  const bytes = encoded ? Buffer.from(encoded, "base64") : Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
  if (bytes.length < 20000) throw new Error(`Imagem pequena demais: ${bytes.length} bytes.`);

  const kind = meta.kind || "image";
  const path = `${post.brand_id}/${post.id}/${kind}-${crypto.randomUUID()}.png`;
  const publicUrl = await uploadObject(path, bytes, "image/png");
  const asset = await insert("media_assets", {
    brand_id: post.brand_id,
    post_id: post.id,
    name: meta.name || `Imagem Vercel ${post.title || "MYINC"}`,
    type: meta.type || "Imagem gerada",
    media_type: meta.type || "Imagem gerada",
    bucket: MEDIA_BUCKET,
    path,
    url: publicUrl,
    public_url: publicUrl,
    preview_url: publicUrl,
    mime_type: "image/png",
    size_bytes: bytes.length,
    status: "ativo",
    tags: meta.tags || ["ia", "myinc", "vercel-worker"],
    origin: `vercel-v2:${model}`,
    usage_context: meta.usage || "post_image",
    ai_allowed: true,
    storage_bucket: MEDIA_BUCKET,
    storage_path: path,
    is_final: true,
    notes: prompt,
    metadata: { image_model: model, source: "vercel-v2", ...(meta.metadata || {}) },
  });
  return { asset, publicUrl, model, prompt };
}

async function processImage(job, post) {
  const ctx = await brandContext(post.brand_id);
  const prompt = [
    "Imagem premium para social media da MYINC incorporadora.",
    "Arquitetura contemporanea, alto padrao, fundo claro/off-white/areia, luz natural.",
    "Sem texto, sem logo, sem letras, sem numeros, sem watermark.",
    `Tema: ${post.title || post.theme || "MYINC"}.`,
    `Brief: ${post.image_prompt || post.creative_brief || post.caption || "empreendimento premium"}.`,
    `Contexto: ${short(ctx, 2200)}`,
  ].join("\n");
  const out = await createImageAsset(post, prompt);
  const updated = await patch("posts", `id=eq.${post.id}`, {
    media_url: out.publicUrl,
    status: "aguardando_revisao",
    error_message: null,
    technical_detail: null,
    updated_at: new Date().toISOString(),
  });
  await insert("post_versions", {
    brand_id: post.brand_id,
    post_id: post.id,
    version_label: `V2-IMAGE-${Date.now()}`,
    caption: post.caption,
    image_prompt: prompt,
    media_url: out.publicUrl,
    is_current: true,
    output_json: { media_url: out.publicUrl, asset_id: out.asset?.id, image_model: out.model },
  });
  return updated;
}

async function processCarouselPage(job, post) {
  const { page, totalPages } = carouselInput(job);
  const ctx = await brandContext(post.brand_id);
  const prompt = carouselPrompt({ post, page, totalPages, contextText: short(ctx, 2000) });
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
    version_label: `V2-CAROUSEL-P${page}-${Date.now()}`,
    caption: post.caption,
    image_prompt: prompt,
    media_url: out.publicUrl,
    is_current: done,
    output_json: { media_url: out.publicUrl, asset_id: out.asset?.id, page, total_pages: totalPages, carousel_media_urls: urls },
  });
  return updated;
}

async function processVideo(job, post) {
  if (!videoEnabled()) throw new Error("Video desativado. Configure ENABLE_VIDEO_WORKER=true na Vercel.");
  const ctx = await brandContext(post.brand_id);

  if (!post.video_job_id) {
    const started = await startVideoJob({ apiKey: OPENAI_API_KEY, post, contextText: short(ctx, 2200) });
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
    metadata: { video_id: post.video_job_id, source: "vercel-v2" },
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
    version_label: `V2-VIDEO-${Date.now()}`,
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
    if (job.post_id) await patch("posts", `id=eq.${job.post_id}`, { status: "erro_ia", error_message: "Falha definitiva no worker Vercel.", technical_detail: detail, updated_at: new Date().toISOString() });
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
    await log({ status: "info", message: "Job ainda pendente e reagendado.", detail: `job=${job.id}; type=${type}; status=${result.status}`, brand_id: post.brand_id, post_id: post.id });
    return;
  }
  await complete(job, result);
  await log({ status: "sucesso", message: "Job processado pela Vercel Function v2.", detail: `job=${job.id}; type=${type}`, brand_id: post.brand_id, post_id: post.id });
}

export default async function handler(req, res) {
  const secret = env("CRON_SECRET", "");
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ ok: false, error: "unauthorized" });

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
      await log({ status: "erro", message: "Falha no worker Vercel v2.", detail: `job=${job.id}; error=${error?.message || String(error)}`, post_id: job.post_id });
    }
  }
  return res.status(200).json({ ok: true, processed, errors, ms: Date.now() - started });
}
