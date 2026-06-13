import { json } from "../_lib/env.js";
import { requireUserOrSecret } from "../_lib/auth.js";
import { first, insert, loadRuntimeConfig, patch, rest, rpc, selectOne } from "../_lib/supabase.js";
import { jobEvent, systemLog } from "../_lib/logs.js";
import { generateImageBytes, generateVideoOrThrow, imagePrompt, openAiJson, postImageSize, runtime } from "../_lib/openai.js";
import { uploadObject, verifyPublicUrl } from "../_lib/storage.js";

const WORKER_ID = process.env.WORKER_ID || "vercel-worker-one-job";

function isolatedBrandId(config) {
  return String(runtime(config, "WORKER_BRAND_ID", process.env.WORKER_BRAND_ID || process.env.DEFAULT_BRAND_ID || "")).trim();
}

async function lockNextJobFallback(config) {
  const now = encodeURIComponent(new Date().toISOString());
  const brandId = isolatedBrandId(config);
  const rows = await rest([
    "generation_jobs?select=*",
    "status=in.(queued,retrying,pending)",
    `or=(next_attempt_at.is.null,next_attempt_at.lte.${now})`,
    brandId ? `brand_id=eq.${encodeURIComponent(brandId)}` : "",
    "order=priority.asc,created_at.asc",
    "limit=1"
  ].filter(Boolean).join("&"));
  const job = first(rows);
  if (!job) return null;
  return patch("generation_jobs", `id=eq.${job.id}&status=in.(queued,retrying,pending)`, {
    status: "processing",
    progress: 5,
    locked_by: WORKER_ID,
    locked_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
    attempt_count: Number(job.attempt_count || 0) + 1,
    updated_at: new Date().toISOString()
  });
}

async function lockNextJob(config) {
  const brandId = isolatedBrandId(config);
  try {
    const payload = brandId ? { worker_id: WORKER_ID, p_brand_id: brandId } : { worker_id: WORKER_ID };
    return first(await rpc("claim_generation_job", payload));
  } catch (error) {
    await systemLog({ module: "process-next", status: "warning", message: "RPC claim_generation_job indisponível; usando fallback REST.", detail: error?.message || String(error) });
    return lockNextJobFallback(config);
  }
}

async function getPost(postId) {
  const post = await selectOne("posts", `select=*&id=eq.${encodeURIComponent(postId)}&limit=1`);
  if (!post) throw Object.assign(new Error("Post não encontrado para o job."), { code: "post_not_found" });
  return post;
}

async function brandContext(brandId) {
  if (!brandId) return {};
  const [profile, rules, prompts, refs, visualRules] = await Promise.all([
    selectOne("brand_profiles", `select=*&brand_id=eq.${brandId}&limit=1`).catch(() => null),
    rest(`ai_brain_rules?select=category,content,priority&brand_id=eq.${brandId}&active=eq.true&order=priority.asc&limit=20`).catch(() => []),
    rest(`ai_prompt_templates?select=name,content&brand_id=eq.${brandId}&active=eq.true&limit=12`).catch(() => []),
    rest(`library_items?select=name,notes,ai_usage_rule,url,status,item_type&brand_id=eq.${brandId}&ai_allowed=eq.true&limit=20`).catch(() => []),
    rest(`brand_visual_rules?select=rule_type,content&brand_id=eq.${brandId}&active=eq.true&limit=20`).catch(() => [])
  ]);
  return { profile, rules, prompts, references: refs, visualRules };
}

