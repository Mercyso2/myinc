import { createClient } from "@supabase/supabase-js";

const env = (key, fallback = "") => process.env[key] ?? fallback;
const required = (key) => {
  const value = env(key);
  if (!value) throw new Error(`${key} ausente no worker.`);
  return value;
};

const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const WORKER_ID = env("WORKER_ID", `myinc-worker-${process.pid}`);
const MEDIA_BUCKET = env("MEDIA_BUCKET", "creative-media");
const POLL_INTERVAL_MS = Number(env("POLL_INTERVAL_MS", "4000"));
const IDLE_SLEEP_MS = Number(env("JOB_IDLE_SLEEP_MS", "5000"));
const RETRY_BASE_SECONDS = Number(env("JOB_RETRY_BASE_SECONDS", "45"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compact(value, max = 1800) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.length > max ? `${text.slice(0, max)}... [cortado]` : text;
}

function isCarouselFormat(format = "") {
  return String(format).toLowerCase().includes("carrossel");
}

function isVideoFormat(format = "") {
  const normalized = String(format).toLowerCase();
  return normalized.includes("reels") || normalized.includes("vídeo") || normalized.includes("video");
}

function carouselPageCount(format = "") {
  return String(format).includes("8") ? 8 : 5;
}

function openAiSize(format = "") {
  const normalized = String(format).toLowerCase();
  if (normalized.includes("quadrado") || normalized.includes("thumbnail")) return env("OPENAI_IMAGE_SIZE_SQUARE", "1024x1024");
  if (normalized.includes("facebook") && !normalized.includes("story")) return env("OPENAI_IMAGE_SIZE_FACEBOOK", "1536x1024");
  if (normalized.includes("story") || normalized.includes("reels") || normalized.includes("vídeo") || normalized.includes("video")) return env("OPENAI_IMAGE_SIZE_STORY", "1024x1536");
  return env("OPENAI_IMAGE_SIZE_FEED", "1024x1536");
}

function imageModel() {
  return env("OPENAI_IMAGE_MODEL", "gpt-image-1");
}

function fallbackCarouselPages(post, count) {
  const scenes = [
    "imagem hero da fachada/empreendimento com maior impacto comercial",
    "entrada, lobby ou paisagismo transmitindo exclusividade",
    "interior integrado com materiais nobres e luz natural",
    "detalhe de acabamento, textura e qualidade construtiva",
    "lifestyle sofisticado e natural, sem pessoas em primeiro plano deformáveis",
    "obra, precisão técnica ou confiança da incorporadora",
    "vista, entorno e valorização imobiliária",
    "fechamento aspiracional com espaço seguro para CTA",
  ];
  return Array.from({ length: count }, (_, index) => ({
    page: index + 1,
    title: index === 0 ? String(post.headline ?? post.title ?? "MYINC") : `Página ${index + 1}`,
    text: index === count - 1 ? String(post.cta ?? "Fale com a MYINC") : "Narrativa visual premium.",
    visual_prompt: `${scenes[index]}; continuidade visual, mesma paleta, luz e linguagem; variar enquadramento e manter área segura para overlay`,
  }));
}

async function insertEvent(jobId, eventType, message, detail = {}) {
  await supabase.from("generation_job_events").insert({
    job_id: jobId,
    event_type: eventType,
    message,
    detail,
  });
}

async function logSystem(row) {
  await supabase.from("system_logs").insert({
    type: row.type ?? "generation_worker",
    module: row.module ?? "generation_worker",
    status: row.status ?? "info",
    friendly_message: row.friendly_message ?? "Evento do worker.",
    technical_detail: row.technical_detail ?? "{}",
    brand_id: row.brand_id ?? null,
    post_id: row.post_id ?? null,
  });
}

async function updateJob(id, patch) {
  const { data, error } = await supabase.from("generation_jobs").update({ ...patch, updated_at: nowIso() }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

async function loadPostContext(postId, brandId) {
  const [postRes, profileRes, rulesRes, promptsRes, refsRes, versionRes] = await Promise.all([
    supabase.from("posts").select("*").eq("id", postId).single(),
    supabase.from("brand_profiles").select("*").eq("brand_id", brandId).maybeSingle(),
    supabase.from("ai_brain_rules").select("category,content,priority").eq("brand_id", brandId).eq("active", true).is("archived_at", null).order("priority"),
    supabase.from("ai_prompt_templates").select("name,content").eq("brand_id", brandId).eq("active", true).is("archived_at", null),
    supabase.from("library_items").select("name,notes,url,ai_usage_rule,status").eq("brand_id", brandId).is("archived_at", null).limit(20),
    supabase.from("post_versions").select("output_json,image_prompt,caption").eq("post_id", postId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (postRes.error) throw postRes.error;
  return {
    post: postRes.data,
    profile: profileRes.data,
    rules: rulesRes.data ?? [],
    prompts: promptsRes.data ?? [],
    references: refsRes.data ?? [],
    latestOutput: object(versionRes.data?.output_json),
  };
}

function buildBaseImagePrompt(ctx, feedback = null) {
  const { post, profile, rules, prompts, references, latestOutput } = ctx;
  const format = String(post.format ?? "Feed 4:5 / 1080x1350");
  const size = openAiSize(format);
  const lines = [
    "CRIE UMA IMAGEM PUBLICITÁRIA PREMIUM PARA SOCIAL MEDIA DA MYINC INCORPORADORA.",
    "A imagem precisa parecer campanha real de incorporadora de alto padrão, não template barato, não panfleto e não card genérico.",
    "IMPORTANTE: gerar ARTE BASE SEM TEXTO, SEM LOGO, SEM LETRAS, SEM NÚMEROS E SEM MARCAS. O app aplicará overlay depois.",
    `FORMATO FINAL DO APP: ${format}. Geração técnica: ${size}.`,
    `POST: ${compact(post.title ?? post.theme ?? "MYINC", 400)}.`,
    `BRIEF DO POST: ${compact(post.image_prompt ?? latestOutput.image_prompt ?? post.creative_brief ?? post.title ?? "Arquitetura contemporânea brasileira premium", 1200)}.`,
    `OBJETIVO: ${compact(post.objective ?? "gerar desejo, autoridade e leads qualificados", 500)}. CANAL: ${compact(post.channel ?? "Instagram/Facebook", 200)}.`,
    "DIREÇÃO DE ARTE: arquitetura contemporânea brasileira, alto padrão, estética editorial, sofisticada e comercial; materiais nobres como pedra natural, madeira, vidro, concreto bem acabado e paisagismo premium.",
    "FOTOGRAFIA/RENDER: realismo fotográfico, lente arquitetônica profissional, perspectiva correta, luz natural cinematográfica, alta faixa dinâmica, profundidade elegante e acabamento impecável.",
    "COMPOSIÇÃO: assunto principal forte, muito respiro, área segura limpa para headline e CTA, hierarquia visual clara, sem excesso de elementos, recorte pronto para Instagram.",
    "PALETA MYINC: grafite profundo, off-white, areia, madeira natural, verde paisagismo e cobre como acento discreto. Evitar neon, cores infantis e saturação exagerada.",
    "NEGATIVE PROMPT: watermark, assinatura, texto deformado, logo falso, panfleto, colagem, template genérico, render barato, baixa resolução, pessoas deformadas, geometria impossível, objetos duplicados, marca de terceiros.",
    `MEMÓRIA DA MARCA: ${compact(profile, 1800)}.`,
    `REGRAS ATIVAS DO CÉREBRO IA: ${compact(rules, 1800)}.`,
    `PROMPTS BASE DA IA: ${compact(prompts, 1600)}.`,
    `REFERÊNCIAS/BIBLIOTECA APROVADAS: ${compact(references, 1600)}.`,
    feedback ? `FEEDBACK HUMANO OBRIGATÓRIO: ${compact(feedback, 700)}.` : "",
  ].filter(Boolean);
  const prompt = lines.join("\n");
  const max = Number(env("OPENAI_IMAGE_MAX_PROMPT_CHARS", "8000"));
  return prompt.length > max ? `${prompt.slice(0, max)}\n[PROMPT CORTADO PARA ESTABILIDADE]` : prompt;
}

function buildPagePrompt(ctx, page, count, feedback = null) {
  const pageObject = object(page);
  return [
    buildBaseImagePrompt(ctx, feedback),
    `CARROSSEL MYINC - página ${pageObject.page ?? 1}/${count}.`,
    `Mensagem da página para orientar visual, sem escrever texto na imagem: ${compact(pageObject.text ?? ctx.post.caption ?? "", 700)}.`,
    `Direção visual específica: ${compact(pageObject.visual_prompt ?? ctx.post.image_prompt ?? ctx.post.creative_brief ?? "", 900)}.`,
    "Gerar uma imagem única para esta página, com continuidade visual da campanha, variando enquadramento e mantendo área segura para overlay.",
  ].join("\n");
}

function detectImageInfo(bytes, fallbackFormat = "png") {
  const isPng = bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (isPng) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { mime: "image/png", ext: "png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return { mime: "image/jpeg", ext: "jpg", width: 1024, height: 1024 };
  const format = fallbackFormat.toLowerCase().replace("jpeg", "jpg");
  return { mime: format === "jpg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png", ext: format === "jpg" ? "jpg" : format === "webp" ? "webp" : "png", width: 1024, height: 1024 };
}

async function generateImageBytes(prompt, format) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${required("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: imageModel(),
      prompt,
      size: openAiSize(format),
      output_format: env("OPENAI_IMAGE_FORMAT", "png"),
      quality: env("OPENAI_IMAGE_QUALITY", "medium"),
      n: 1,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI image HTTP ${response.status}: ${JSON.stringify(data)}`);
  const encoded = object(Array.isArray(object(data).data) ? object(data).data[0] : {}).b64_json;
  if (!encoded) throw new Error("OpenAI não retornou b64_json.");
  const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
  if (bytes.byteLength < 90_000) throw new Error(`Imagem muito pequena: ${bytes.byteLength} bytes.`);
  return { bytes, info: detectImageInfo(bytes, env("OPENAI_IMAGE_FORMAT", "png")) };
}

async function uploadBytes({ brandId, postId, folder, bytes, info }) {
  const path = `${brandId}/${postId}/${folder}/${crypto.randomUUID()}.${info.ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: info.mime, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  if (!data.publicUrl?.startsWith("https://")) throw new Error("Storage não retornou URL pública HTTPS.");
  return { path, publicUrl: data.publicUrl };
}

async function createMediaAsset({ ctx, job, label, bytes, info, path, publicUrl, prompt, assetType, pageNumber = null, isFinal = true }) {
  const isCarousel = assetType === "carousel_page";
  const { data: mediaAsset, error } = await supabase
    .from("media_assets")
    .insert({
      brand_id: ctx.post.brand_id,
      post_id: ctx.post.id,
      name: label,
      type: assetType === "video" ? "Vídeo gerado" : "Imagem gerada",
      media_type: assetType === "video" ? "video" : "Imagem gerada",
      bucket: MEDIA_BUCKET,
      path,
      url: publicUrl,
      public_url: publicUrl,
      preview_url: publicUrl,
      mime_type: info.mime,
      size_bytes: bytes.byteLength,
      status: "ativo",
      tags: isCarousel ? ["ia", "myinc", "carrossel", `pagina-${pageNumber}`] : ["ia", "myinc", assetType],
      origin: assetType === "video" ? "video-provider" : `openai:${imageModel()}`,
      usage_context: assetType,
      ai_allowed: true,
      storage_bucket: MEDIA_BUCKET,
      storage_path: path,
      is_final: isFinal,
      used_in_publish: false,
      notes: prompt,
      metadata: {
        worker_id: WORKER_ID,
        job_id: job.id,
        prompt,
        page_number: pageNumber,
        image_model: assetType === "video" ? null : imageModel(),
        image_size: assetType === "video" ? null : openAiSize(ctx.post.format),
        image_quality: env("OPENAI_IMAGE_QUALITY", "medium"),
        width: info.width,
        height: info.height,
      },
    })
    .select()
    .single();
  if (error) throw error;

  await supabase.from("generation_job_assets").insert({
    job_id: job.id,
    media_asset_id: mediaAsset.id,
    asset_type: assetType,
    page_number: pageNumber,
    storage_path: path,
    public_url: publicUrl,
    metadata: mediaAsset.metadata ?? {},
  });

  return mediaAsset;
}

async function createImageVersionAndUpdatePost({ ctx, job, mediaUrl, prompt, outputJson = {} }) {
  const { data: version, error: versionError } = await supabase
    .from("post_versions")
    .insert({
      brand_id: ctx.post.brand_id,
      post_id: ctx.post.id,
      version_label: `V${Date.now()}`,
      caption: ctx.post.caption,
      image_prompt: prompt,
      media_url: mediaUrl,
      quality_score: ctx.post.quality_score,
      human_feedback: object(job.payload).feedback ?? null,
      is_current: true,
      output_json: {
        ...outputJson,
        media_url: mediaUrl,
        worker_id: WORKER_ID,
        job_id: job.id,
        image_model: imageModel(),
        image_size: openAiSize(ctx.post.format),
        image_quality: env("OPENAI_IMAGE_QUALITY", "medium"),
      },
    })
    .select()
    .single();
  if (versionError) throw versionError;

  await supabase.from("post_versions").update({ is_current: false }).eq("post_id", ctx.post.id).neq("id", version.id);
  const { error: updateError } = await supabase
    .from("posts")
    .update({
      media_url: mediaUrl,
      current_version_id: version.id,
      error_message: null,
      technical_detail: null,
      status: "aguardando_revisao",
      updated_at: nowIso(),
    })
    .eq("id", ctx.post.id);
  if (updateError) throw updateError;
}

async function processImageJob(job, pagePayload = null) {
  const ctx = await loadPostContext(job.post_id, job.brand_id);
  const page = pagePayload ?? object(job.payload).page ?? null;
  const prompt = page ? buildPagePrompt(ctx, page, object(job.payload).expected_pages ?? carouselPageCount(ctx.post.format), object(job.payload).feedback) : buildBaseImagePrompt(ctx, object(job.payload).feedback);

  await insertEvent(job.id, "provider_requested", "Solicitando imagem à OpenAI.", { model: imageModel(), size: openAiSize(ctx.post.format) });
  const { bytes, info } = await generateImageBytes(prompt, ctx.post.format);
  const folder = page ? "carousel" : "feed";
  const { path, publicUrl } = await uploadBytes({ brandId: ctx.post.brand_id, postId: ctx.post.id, folder, bytes, info });
  const pageNumber = page ? Number(object(page).page ?? 1) : null;
  await createMediaAsset({
    ctx,
    job,
    label: page ? `Carrossel ${ctx.post.title} - página ${pageNumber}` : `Criativo ${ctx.post.title}`,
    bytes,
    info,
    path,
    publicUrl,
    prompt,
    assetType: page ? "carousel_page" : "image",
    pageNumber,
    isFinal: !page || pageNumber === 1,
  });

  if (!page) await createImageVersionAndUpdatePost({ ctx, job, mediaUrl: publicUrl, prompt });
  await updateJob(job.id, { status: "completed", progress: 100, result: { media_url: publicUrl, page: pageNumber }, output_json: { media_url: publicUrl, page: pageNumber }, finished_at: nowIso() });
  await insertEvent(job.id, "job_completed", "Imagem concluída.", { media_url: publicUrl, page: pageNumber });
}

async function processCarouselParent(job) {
  const { data: existingChildren, error: childError } = await supabase.from("generation_jobs").select("id").eq("parent_job_id", job.id).limit(1);
  if (childError) throw childError;
  if (existingChildren?.length) {
    await updateJob(job.id, { status: "waiting_children", progress: 20 });
    return;
  }

  const ctx = await loadPostContext(job.post_id, job.brand_id);
  const count = carouselPageCount(ctx.post.format);
  const latestPages = Array.isArray(ctx.latestOutput.carousel_pages) && ctx.latestOutput.carousel_pages.length ? ctx.latestOutput.carousel_pages.slice(0, count) : fallbackCarouselPages(ctx.post, count);
  while (latestPages.length < count) latestPages.push(fallbackCarouselPages(ctx.post, count)[latestPages.length]);

  const rows = latestPages.map((page, index) => ({
    brand_id: job.brand_id,
    post_id: job.post_id,
    parent_job_id: job.id,
    job_type: "carousel_page",
    type: "carousel_page",
    status: "pending",
    priority: Number(job.priority ?? 100) + index + 1,
    progress: 0,
    max_attempts: Number(job.max_attempts ?? 3),
    payload: {
      page: { ...object(page), page: Number(object(page).page ?? index + 1) },
      expected_pages: count,
      parent_job_id: job.id,
      feedback: object(job.payload).feedback ?? null,
    },
    input_json: {
      page: { ...object(page), page: Number(object(page).page ?? index + 1) },
      expected_pages: count,
      parent_job_id: job.id,
    },
  }));

  const { error } = await supabase.from("generation_jobs").insert(rows);
  if (error) throw error;
  await updateJob(job.id, { status: "waiting_children", progress: 15, result: { expected_pages: count }, output_json: { carousel_pages: latestPages } });
  await insertEvent(job.id, "carousel_children_created", `${rows.length} páginas do carrossel enfileiradas.`, { count });
}

async function consolidateWaitingCarousels() {
  const { data: parents, error } = await supabase.from("generation_jobs").select("*").eq("job_type", "carousel").eq("status", "waiting_children").limit(10);
  if (error) throw error;
  for (const parent of parents ?? []) {
    const { data: children, error: childrenError } = await supabase.from("generation_jobs").select("*").eq("parent_job_id", parent.id).order("created_at");
    if (childrenError) throw childrenError;
    if (!children?.length) continue;
    const completed = children.filter((child) => child.status === "completed");
    const failed = children.filter((child) => child.status === "failed");
    const expected = Number(object(parent.result).expected_pages ?? children.length);
    const progress = Math.min(95, Math.round((completed.length / expected) * 100));
    await updateJob(parent.id, { progress });

    if (completed.length < expected) {
      if (failed.length && completed.length + failed.length >= expected) {
        await updateJob(parent.id, { status: "failed", error_message: "Uma ou mais páginas do carrossel falharam.", finished_at: nowIso() });
      }
      continue;
    }

    const { data: childAssets, error: assetsError } = await supabase
      .from("generation_job_assets")
      .select("*")
      .in("job_id", completed.map((child) => child.id))
      .order("page_number");
    if (assetsError) throw assetsError;

    const urls = (childAssets ?? []).sort((a, b) => Number(a.page_number ?? 0) - Number(b.page_number ?? 0)).map((asset) => asset.public_url).filter(Boolean);
    if (!urls.length) continue;

    const ctx = await loadPostContext(parent.post_id, parent.brand_id);
    const { data: version, error: versionError } = await supabase.from("post_versions").insert({
      brand_id: parent.brand_id,
      post_id: parent.post_id,
      version_label: `V${Date.now()}`,
      caption: ctx.post.caption,
      image_prompt: `Carrossel assíncrono com ${urls.length} páginas geradas pelo worker.`,
      media_url: urls[0],
      quality_score: ctx.post.quality_score,
      is_current: true,
      output_json: {
        media_url: urls[0],
        carousel_media_urls: urls,
        carousel_pages: object(parent.output_json).carousel_pages ?? [],
        worker_id: WORKER_ID,
        parent_job_id: parent.id,
      },
    }).select().single();
    if (versionError) throw versionError;
    await supabase.from("post_versions").update({ is_current: false }).eq("post_id", parent.post_id).neq("id", version.id);
    await supabase.from("posts").update({
      media_url: urls[0],
      carousel_media_urls: urls,
      current_version_id: version.id,
      status: "aguardando_revisao",
      error_message: null,
      technical_detail: null,
      updated_at: nowIso(),
    }).eq("id", parent.post_id);
    await updateJob(parent.id, { status: "completed", progress: 100, result: { carousel_media_urls: urls }, output_json: { carousel_media_urls: urls }, finished_at: nowIso() });
    await insertEvent(parent.id, "job_completed", "Carrossel consolidado.", { urls });
  }
}

function extractVideoUrl(data) {
  const payload = object(data);
  if (typeof payload.video_url === "string") return payload.video_url;
  if (typeof payload.url === "string") return payload.url;
  if (typeof payload.output === "string") return payload.output;
  if (Array.isArray(payload.output) && typeof payload.output[0] === "string") return payload.output[0];
  if (Array.isArray(payload.urls) && typeof payload.urls[0] === "string") return payload.urls[0];
  return "";
}

async function fetchVideoResult(initial) {
  let videoUrl = extractVideoUrl(initial);
  if (videoUrl) return { videoUrl, providerPayload: initial };

  const statusUrl = initial.status_url || (initial.job_id && env("VIDEO_PROVIDER_STATUS_URL") ? `${env("VIDEO_PROVIDER_STATUS_URL").replace(/\/$/, "")}/${initial.job_id}` : "");
  if (!statusUrl) throw new Error("Provedor de vídeo não retornou video_url nem status_url/job_id.");

  const timeoutAt = Date.now() + Number(env("VIDEO_PROVIDER_TIMEOUT_MINUTES", "35")) * 60_000;
  const pollMs = Number(env("VIDEO_PROVIDER_POLL_SECONDS", "20")) * 1000;
  let lastPayload = initial;
  while (Date.now() < timeoutAt) {
    await sleep(pollMs);
    const response = await fetch(statusUrl, { headers: { Authorization: `Bearer ${env("VIDEO_PROVIDER_API_KEY")}` } });
    lastPayload = await response.json().catch(() => ({}));
    videoUrl = extractVideoUrl(lastPayload);
    if (videoUrl) return { videoUrl, providerPayload: lastPayload };
    const status = String(lastPayload.status ?? lastPayload.state ?? "").toLowerCase();
    if (["failed", "error", "cancelled", "canceled"].includes(status)) throw new Error(`Provedor de vídeo falhou: ${JSON.stringify(lastPayload)}`);
  }
  throw new Error(`Timeout aguardando provedor de vídeo: ${JSON.stringify(lastPayload)}`);
}

async function downloadBytes(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar mídia: HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function processVideoJob(job) {
  const ctx = await loadPostContext(job.post_id, job.brand_id);
  const prompt = [
    "Crie um vídeo/Reels vertical premium para a MYINC Incorporadora.",
    `POST: ${compact(ctx.post.title ?? ctx.post.theme, 400)}`,
    `ROTEIRO/PROMPT EXISTENTE: ${compact(ctx.post.video_prompt ?? ctx.latestOutput.video_script ?? ctx.post.image_prompt ?? ctx.post.creative_brief, 1800)}`,
    `MEMÓRIA DA MARCA: ${compact(ctx.profile, 1200)}`,
    `REGRAS DA IA: ${compact(ctx.rules, 1200)}`,
    "Estilo: incorporadora de alto padrão, arquitetura contemporânea, luz natural, cidade, obra, detalhes construtivos, narração objetiva e CTA elegante.",
  ].join("\n");

  const apiUrl = env("VIDEO_PROVIDER_API_URL");
  const apiKey = env("VIDEO_PROVIDER_API_KEY");

  if (!apiUrl || !apiKey) {
    // Fallback honesto: cria capa premium e deixa storyboard pronto, sem travar a fila.
    await insertEvent(job.id, "video_provider_missing", "Provedor de vídeo ausente. Gerando capa/storyboard.", {});
    const { bytes, info } = await generateImageBytes(`${prompt}\nGerar uma CAPA premium vertical para este Reels, sem texto e sem logo.`, ctx.post.format);
    const { path, publicUrl } = await uploadBytes({ brandId: ctx.post.brand_id, postId: ctx.post.id, folder: "video-thumb", bytes, info });
    await createMediaAsset({ ctx, job, label: `Capa vídeo ${ctx.post.title}`, bytes, info, path, publicUrl, prompt, assetType: "video_thumbnail", isFinal: true });
    await supabase.from("posts").update({
      video_status: "provider_pendente",
      video_progress: 100,
      video_poster_url: publicUrl,
      media_url: ctx.post.media_url ?? publicUrl,
      status: "aguardando_revisao",
      error_message: "Vídeo real requer VIDEO_PROVIDER_API_URL e VIDEO_PROVIDER_API_KEY. Capa/storyboard gerados.",
      technical_detail: "Configure um provedor de vídeo para gerar MP4 real.",
      updated_at: nowIso(),
    }).eq("id", ctx.post.id);
    await updateJob(job.id, { status: "completed", progress: 100, result: { video_poster_url: publicUrl, provider_missing: true }, finished_at: nowIso() });
    return;
  }

  await insertEvent(job.id, "video_provider_requested", "Solicitando vídeo ao provedor externo.", { apiUrl });
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      prompt,
      script: ctx.post.video_prompt ?? ctx.latestOutput.video_script ?? null,
      duration_seconds: Number(env("VIDEO_DURATION_SECONDS", "8")),
      aspect_ratio: env("VIDEO_ASPECT_RATIO", "9:16"),
      post: ctx.post,
      brand_profile: ctx.profile,
    }),
  });
  const initial = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Provedor de vídeo HTTP ${response.status}: ${JSON.stringify(initial)}`);
  const { videoUrl, providerPayload } = await fetchVideoResult(initial);
  const bytes = await downloadBytes(videoUrl);
  const info = { mime: videoUrl.includes(".webm") ? "video/webm" : "video/mp4", ext: videoUrl.includes(".webm") ? "webm" : "mp4", width: 1080, height: 1920 };
  const { path, publicUrl } = await uploadBytes({ brandId: ctx.post.brand_id, postId: ctx.post.id, folder: "video", bytes, info });
  await createMediaAsset({ ctx, job, label: `Vídeo ${ctx.post.title}`, bytes, info, path, publicUrl, prompt, assetType: "video", isFinal: true });
  await supabase.from("posts").update({
    video_url: publicUrl,
    video_status: "completed",
    video_progress: 100,
    status: "aguardando_revisao",
    error_message: null,
    technical_detail: null,
    updated_at: nowIso(),
  }).eq("id", ctx.post.id);
  await updateJob(job.id, { status: "completed", progress: 100, result: { video_url: publicUrl, provider: providerPayload }, output_json: { video_url: publicUrl, provider: providerPayload }, finished_at: nowIso() });
}

async function failOrRetry(job, error) {
  const message = error instanceof Error ? error.message : String(error);
  const attempts = Number(job.attempt_count ?? 1);
  const maxAttempts = Number(job.max_attempts ?? 3);
  const shouldRetry = attempts < maxAttempts;
  const retryAt = new Date(Date.now() + RETRY_BASE_SECONDS * attempts * 1000).toISOString();
  await updateJob(job.id, {
    status: shouldRetry ? "retrying" : "failed",
    progress: shouldRetry ? 0 : Number(job.progress ?? 0),
    error_message: message,
    technical_detail: message,
    next_attempt_at: shouldRetry ? retryAt : null,
    finished_at: shouldRetry ? null : nowIso(),
  });
  await insertEvent(job.id, shouldRetry ? "job_retrying" : "job_failed", message, { attempts, maxAttempts, retryAt });
  if (!shouldRetry && job.post_id) {
    await supabase.from("posts").update({
      status: job.job_type === "video" ? "erro_video" : job.job_type === "carousel" || job.job_type === "carousel_page" ? "erro_carrossel" : "erro_imagem",
      error_message: message,
      technical_detail: message,
      updated_at: nowIso(),
    }).eq("id", job.post_id);
  }
}

async function handleJob(job) {
  await insertEvent(job.id, "worker_picked", `Worker ${WORKER_ID} iniciou o job.`, { job_type: job.job_type });
  await logSystem({ brand_id: job.brand_id, post_id: job.post_id, status: "info", friendly_message: `Worker processando ${job.job_type}.`, technical_detail: JSON.stringify({ job_id: job.id, worker: WORKER_ID }) });
  try {
    if (job.job_type === "carousel") await processCarouselParent(job);
    else if (job.job_type === "carousel_page") await processImageJob(job, object(job.payload).page);
    else if (job.job_type === "video") await processVideoJob(job);
    else await processImageJob(job);
  } catch (error) {
    console.error(`[${WORKER_ID}] erro no job ${job.id}`, error);
    await failOrRetry(job, error);
  }
}

async function claimJob() {
  const { data, error } = await supabase.rpc("claim_generation_job", { worker_id: WORKER_ID });
  if (error) throw error;
  return data;
}

async function mainLoop() {
  console.log(`[${WORKER_ID}] MYINC generation worker iniciado.`);
  while (true) {
    try {
      await consolidateWaitingCarousels();
      const job = await claimJob();
      if (!job?.id) {
        await sleep(IDLE_SLEEP_MS);
        continue;
      }
      await handleJob(job);
      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      console.error(`[${WORKER_ID}] erro no loop`, error);
      await sleep(IDLE_SLEEP_MS);
    }
  }
}

mainLoop().catch((error) => {
  console.error("Worker finalizado por erro fatal", error);
  process.exit(1);
});
