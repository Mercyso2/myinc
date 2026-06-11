export function videoEnabled() {
  return String(process.env.ENABLE_VIDEO_WORKER || "false").toLowerCase() === "true";
}

export function videoPrompt({ post, contextText }) {
  return [
    "Video/Reels vertical premium para MYINC Incorporadora, arquitetura contemporanea brasileira de alto padrao.",
    `Tema: ${post.title || post.theme || post.headline || "MYINC"}.`,
    `Roteiro/brief: ${post.video_prompt || post.master_prompt || post.creative_brief || post.image_prompt || post.caption || "reveal de arquitetura premium"}.`,
    "5 a 7 cenas conectadas, abertura forte, camera suave, luz natural, ritmo sofisticado.",
    "Evitar visual estatico, slideshow simples, pessoas deformadas, logo falso, watermark e textos quebrados.",
    `Contexto: ${contextText}`,
  ].join("\n");
}

export async function startVideoJob({ apiKey, post, contextText }) {
  const form = new FormData();
  const model = process.env.OPENAI_VIDEO_MODEL || "sora-2-pro";
  form.append("model", model);
  form.append("prompt", videoPrompt({ post, contextText }));
  form.append("size", process.env.OPENAI_VIDEO_SIZE || "1080x1920");
  form.append("seconds", process.env.OPENAI_VIDEO_SECONDS || "12");

  const response = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error(`OpenAI video start: ${JSON.stringify(data.error || data).slice(0, 1000)}`);
  return { id: data.id, status: data.status || "queued", progress: data.progress || 0, model };
}

export async function pollVideoJob({ apiKey, videoId }) {
  const response = await fetch(`https://api.openai.com/v1/videos/${videoId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI video poll: ${JSON.stringify(data.error || data).slice(0, 1000)}`);
  return data;
}

export async function downloadVideoBytes({ apiKey, videoId }) {
  const response = await fetch(`https://api.openai.com/v1/videos/${videoId}/content`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`Falha ao baixar MP4: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
