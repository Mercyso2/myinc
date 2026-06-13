import { short } from "./env.js";

export function runtime(config, key, fallback = "") {
  const value = config?.[key];
  return value === undefined || value === null || String(value).trim() === "" ? fallback : String(value).trim();
}

export function requireRuntime(config, key) {
  const value = runtime(config, key);
  if (!value) throw Object.assign(new Error(`${key} ausente no Painel ADM/runtime_secrets.`), { code: "missing_runtime_secret" });
  return value;
}

export async function openAiJson(config, messages) {
  const apiKey = requireRuntime(config, "OPENAI_API_KEY");
  const model = runtime(config, "OPENAI_TEXT_MODEL", "gpt-4.1");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, response_format: { type: "json_object" }, messages })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`OpenAI texto ${response.status}: ${short(data.error || data)}`), { providerResponse: data });
  const raw = data?.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(raw); }
  catch {
    const start = raw.indexOf("{"); const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("OpenAI texto não retornou JSON válido.");
  }
}

export function postImageSize(config, format = "") {
  const f = String(format).toLowerCase();
  if (runtime(config, "OPENAI_IMAGE_SIZE")) return runtime(config, "OPENAI_IMAGE_SIZE");
  if (f.includes("story") || f.includes("stories") || f.includes("reels") || f.includes("vídeo") || f.includes("video")) return runtime(config, "OPENAI_IMAGE_SIZE_STORY", "1024x1536");
  if (f.includes("quadrado") || f.includes("square")) return runtime(config, "OPENAI_IMAGE_SIZE_SQUARE", "1024x1024");
  if (f.includes("facebook")) return runtime(config, "OPENAI_IMAGE_SIZE_FACEBOOK", "1536x1024");
  return runtime(config, "OPENAI_IMAGE_SIZE_FEED", "1024x1536");
}

export function imageModelCandidates(config) {
  const primary = runtime(config, "OPENAI_IMAGE_MODEL", "gpt-image-1");
  const fallback = runtime(config, "OPENAI_IMAGE_FALLBACK_MODELS", "gpt-image-1").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([primary, ...fallback])];
}

export function imagePrompt(post, context, extra = "") {
  return [
    "CRIE UMA ARTE BASE PREMIUM PARA SOCIAL MEDIA DA MYINC INCORPORADORA.",
    "Obrigatório: imagem sem texto, sem logotipo, sem letras, sem números, sem watermark e sem marca falsa.",
    "A imagem deve parecer campanha real de incorporadora de alto padrão, com direção de arte editorial, arquitetura brasileira contemporânea, materiais nobres, paisagismo e luz cinematográfica.",
    "Composição com área segura para aplicar headline, CTA e logo depois no app. Não gerar card pronto com tipografia.",
    `FORMATO: ${post.format || "Feed/Stories"}.`,
    `TEMA: ${post.title || post.theme || post.headline || "MYINC"}.`,
    `BRIEF: ${post.image_prompt || post.creative_brief || post.caption || "empreendimento premium"}.`,
    `OBJETIVO: ${post.objective || "autoridade, desejo e lead qualificado"}.`,
    "PALETA: grafite profundo, off-white, areia, madeira natural, verde paisagismo e cobre/dourado discreto.",
    "NEGATIVE PROMPT: texto, letras, números, logo falso, watermark, panfleto barato, template genérico, baixa resolução, geometria impossível, pessoas deformadas, render artificial.",
    `MEMÓRIA DA MARCA: ${short(context, 3600)}.`,
    extra
  ].filter(Boolean).join("\n");
}

async function bytesFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao baixar imagem OpenAI: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function generateImageBytes(config, prompt, size) {
  const apiKey = requireRuntime(config, "OPENAI_API_KEY");
  const qualityCandidates = [...new Set([runtime(config, "OPENAI_IMAGE_QUALITY", "high"), "medium", "auto"].filter(Boolean))];
  const errors = [];
  for (const model of imageModelCandidates(config)) {
    for (const quality of qualityCandidates) {
      const base = { model, prompt, size, n: 1, quality };
      const bodies = [{ ...base, output_format: runtime(config, "OPENAI_IMAGE_FORMAT", "png") }, base];
      for (const body of bodies) {
        const response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        const encoded = data?.data?.[0]?.b64_json;
        const imageUrl = data?.data?.[0]?.url;
        if (response.ok && (encoded || imageUrl)) {
          const bytes = encoded ? Buffer.from(encoded, "base64") : await bytesFromUrl(imageUrl);
          if (bytes.length < 50000) { errors.push(`${model}/${quality}/${size}: imagem pequena (${bytes.length})`); continue; }
          return { bytes, model, quality, size, providerResponse: { model, quality, size } };
        }
        errors.push(`${model}/${quality}/${size}: HTTP ${response.status} ${short(data.error || data, 600)}`);
      }
    }
  }
  throw Object.assign(new Error(`Nenhum modelo de imagem retornou arte válida. ${errors.join(" | ")}`), { providerResponse: { errors } });
}

export async function generateVideoOrThrow(config, post, context) {
  const endpoint = runtime(config, "OPENAI_VIDEO_ENDPOINT");
  if (!endpoint) throw Object.assign(new Error("Vídeo real não configurado. Defina OPENAI_VIDEO_ENDPOINT no Painel ADM para conectar o provedor de vídeo contratado."), { code: "video_provider_missing" });
  const apiKey = requireRuntime(config, "OPENAI_API_KEY");
  const prompt = [`Vídeo/Reels premium MYINC, vertical, sem texto/logos gerados pela IA.`, `Post: ${short(post, 1800)}`, `Contexto: ${short(context, 1800)}`].join("\n");
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: runtime(config, "OPENAI_VIDEO_MODEL"), prompt, size: runtime(config, "OPENAI_VIDEO_SIZE", "1080x1920"), seconds: Number(runtime(config, "OPENAI_VIDEO_SECONDS", "8")) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`Provedor de vídeo ${response.status}: ${short(data.error || data)}`), { providerResponse: data });
  return { data, prompt };
}
