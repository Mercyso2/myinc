import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stringifyError } from "../_shared/function-utils.ts";
import { cfg, getCorsHeaders, loadRuntimeConfig, requiredCfg } from "../_shared/runtime-config.ts";

type Row = Record<string, unknown>;

type Runtime = Record<string, string | null>;

function json(req: Request, body: unknown, status = 200, runtime: Runtime = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req, runtime), "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente no backend.`);
  return value;
}

function asObject(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function safe(value: unknown, max = 1200) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function imageSize(format: string, runtime: Runtime) {
  const value = format.toLowerCase();
  if (value.includes("story") || value.includes("reels") || value.includes("video") || value.includes("vídeo")) {
    return cfg(runtime, "OPENAI_IMAGE_SIZE_STORY", "1088x1936");
  }
  if (value.includes("quadrado") || value.includes("thumbnail")) {
    return cfg(runtime, "OPENAI_IMAGE_SIZE_SQUARE", "1024x1024");
  }
  return cfg(runtime, "OPENAI_IMAGE_SIZE_FEED", "1088x1360");
}

function pngInfo(bytes: Uint8Array) {
  const png = bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { mime: png ? "image/png" : "", width: png ? view.getUint32(16) : 0, height: png ? view.getUint32(20) : 0 };
}

async function generateBytes(openAiKey: string, runtime: Runtime, prompt: string, size: string) {
  const model = cfg(runtime, "OPENAI_IMAGE_MODEL", "gpt-image-2");
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      size,
      output_format: cfg(runtime, "OPENAI_IMAGE_FORMAT", "png"),
      quality: cfg(runtime, "OPENAI_IMAGE_QUALITY", "high"),
      n: 1,
    }),
  });
  const data = await response.json().catch(() => ({}));
  const encoded = asObject(Array.isArray(asObject(data).data) ? asObject(data).data[0] : {}).b64_json;
  if (!response.ok || typeof encoded !== "string" || !encoded) {
    throw new Error(`OpenAI imagem HTTP ${response.status}: ${stringifyError(asObject(data).error ?? data)}`);
  }
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  const info = pngInfo(bytes);
  if (info.mime !== "image/png") throw new Error("Imagem retornada nao e PNG valido.");
  if (bytes.byteLength < 150000) throw new Error("Imagem retornada esta pequena demais.");
  return { bytes, info, model };
}