async function processContent(config, job, post) {
  await patch("posts", `id=eq.${post.id}`, { status: "gerando_copy", updated_at: new Date().toISOString() });
  const context = await brandContext(post.brand_id);
  const payload = await openAiJson(config, [
    { role: "system", content: "Você é um social media sênior premium para incorporadoras brasileiras. Responda somente JSON válido." },
    { role: "user", content: [
      "Crie copy final e briefing criativo para a MYINC.",
      "Obrigatório: português do Brasil, sem promessas absolutas de valorização, sem exageros jurídicos, tom premium, elegante e comercial.",
      "Retorne JSON com: title, headline, caption, hashtags(array), cta, image_prompt, creative_brief, master_prompt, quality_score, quality_review, carousel_pages(array opcional), video_script(opcional).",
      `Post: ${JSON.stringify(post).slice(0, 2600)}`,
      `Contexto da marca: ${JSON.stringify(context).slice(0, 5200)}`,
      `Instrução do job: ${JSON.stringify(job.input_json || {})}`
    ].join("\n") }
  ]);
  const quality = Math.max(0, Math.min(100, Number(payload.quality_score || 90)));
  const row = {
    title: payload.title || post.title,
    headline: payload.headline || post.headline,
    caption: payload.caption || post.caption,
    hashtags: Array.isArray(payload.hashtags) ? payload.hashtags : post.hashtags,
    cta: payload.cta || post.cta,
    image_prompt: payload.image_prompt || post.image_prompt,
    creative_brief: payload.creative_brief || post.creative_brief,
    master_prompt: payload.master_prompt || post.master_prompt,
    quality_score: quality,
    quality_review: payload.quality_review || { overall_score: quality },
    carousel_pages: Array.isArray(payload.carousel_pages) ? payload.carousel_pages : post.carousel_pages,
    video_prompt: payload.video_script ? JSON.stringify(payload.video_script, null, 2) : post.video_prompt,
    status: "copy_gerada",
    error_message: null,
    technical_detail: "Copy gerada pelo Worker Vercel.",
    updated_at: new Date().toISOString()
  };
  const updated = await patch("posts", `id=eq.${post.id}`, row);
  await insert("post_versions", { brand_id: post.brand_id, post_id: post.id, version_label: `COPY-${Date.now()}`, caption: row.caption, image_prompt: row.image_prompt, quality_score: quality, output_json: payload, is_current: true, created_at: new Date().toISOString() });
  return updated;
}

async function createImageAsset(config, post, prompt, meta = {}) {
  const generation = await generateImageBytes(config, prompt, postImageSize(config, post.format));
  const kind = meta.kind || "image";
  const path = `${post.brand_id || "brand"}/${post.id}/${kind}-${crypto.randomUUID()}.png`;
  const publicUrl = await uploadObject({ config, path, bytes: generation.bytes, contentType: "image/png" });
  const publicOk = await verifyPublicUrl(publicUrl);
  if (!publicOk) throw new Error(`URL pública do Storage não respondeu: ${publicUrl}`);
  const asset = await insert("media_assets", {
    brand_id: post.brand_id,
    post_id: post.id,
    name: meta.name || `Imagem premium ${post.title || "MYINC"}`,
    type: meta.type || "Imagem gerada",
    media_type: meta.media_type || meta.type || "Imagem gerada",
    bucket: runtime(config, "MEDIA_BUCKET", "creative-media"),
    path,
    url: publicUrl,
    public_url: publicUrl,
    preview_url: publicUrl,
    mime_type: "image/png",
    size_bytes: generation.bytes.length,
    status: "ativo",
    tags: meta.tags || ["ia", "myinc", "vercel"],
    origin: `openai:${generation.model}`,
    usage_context: meta.usage_context || "post_image",
    ai_allowed: true,
    storage_bucket: runtime(config, "MEDIA_BUCKET", "creative-media"),
    storage_path: path,
    is_final: true,
    notes: prompt,
    metadata: { image_model: generation.model, image_quality: generation.quality, image_size: generation.size, ...meta.metadata },
    created_at: new Date().toISOString()
  });
  return { asset, publicUrl, generation };
}

