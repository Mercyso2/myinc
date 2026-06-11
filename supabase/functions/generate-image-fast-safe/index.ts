import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stringifyError } from "../_shared/function-utils.ts";
import { cfg, getCorsHeaders, loadRuntimeConfig, requiredCfg } from "../_shared/runtime-config.ts";

type Row = Record<string, unknown>;
type Runtime = Record<string, string | null>;

function json(req: Request, body: unknown, status = 200, runtime: Runtime = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...getCorsHeaders(req, runtime), "Content-Type": "application/json" } });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente no backend.`);
  return value;
}

function obj(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function clip(value: unknown, max = 900) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function sizeFor(format: string, runtime: Runtime) {
  const explicit = cfg(runtime, "OPENAI_IMAGE_FAST_SIZE", "");
  if (explicit) return explicit;
  const value = format.toLowerCase();
  if (value.includes("story") || value.includes("reels") || value.includes("video") || value.includes("vídeo")) return "1024x1536";
  return "1024x1024";
}

function pngInfo(bytes: Uint8Array) {
  const png = bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { mime: png ? "image/png" : "", width: png ? view.getUint32(16) : 0, height: png ? view.getUint32(20) : 0 };
}

async function generateBytes(openAiKey: string, runtime: Runtime, prompt: string, size: string) {
  const controller = new AbortController();
  const timeoutMs = Math.max(30000, Math.min(120000, Number(cfg(runtime, "OPENAI_IMAGE_TIMEOUT_MS", "110000"))));
  const timer = setTimeout(() => controller.abort("OPENAI_IMAGE_TIMEOUT_BEFORE_SUPABASE_IDLE"), timeoutMs);
  try {
    const model = cfg(runtime, "OPENAI_IMAGE_FAST_MODEL", cfg(runtime, "OPENAI_IMAGE_MODEL", "gpt-image-1-mini"));
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        size,
        output_format: "png",
        quality: cfg(runtime, "OPENAI_IMAGE_FAST_QUALITY", "medium"),
        n: 1,
      }),
    });
    const data = await response.json().catch(() => ({}));
    const encoded = obj(Array.isArray(obj(data).data) ? obj(data).data[0] : {}).b64_json;
    if (!response.ok || typeof encoded !== "string" || !encoded) throw new Error(`OpenAI imagem HTTP ${response.status}: ${stringifyError(obj(data).error ?? data)}`);
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    const info = pngInfo(bytes);
    if (info.mime !== "image/png") throw new Error("Imagem retornada nao e PNG valido.");
    if (bytes.byteLength < 60000) throw new Error(`Imagem pequena demais: ${bytes.byteLength} bytes.`);
    return { bytes, info, model };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Geracao de imagem excedeu ${timeoutMs}ms. A tarefa foi abortada antes do idle timeout do Supabase.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const runtime = await loadRuntimeConfig(supabase);
  const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Imagem fast-safe");
  let postId = "";

  try {
    const body = await req.json().catch(() => ({}));
    postId = String(body.postId ?? "");
    if (!postId) return json(req, { ok: false, error: "postId e obrigatorio." }, 400, runtime);

    const { data: post, error: postError } = await supabase.from("posts").select("*").eq("id", postId).single();
    if (postError || !post) throw postError ?? new Error("Post nao encontrado.");
    const brandId = String(post.brand_id);

    const [profile, refs] = await Promise.all([
      supabase.from("brand_profiles").select("primary_palette,secondary_palette,preferred_visual_style,composition_rules,image_text_rules,mantra").eq("brand_id", brandId).maybeSingle(),
      supabase.from("library_items").select("name,notes,ai_usage_rule").eq("brand_id", brandId).is("archived_at", null).limit(3),
    ]);

    const format = String(post.format ?? "Feed 1080x1350");
    const size = sizeFor(format, runtime);
    const prompt = [
      "Imagem premium para social media da MYINC incorporadora.",
      "Estilo: arquitetura brasileira contemporanea, alto padrao, fundo claro/lite, branco/off-white/areia, luz natural, muito respiro, sofisticacao limpa.",
      "Sem texto na imagem, sem logo, sem letras, sem numeros, sem marca de terceiros.",
      "Evitar fundo escuro dominante, template barato, panfleto, colagem, pessoas deformadas, watermark.",
      `Formato: ${format}. Tamanho: ${size}.`,
      `Tema: ${clip(post.title ?? post.theme ?? "MYINC", 400)}.`,
      `Brief: ${clip(post.image_prompt ?? post.creative_brief ?? post.caption ?? "empreendimento premium", 700)}.`,
      `Marca: ${clip(profile.data, 600)}.`,
      `Referencias: ${clip(refs.data ?? [], 500)}.`,
    ].join("\n");

    await supabase.from("posts").update({ status: "gerando_imagem", technical_detail: "Imagem fast-safe iniciada.", updated_at: new Date().toISOString() }).eq("id", post.id);

    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    const bucket = cfg(runtime, "MEDIA_BUCKET", "creative-media");
    if (bucketError || !(buckets ?? []).some((item) => item.name === bucket)) throw new Error(`Bucket ${bucket} nao encontrado.`);

    const { bytes, info, model } = await generateBytes(openAiKey, runtime, prompt, size);
    const path = `${brandId}/${post.id}/fast-${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: info.mime, upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(path);
    const mediaUrl = publicUrl.publicUrl;

    const { data: asset, error: assetError } = await supabase.from("media_assets").insert({
      brand_id: brandId,
      post_id: post.id,
      name: `Imagem fast-safe ${post.title ?? "MYINC"}`,
      type: "Imagem gerada",
      media_type: "Imagem gerada",
      bucket,
      path,
      url: mediaUrl,
      public_url: mediaUrl,
      preview_url: mediaUrl,
      mime_type: info.mime,
      size_bytes: bytes.byteLength,
      status: "ativo",
      tags: ["ia", "myinc", "fast-safe"],
      origin: `openai:${model}`,
      usage_context: "post_image",
      ai_allowed: true,
      storage_bucket: bucket,
      storage_path: path,
      is_final: true,
      used_in_publish: false,
      notes: prompt,
      metadata: { image_model: model, image_size: size, width: info.width, height: info.height, prompt_chars: prompt.length },
    }).select().single();
    if (assetError) throw assetError;

    await supabase.from("post_versions").insert({
      brand_id: brandId,
      post_id: post.id,
      version_label: `FAST-IMAGE-${Date.now()}`,
      caption: post.caption,
      image_prompt: prompt,
      media_url: mediaUrl,
      quality_score: post.quality_score,
      is_current: true,
      output_json: { media_url: mediaUrl, image_model: model, image_size: size, width: info.width, height: info.height },
    });

    const { data: updatedPost, error: updateError } = await supabase.from("posts").update({
      media_url: mediaUrl,
      status: "aguardando_revisao",
      error_message: null,
      technical_detail: null,
      updated_at: new Date().toISOString(),
    }).eq("id", post.id).select().single();
    if (updateError) throw updateError;

    await supabase.from("system_logs").insert({ brand_id: brandId, post_id: post.id, module: "image-fast-safe", type: "image", status: "sucesso", friendly_message: "Imagem gerada no modo fast-safe.", technical_detail: `model=${model}; size=${size}; asset=${asset.id}` });
    return json(req, { ok: true, post: updatedPost, mediaUrl, mediaAsset: asset, model, size }, 200, runtime);
  } catch (error) {
    const detail = stringifyError(error);
    if (postId) await supabase.from("posts").update({ status: "erro_imagem", error_message: "Falha ao gerar imagem fast-safe.", technical_detail: detail, updated_at: new Date().toISOString() }).eq("id", postId);
    await supabase.from("system_logs").insert({ post_id: postId || null, module: "image-fast-safe", type: "image", status: "erro", friendly_message: "Falha ao gerar imagem fast-safe.", technical_detail: detail });
    return json(req, { ok: false, error: detail }, 400, runtime);
  }
});