function defaultVisual(page: number) {
  const options = [
    "fachada ou ambiente principal com luz natural e alto impacto",
    "entrada, lobby ou paisagismo com composicao premium",
    "interior integrado com materiais nobres e tons claros",
    "detalhe de acabamento e textura construtiva",
    "cena de vida sofisticada, natural e sem exageros",
    "obra, processo ou precisao tecnica da incorporadora",
    "vista, entorno e valorizacao do empreendimento",
    "fechamento visual com espaco limpo para chamada final",
  ];
  return options[Math.max(0, Math.min(options.length - 1, page - 1))];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const runtime = await loadRuntimeConfig(supabase);
  const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Pagina de carrossel");
  let postId = "";

  try {
    const body = await req.json().catch(() => ({}));
    postId = String(body.postId ?? "");
    const page = Math.max(1, Number(body.page ?? 1));
    const totalPages = Math.max(page, Number(body.totalPages ?? body.total_pages ?? 5));
    if (!postId) return json(req, { ok: false, error: "postId e obrigatorio." }, 400, runtime);

    const { data: post, error: postError } = await supabase.from("posts").select("*").eq("id", postId).single();
    if (postError || !post) throw postError ?? new Error("Post nao encontrado.");

    const [{ data: profile }, { data: refs }, { data: version }] = await Promise.all([
      supabase.from("brand_profiles").select("primary_palette,secondary_palette,preferred_visual_style,composition_rules,image_text_rules,mantra").eq("brand_id", post.brand_id).maybeSingle(),
      supabase.from("library_items").select("name,notes,ai_usage_rule,url").eq("brand_id", post.brand_id).is("archived_at", null).limit(5),
      supabase.from("post_versions").select("output_json").eq("post_id", post.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const output = asObject(version?.output_json);
    const carouselPages = Array.isArray(output.carousel_pages) ? output.carousel_pages : [];
    const pageData = asObject(carouselPages[page - 1] ?? {});
    const visual = String(pageData.visual_prompt ?? defaultVisual(page));
    const message = String(pageData.text ?? post.caption ?? post.headline ?? post.title ?? "");
    const format = String(post.format ?? "Carrossel 5 paginas");
    const size = imageSize(format, runtime);

    const prompt = [
      "Crie somente uma imagem para uma unica pagina de carrossel da MYINC.",
      `Pagina ${page}/${totalPages}.`,
      "Perfil visual claro/lite: branco, off-white, areia, luz natural, muito respiro, sofisticacao limpa e premium.",
      "Sem texto na imagem, sem logotipo, sem letras, sem numeros, sem marca de terceiros.",
      "Evitar fundo escuro dominante, template barato, excesso de elementos e aparencia de panfleto.",
      `Tema do post: ${safe(post.title ?? post.theme ?? "MYINC", 500)}.`,
      `Mensagem orientadora, sem escrever na arte: ${safe(message, 600)}.`,
      `Direcao visual desta pagina: ${safe(visual, 900)}.`,
      `Formato: ${format}. Tamanho tecnico: ${size}.`,
      `Marca resumida: ${safe(profile, 900)}.`,
      `Referencias resumidas: ${safe(refs, 900)}.`,
    ].join("\n");

    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    const bucket = cfg(runtime, "MEDIA_BUCKET", "creative-media");
    if (bucketError || !(buckets ?? []).some((item) => item.name === bucket)) throw new Error(`Bucket ${bucket} nao encontrado.`);

    const { bytes, info, model } = await generateBytes(openAiKey, runtime, prompt, size);
    const path = `${post.brand_id}/${post.id}/carousel-page-${page}-${crypto.randomUUID()}.png`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: info.mime, upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(path);
    const mediaUrl = publicUrl.publicUrl;

    const { data: asset, error: assetError } = await supabase.from("media_assets").insert({
      brand_id: post.brand_id,
      post_id: post.id,
      name: `Carrossel pagina ${page}`,
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
      tags: ["ia", "myinc", "carrossel", `pagina-${page}`],
      origin: `openai:${model}`,
      usage_context: "carousel_page",
      ai_allowed: true,
      storage_bucket: bucket,
      storage_path: path,
      is_final: page === 1,
      used_in_publish: false,
      notes: prompt,
      metadata: { page, total_pages: totalPages, width: info.width, height: info.height, image_model: model, image_size: size },
    }).select().single();
    if (assetError) throw assetError;

    const urls = Array.from({ length: totalPages }, (_, index) => Array.isArray(post.carousel_media_urls) ? String(post.carousel_media_urls[index] ?? "") : "");
    urls[page - 1] = mediaUrl;
    const filled = urls.filter(Boolean).length;

    const { data: updatedPost, error: updateError } = await supabase.from("posts").update({
      carousel_media_urls: urls,
      media_url: urls.find(Boolean) ?? mediaUrl,
      status: filled >= totalPages ? "aguardando_revisao" : "em_producao",
      error_message: null,
      technical_detail: null,
      updated_at: new Date().toISOString(),
    }).eq("id", post.id).select().single();
    if (updateError) throw updateError;

    await supabase.from("post_versions").insert({
      brand_id: post.brand_id,
      post_id: post.id,
      version_label: `CAROUSEL-${page}-${Date.now()}`,
      caption: post.caption,
      image_prompt: prompt,
      media_url: mediaUrl,
      quality_score: post.quality_score,
      is_current: page === 1,
      output_json: { media_url: mediaUrl, carousel_media_urls: urls, carousel_page: page, total_pages: totalPages, image_model: model, image_size: size },
    });

    await supabase.from("system_logs").insert({
      brand_id: post.brand_id,
      post_id: post.id,
      module: "carousel-page",
      type: "image",
      status: "sucesso",
      friendly_message: `Pagina ${page}/${totalPages} do carrossel gerada.`,
      technical_detail: `asset=${asset.id}; model=${model}; filled=${filled}/${totalPages}`,
    });

    return json(req, { ok: true, post: updatedPost, mediaUrl, mediaAsset: asset, page, totalPages, filled }, 200, runtime);
  } catch (error) {
    const detail = stringifyError(error);
    if (postId) await supabase.from("posts").update({ status: "erro_imagem", error_message: "Falha ao gerar pagina do carrossel.", technical_detail: detail, updated_at: new Date().toISOString() }).eq("id", postId);
    await supabase.from("system_logs").insert({ post_id: postId || null, module: "carousel-page", type: "image", status: "erro", friendly_message: "Falha ao gerar pagina do carrossel.", technical_detail: detail });
    return json(req, { ok: false, error: detail }, 400, runtime);
  }
});
