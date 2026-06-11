const env = (name, fallback = "") => process.env[name] || fallback;
const required = (name) => {
  const value = env(name);
  if (!value) throw new Error(`${name} ausente na Vercel Function.`);
  return value;
};

const SUPABASE_URL = required("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_API_KEY = required("OPENAI_API_KEY");
const MEDIA_BUCKET = env("MEDIA_BUCKET", "creative-media");
const WORKER_ID = env("WORKER_ID", "vercel-ai-worker");
const MAX_ATTEMPTS = Number(env("WORKER_MAX_ATTEMPTS", "3"));
const MAX_JOBS = Math.max(1, Math.min(3, Number(env("VERCEL_WORKER_MAX_JOBS", "1"))));

function text(value, max = 1200) {
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
  if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${text(json || body)}`);
  return json;
}

async function insert(table, row) {
  const result = await rest(table, { method: "POST", body: JSON.stringify(row) });
  return Array.isArray(result) ? result[0] : result;
}

async function update(table, query, patch) {
  const result = await rest(`${table}?${query}`, { method: "PATCH", body: JSON.stringify(patch) });
  return Array.isArray(result) ? result[0] : result;
}

async function selectOne(table, query) {
  const result = await rest(`${table}?${query}`);
  return Array.isArray(result) ? result[0] : result;
}

async function uploadObject(bucket, path, bytes, contentType) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
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
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

async function log(row) {
  try {
    await insert("system_logs", {
      module: "vercel-ai-worker",
      type: "worker",
      status: row.status || "info",
      friendly_message: row.message || "Evento do worker Vercel.",
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
  return update("generation_jobs", `id=eq.${job.id}&status=eq.queued`, {
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
  if (!response.ok) throw new Error(`OpenAI texto: ${text(data.error || data)}`);
  return JSON.parse(data.choices?.[0]?.message?.content || "{}");
}

async function processContent(job, post) {
  const ctx = await brandContext(post.brand_id);
  const payload = await openAiJson([
    { role: "system", content: "Voce e um social media senior premium para incorporadoras. Responda somente JSON valido." },
    { role: "user", content: ["Crie copy final para post MYINC.", `Post: ${text(post, 2200)}`, `Contexto da marca: ${text(ctx, 3200)}`, "Retorne JSON com title, headline, caption, hashtags, cta, image_prompt, creative_brief e quality_score."].join("\n") },
  ]);
  const patch = {
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
  const updated = await update("posts", `id=eq.${post.id}`, patch);
  await insert("post_versions", { brand_id: post.brand_id, post_id: post.id, version_label: `VERCEL-COPY-${Date.now()}`, caption: patch.caption, image_prompt: patch.image_prompt, quality_score: patch.quality_score, is_current: true, output_json: payload });
  return updated;
}

function imageSize(format = "") {
  const explicit = env("OPENAI_IMAGE_SIZE", "");
  if (explicit) return explicit;
  const f = String(format).toLowerCase();
  if (f.includes("story") || f.includes("reels") || f.includes("video")) return "1024x1536";
  return "1024x1024";
}

async function processImage(job, post) {
  const ctx = await brandContext(post.brand_id);
  const prompt = ["Imagem premium para social media da MYINC incorporadora.", "Arquitetura brasileira contemporanea, alto padrao, fundo claro/off-white/areia, luz natural, sofisticacao limpa.", "Sem texto, sem logo, sem letras, sem numeros, sem watermark.", `Formato: ${post.format || "Feed"}.`, `Tema: ${post.title || post.theme || "MYINC"}.`, `Brief: ${post.image_prompt || post.creative_brief || post.caption || "empreendimento premium"}.`, `Contexto: ${text(ctx, 2200)}`].join("\n");
  const model = env("OPENAI_IMAGE_MODEL", "gpt-image-1-mini");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, size: imageSize(post.format), n: 1, quality: env("OPENAI_IMAGE_QUALITY", "medium") }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI imagem: ${text(data.error || data)}`);
  const encoded = data?.data?.[0]?.b64_json;
  const imageUrl = data?.data?.[0]?.url;
  const bytes = encoded ? Buffer.from(encoded, "base64") : Buffer.from(await (await fetch(imageUrl)).arrayBuffer());
  if (bytes.length < 20000) throw new Error(`Imagem pequena demais: ${bytes.length} bytes.`);
  const path = `${post.brand_id}/${post.id}/vercel-${crypto.randomUUID()}.png`;
  const publicUrl = await uploadObject(MEDIA_BUCKET, path, bytes, "image/png");
  const asset = await insert("media_assets", { brand_id: post.brand_id, post_id: post.id, name: `Imagem Vercel ${post.title || "MYINC"}`, type: "Imagem gerada", media_type: "Imagem gerada", bucket: MEDIA_BUCKET, path, url: publicUrl, public_url: publicUrl, preview_url: publicUrl, mime_type: "image/png", size_bytes: bytes.length, status: "ativo", tags: ["ia", "myinc", "vercel-worker"], origin: `vercel-worker:${model}`, usage_context: "post_image", ai_allowed: true, storage_bucket: MEDIA_BUCKET, storage_path: path, is_final: true, notes: prompt, metadata: { image_model: model, source: "vercel-worker" } });
  const updated = await update("posts", `id=eq.${post.id}`, { media_url: publicUrl, status: "aguardando_revisao", error_message: null, technical_detail: null, updated_at: new Date().toISOString() });
  await insert("post_versions", { brand_id: post.brand_id, post_id: post.id, version_label: `VERCEL-IMAGE-${Date.now()}`, caption: post.caption, image_prompt: prompt, media_url: publicUrl, is_current: true, output_json: { media_url: publicUrl, asset_id: asset?.id, image_model: model } });
  return updated;
}

