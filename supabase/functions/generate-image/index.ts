import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { cfg, loadRuntimeConfig, requiredCfg } from "../_shared/runtime-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("CORS_ALLOW_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente no backend. Operação real não executada.`);
  return value;
}

function openAiSize(format = "") {
  const normalized = String(format).toLowerCase();
  if (normalized.includes("quadrado") || normalized.includes("thumbnail")) return "1024x1024";
  if (normalized.includes("facebook") && !normalized.includes("story")) return "1536x1024";
  return "1024x1536";
}

function modelCandidates(runtime: Record<string, string | null>) {
  const primary = cfg(runtime, "OPENAI_IMAGE_MODEL", "gpt-image-2");
  const fallbacks = cfg(runtime, "OPENAI_IMAGE_FALLBACK_MODELS", "gpt-image-1.5,gpt-image-1")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

function imagePrompt(
  post: Record<string, unknown>,
  profile: unknown,
  visualRules: unknown,
  refs: unknown,
) {
  return [
    "Crie imagem publicitária premium para social media da MYINC Incorporadora.",
    `Post: ${String(post.title ?? post.theme ?? "MYINC")}.`,
    `Brief: ${String(post.image_prompt ?? post.creative_brief ?? post.title ?? "Arquitetura premium")}.`,
    `Formato: ${String(post.format ?? "Feed 4:5")}. Canal: ${String(post.channel ?? "Instagram")}. Objetivo: ${String(post.objective ?? "gerar desejo e leads qualificados")}.`,
    "Direção de arte: arquitetura contemporânea brasileira de alto padrão, luz natural cinematográfica, materiais nobres, concreto/vidro/madeira/pedra, composição limpa, espaço negativo elegante, profundidade realista, estética de agência premium imobiliária.",
    "Paleta: grafite profundo, off-white, areia, cobre/laranja discreto. Sem cores neon e sem visual infantil.",
    "Texto na arte: mínimo, legível, em português do Brasil. Se houver dúvida, prefira sem texto e deixe espaço seguro para overlay.",
    "Não inventar logo, não deformar marca, não usar marcas de terceiros.",
    `Memória visual: ${JSON.stringify(profile ?? {})}.`,
    `Regras visuais ativas: ${JSON.stringify(visualRules ?? [])}.`,
    `Referências aprovadas: ${JSON.stringify(refs ?? [])}.`,
    "Negative prompt: baixa qualidade, mockup genérico, excesso de texto, letras distorcidas, logo falso, design amador, panfleto, watermark, pessoas deformadas, mãos defeituosas.",
  ].join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRole);
  const runtime = await loadRuntimeConfig(supabase);
  const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Geração de imagem");

  async function log(row: Record<string, unknown>) {
    await supabase.from("system_logs").insert({ type: row.type ?? "image", ...row });
  }

  try {
    const { postId } = await req.json();
    if (!postId) return json({ error: "postId é obrigatório." }, 400);

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();
    if (postError || !post) throw postError ?? new Error("Post não encontrado.");

    const { data: profile } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("brand_id", post.brand_id)
      .maybeSingle();
    const { data: visualRules } = await supabase
      .from("brand_visual_rules")
      .select("rule_type,content")
      .eq("brand_id", post.brand_id)
      .eq("active", true)
      .is("archived_at", null);
    const { data: refs } = await supabase
      .from("library_items")
      .select("name,notes,url,ai_usage_rule")
      .eq("brand_id", post.brand_id)
      .eq("status", "referência aprovada")
      .is("archived_at", null)
      .limit(12);

    const finalPrompt = imagePrompt(post, profile, visualRules, refs);

    let base64 = "";
    let usedModel = "";
    const errors: string[] = [];
    for (const model of modelCandidates(runtime)) {
      const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: finalPrompt,
          size: openAiSize(post.format),
          output_format: cfg(runtime, "OPENAI_IMAGE_FORMAT", "png"),
          quality: cfg(runtime, "OPENAI_IMAGE_QUALITY", "high"),
          n: 1,
        }),
      });
      const imageJson = await imageResponse.json().catch(() => ({}));
      if (imageResponse.ok && imageJson.data?.[0]?.b64_json) {
        base64 = imageJson.data[0].b64_json;
        usedModel = model;
        break;
      }
      errors.push(`${model}: ${imageJson?.error?.message ?? JSON.stringify(imageJson)}`);
    }
    if (!base64) throw new Error(`Provedor de imagem não retornou b64_json. ${errors.join(" | ")}`);

    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength < 20_000)
      throw new Error(`Imagem muito pequena para produção (${bytes.byteLength} bytes).`);
    const path = `${post.brand_id}/${post.id}/${crypto.randomUUID()}.png`;
    const mediaBucket = cfg(runtime, "MEDIA_BUCKET", "creative-media");
    const { error: uploadError } = await supabase.storage
      .from(mediaBucket)
      .upload(path, bytes, { contentType: "image/png", upsert: false });
    if (uploadError) throw uploadError;
    const { data: publicUrl } = supabase.storage.from(mediaBucket).getPublicUrl(path);
    const mediaUrl = publicUrl.publicUrl;

    const { data: mediaAsset, error: mediaAssetError } = await supabase
      .from("media_assets")
      .insert({
        brand_id: post.brand_id,
        post_id: post.id,
        name: `Criativo ${post.title}`,
        type: "Imagem gerada",
        media_type: "Imagem gerada",
        bucket: mediaBucket,
        path,
        url: mediaUrl,
        public_url: mediaUrl,
        preview_url: mediaUrl,
        mime_type: "image/png",
        size_bytes: bytes.byteLength,
        status: "ativo",
        origin: `openai:${usedModel}`,
        usage_context: "post_image",
        ai_allowed: true,
        storage_bucket: mediaBucket,
        storage_path: path,
        is_final: true,
        used_in_publish: false,
        notes: finalPrompt,
        metadata: {
          image_model: usedModel,
          image_size: openAiSize(post.format),
          prompt: finalPrompt,
        },
      })
      .select()
      .single();
    if (mediaAssetError) throw mediaAssetError;

    const { error: versionError } = await supabase.from("post_versions").insert({
      brand_id: post.brand_id,
      post_id: post.id,
      version_label: `V${Date.now()}`,
      caption: post.caption,
      image_prompt: finalPrompt,
      media_url: mediaUrl,
      quality_score: post.quality_score,
      output_json: {
        image_model: usedModel,
        image_size: openAiSize(post.format),
        media_url: mediaUrl,
      },
    });
    if (versionError) throw versionError;

    const { data: updatedPost, error: updateError } = await supabase
      .from("posts")
      .update({
        media_url: mediaUrl,
        status: "aguardando_revisao",
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id)
      .select()
      .single();
    if (updateError) throw updateError;

    await log({
      brand_id: post.brand_id,
      post_id: post.id,
      module: "imagem",
      status: "sucesso",
      friendly_message: "Imagem real gerada, validada e salva no Supabase Storage.",
      technical_detail: `media_asset=${mediaAsset?.id}; path=${path}; model=${usedModel}; size=${openAiSize(post.format)}`,
    });

    return json({ ok: true, post: updatedPost, mediaUrl, mediaAsset, model: usedModel });
  } catch (error) {
    await log({
      module: "imagem",
      status: "erro",
      friendly_message: "Falha ao gerar imagem real.",
      technical_detail: error instanceof Error ? error.message : String(error),
    });
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 400);
  }
});