async function processImage(config, job, post) {
  await patch("posts", `id=eq.${post.id}`, { status: "gerando_imagem", updated_at: new Date().toISOString() });
  const context = await brandContext(post.brand_id);
  const prompt = imagePrompt(post, context);
  const out = await createImageAsset(config, post, prompt);
  const updated = await patch("posts", `id=eq.${post.id}`, {
    media_url: out.publicUrl,
    status: "aguardando_revisao",
    error_message: null,
    technical_detail: `Imagem gerada na Vercel: ${out.generation.model}/${out.generation.size}.`,
    updated_at: new Date().toISOString()
  });
  await insert("post_versions", { brand_id: post.brand_id, post_id: post.id, version_label: `IMAGE-${Date.now()}`, caption: post.caption, image_prompt: prompt, media_url: out.publicUrl, output_json: { media_url: out.publicUrl, asset_id: out.asset?.id, model: out.generation.model }, is_current: true, created_at: new Date().toISOString() });
  return updated;
}

function mergeUnique(list, value) {
  return [...new Set([...(Array.isArray(list) ? list : []), value].filter(Boolean))];
}

async function processCarouselPage(config, job, post) {
  const input = job.input_json || {};
  const page = Number(input.page || 1);
  const total = Number(input.total_pages || input.totalPages || 5);
  await patch("posts", `id=eq.${post.id}`, { status: "gerando_carrossel", updated_at: new Date().toISOString() });
  const context = await brandContext(post.brand_id);
  const prompt = imagePrompt(post, context, `Esta é a página ${page} de ${total} de um carrossel premium. Criar variação visual coerente com a narrativa, SEM texto.`);
  const out = await createImageAsset(config, post, prompt, { kind: `carousel-p${page}`, type: "Carrossel", usage_context: "carousel_page", name: `Carrossel página ${page} - ${post.title}`, tags: ["ia", "myinc", "carousel", `page-${page}`], metadata: { page, total_pages: total } });
  const urls = mergeUnique(post.carousel_media_urls, out.publicUrl);
  const done = urls.length >= total;
  const updated = await patch("posts", `id=eq.${post.id}`, { carousel_media_urls: urls, media_url: urls[0] || out.publicUrl, status: done ? "aguardando_revisao" : "gerando_carrossel", technical_detail: `Carrossel ${urls.length}/${total}.`, updated_at: new Date().toISOString() });
  await insert("post_versions", { brand_id: post.brand_id, post_id: post.id, version_label: `CAROUSEL-P${page}-${Date.now()}`, caption: post.caption, image_prompt: prompt, media_url: out.publicUrl, output_json: { media_url: out.publicUrl, asset_id: out.asset?.id, page, total_pages: total }, is_current: done, created_at: new Date().toISOString() });
  return updated;
}

async function processVideo(config, job, post) {
  await patch("posts", `id=eq.${post.id}`, { status: "gerando_video", updated_at: new Date().toISOString() });
  const context = await brandContext(post.brand_id);
  const started = await generateVideoOrThrow(config, post, context);
  if (started.data?.video_url || started.data?.url) {
    const videoUrl = started.data.video_url || started.data.url;
    const updated = await patch("posts", `id=eq.${post.id}`, { video_url: videoUrl, media_url: videoUrl, status: "aguardando_revisao", technical_detail: "Vídeo gerado pelo provedor configurado.", updated_at: new Date().toISOString() });
    return updated;
  }
  const providerJobId = started.data?.id || started.data?.job_id || started.data?.provider_job_id;
  if (providerJobId) {
    await patch("generation_jobs", `id=eq.${job.id}`, { provider_job_id: providerJobId, status: "queued", next_attempt_at: new Date(Date.now() + 60000).toISOString(), technical_detail: "Vídeo iniciado no provedor; aguardando próxima consulta.", updated_at: new Date().toISOString() });
    return { pending: true, providerJobId };
  }
  throw Object.assign(new Error("Provedor de vídeo não retornou url nem job id."), { providerResponse: started.data });
}

async function complete(job, result) {
  await patch("generation_jobs", `id=eq.${job.id}`, { status: "completed", progress: 100, output_json: result, result, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_message: null, error_code: null, technical_detail: null });
  await jobEvent(job.id, "job_completed", "Job concluído pelo worker Vercel.", { result_id: result?.id || null });
}

