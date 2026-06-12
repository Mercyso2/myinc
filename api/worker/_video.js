function env(key, fallback = "") {
  const value = process.env[key];
  return value === undefined || value === null || String(value).trim() === "" ? fallback : String(value).trim();
}

function boolEnv(key, fallback = "false") {
  return ["1", "true", "yes", "sim", "on", "enabled", "ativo"].includes(env(key, fallback).toLowerCase());
}

export function videoEnabled() {
  return boolEnv("ENABLE_OPENAI_VIDEO") || boolEnv("ENABLE_VIDEO_WORKER");
}

export function videoProvider() {
  return env("VIDEO_PROVIDER", "openai").toLowerCase();
}

export function videoPrompt({ post, contextText }) {
  return [
    "Video/Reels vertical premium para MYINC Incorporadora, arquitetura contemporanea brasileira de alto padrao.",
    `Tema: ${post.title || post.theme || post.headline || "MYINC"}.`,
    `Roteiro/brief: ${post.video_prompt || post.master_prompt || post.creative_brief || post.image_prompt || post.caption || "reveal de arquitetura premium"}.`,
    "5 a 7 cenas conectadas, abertura forte, camera suave, luz natural, ritmo sofisticado, camera de arquitetura profissional.",
    "Evitar visual estatico, slideshow simples, pessoas deformadas, logo falso, watermark, texto quebrado, letras aleatorias e numeros.",
    "Sem texto renderizado no video; qualquer copy final deve ser aplicada pelo app/editor depois.",
    `Contexto: ${contextText}`,
  ].join("\n");
}

function assertOpenAiVideoAvailable() {
  if (videoProvider() !== "openai") {
    throw new Error(`VIDEO_PROVIDER=${videoProvider()} ainda nao tem adaptador implementado no worker.`);
  }
  if (!videoEnabled()) {
    throw new Error("Video desativado. Configure ENABLE_OPENAI_VIDEO=true ou ENABLE_VIDEO_WORKER=true na Vercel.");
  }
}

async function parseVideoResponse(response, context) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = JSON.stringify(data.error || data).slice(0, 1400);
    throw new Error(`${context}: ${detail}`);
  }
  return data;
}

export async function startVideoJob({ apiKey, post, contextText }) {
  assertOpenAiVideoAvailable();

  const form = new FormData();
  const model = env("OPENAI_VIDEO_MODEL", "sora-2-pro");
  form.append("model", model);
  form.append("prompt", videoPrompt({ post, contextText }));
  form.append("size", env("OPENAI_VIDEO_SIZE", "1080x1920"));
  form.append("seconds", env("OPENAI_VIDEO_SECONDS", "12"));

  const response = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const data = await parseVideoResponse(response, "OpenAI video start");
  if (!data.id) throw new Error(`OpenAI video start nao retornou id: ${JSON.stringify(data).slice(0, 1000)}`);
  return { id: data.id, status: data.status || "queued", progress: data.progress || 0, model };
}

export async function pollVideoJob({ apiKey, videoId }) {
  assertOpenAiVideoAvailable();

  const response = await fetch(`https://api.openai.com/v1/videos/${videoId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return parseVideoResponse(response, "OpenAI video poll");
}

export async function downloadVideoBytes({ apiKey, videoId }) {
  assertOpenAiVideoAvailable();

  const response = await fetch(`https://api.openai.com/v1/videos/${videoId}/content`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`Falha ao baixar MP4: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