async function complete(job, result) {
  await update("generation_jobs", `id=eq.${job.id}`, { status: "completed", progress: 100, result, output_json: result, finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_message: null, technical_detail: null });
}

async function fail(job, error) {
  const detail = error?.message || String(error);
  const attempt = Number(job.attempt_count || 1);
  const max = Number(job.max_attempts || MAX_ATTEMPTS);
  if (attempt >= max) {
    await update("generation_jobs", `id=eq.${job.id}`, { status: "failed", progress: 100, error_message: detail, technical_detail: detail, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (job.post_id) await update("posts", `id=eq.${job.post_id}`, { status: "erro_ia", error_message: "Falha definitiva no worker Vercel.", technical_detail: detail, updated_at: new Date().toISOString() });
  } else {
    await update("generation_jobs", `id=eq.${job.id}`, { status: "queued", progress: 0, error_message: detail, technical_detail: detail, next_attempt_at: new Date(Date.now() + Math.min(900000, attempt * 60000)).toISOString(), updated_at: new Date().toISOString() });
  }
}

async function processJob(job) {
  const post = await getPost(job.post_id);
  const type = String(job.job_type || job.type || "content");
  await update("generation_jobs", `id=eq.${job.id}`, { progress: 15, updated_at: new Date().toISOString() });
  let result;
  if (type === "content") result = await processContent(job, post);
  else if (type === "image" || type === "carousel_page") result = await processImage(job, post);
  else if (type === "video") throw new Error("Video ainda nao habilitado no worker Vercel.");
  else throw new Error(`Tipo de job nao suportado: ${type}`);
  await complete(job, result);
  await log({ status: "sucesso", message: "Job processado pela Vercel Function.", detail: `job=${job.id}; type=${type}`, brand_id: post.brand_id, post_id: post.id });
}

export default async function handler(req, res) {
  const secret = env("CRON_SECRET", "");
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const started = Date.now();
  let processed = 0;
  const errors = [];
  for (let i = 0; i < MAX_JOBS; i++) {
    const job = await lockNextJob();
    if (!job) break;
    try {
      await processJob(job);
      processed++;
    } catch (error) {
      await fail(job, error);
      errors.push(error?.message || String(error));
      await log({ status: "erro", message: "Falha no worker Vercel.", detail: `job=${job.id}; error=${error?.message || String(error)}`, post_id: job.post_id });
    }
  }
  return res.status(200).json({ ok: true, processed, errors, ms: Date.now() - started });
}