async function fail(job, error) {
  const attempt = Number(job.attempt_count || 1);
  const max = Number(job.max_attempts || 3);
  const detail = error?.message || String(error);
  const code = error?.code || "worker_error";
  const providerResponse = error?.providerResponse || error?.details || null;
  if (attempt >= max) {
    await patch("generation_jobs", `id=eq.${job.id}`, { status: "failed", progress: 100, error_message: detail, error_code: code, provider_response: providerResponse, technical_detail: detail, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (job.post_id) await patch("posts", `id=eq.${job.post_id}`, { status: "erro_ia", error_message: detail, technical_detail: detail, updated_at: new Date().toISOString() });
    await jobEvent(job.id, "job_failed", "Job falhou definitivamente.", { code, detail, providerResponse });
  } else {
    await patch("generation_jobs", `id=eq.${job.id}`, { status: "queued", progress: 0, error_message: detail, error_code: code, provider_response: providerResponse, technical_detail: detail, next_attempt_at: new Date(Date.now() + Math.min(900000, attempt * 60000)).toISOString(), updated_at: new Date().toISOString() });
    await jobEvent(job.id, "job_requeued", "Job falhou e foi reagendado.", { attempt, max, code, detail });
  }
}

async function runJob(config, job) {
  const post = await getPost(job.post_id);
  const type = String(job.job_type || job.type || "content");
  await jobEvent(job.id, "job_started", `Processando ${type}.`, { post_id: post.id });
  await patch("generation_jobs", `id=eq.${job.id}`, { progress: 15, updated_at: new Date().toISOString() });
  let result;
  if (type === "content") result = await processContent(config, job, post);
  else if (type === "image") result = await processImage(config, job, post);
  else if (type === "carousel_page") result = await processCarouselPage(config, job, post);
  else if (type === "video") result = await processVideo(config, job, post);
  else throw Object.assign(new Error(`Tipo de job não suportado: ${type}`), { code: "unsupported_job_type" });
  if (result?.pending) return result;
  await complete(job, result);
  await systemLog({ module: "process-next", status: "sucesso", message: "Job processado na Vercel.", detail: `job=${job.id}; type=${type}`, brand_id: post.brand_id, post_id: post.id });
  return result;
}

export default async function handler(req, res) {
  if (!["POST", "GET"].includes(req.method)) return json(res, 405, { ok: false, error: "method_not_allowed" });
  const started = Date.now();
  try {
    await requireUserOrSecret(req);
    if (req.method === "GET") return json(res, 200, { ok: true, worker: WORKER_ID, oneJobPerRequest: true });
    const config = await loadRuntimeConfig();
    const job = await lockNextJob(config);
    if (!job) return json(res, 200, { ok: true, processed: 0, job: null, isolatedBrandId: isolatedBrandId(config) || null, message: "Fila vazia.", ms: Date.now() - started });
    try {
      const result = await runJob(config, job);
      if (result?.pending) return json(res, 200, { ok: true, processed: 1, job, pending: true, result, message: "Job iniciado e reagendado para próxima consulta.", ms: Date.now() - started });
      return json(res, 200, { ok: true, processed: 1, job, result, message: "1 job processado com sucesso.", ms: Date.now() - started });
    } catch (error) {
      await fail(job, error);
      await systemLog({ module: "process-next", status: "erro", message: "Falha ao processar job.", detail: error?.message || String(error), post_id: job.post_id, brand_id: job.brand_id });
      return json(res, 200, { ok: false, processed: 1, job, error: error?.message || String(error), code: error?.code || null, retry: Number(job.attempt_count || 1) < Number(job.max_attempts || 3), ms: Date.now() - started });
    }
  } catch (error) {
    return json(res, error?.statusCode || 500, { ok: false, processed: 0, error: error?.message || String(error), code: error?.code || null, ms: Date.now() - started });
  }
}
