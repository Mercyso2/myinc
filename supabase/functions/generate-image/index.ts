import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stringifyError } from "../_shared/function-utils.ts";
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
  if (!value) throw new Error(`${name} ausente no backend. Operacao real nao executada.`);
  return value;
}

function openAiSize(format = "") {
  const normalized = String(format).toLowerCase();
  if (normalized.includes("quadrado") || normalized.includes("thumbnail")) return "1024x1024";
  if (normalized.includes("facebook") && !normalized.includes("story")) return "1536x1024";
  return "1024x1536";
}

function isCarouselFormat(format = "") {
  return String(format).toLowerCase().includes("carrossel");
}

function carouselPageCount(format = "") {
  return String(format).includes("8") ? 8 : 5;
}

function modelCandidates(runtime: Record<string, string | null>) {
  const primary = cfg(runtime, "OPENAI_IMAGE_MODEL", "gpt-image-1.5");
  const fallbacks = cfg(runtime, "OPENAI_IMAGE_FALLBACK_MODELS", "gpt-image-1,gpt-image-1-mini")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function imagePrompt(
  post: Record<string, unknown>,
  profile: unknown,
  visualRules: unknown,
  refs: unknown,
) {
  return [
    "Crie imagem publicitaria premium para social media da MYINC Incorporadora.",
    `Post: ${String(post.title ?? post.theme ?? "MYINC")}.`,
    `Brief: ${String(post.image_prompt ?? post.creative_brief ?? post.title ?? "Arquitetura premium")}.`,
    `Formato: ${String(post.format ?? "Feed 4:5")}. Canal: ${String(post.channel ?? "Instagram")}. Objetivo: ${String(post.objective ?? "gerar desejo e leads qualificados")}.`,
    "Direcao de arte: arquitetura contemporanea brasileira de alto padrao, luz natural cinematografica, materiais nobres, concreto, vidro, madeira e pedra.",
    "Composicao: limpa, editorial, sofisticada, com profundidade realista, area segura para copy curta e sem aspecto de panfleto.",
    "Paleta: grafite profundo, off-white, areia, cobre discreto. Sem neon, sem infantilizacao, sem visual generico.",
    "Texto na arte: minimo e legivel. Se houver duvida, prefira sem texto e deixe espaco para overlay.",
    "Nao inventar logo, nao deformar marca, nao usar marcas de terceiros.",
    `Memoria visual: ${JSON.stringify(profile ?? {})}.`,
    `Regras visuais ativas: ${JSON.stringify(visualRules ?? [])}.`,
    `Referencias aprovadas: ${JSON.stringify(refs ?? [])}.`,
    "Negative prompt: baixa qualidade, mockup generico, excesso de texto, letras distorcidas, logo falso, design amador, watermark, pessoas deformadas, maos defeituosas.",
  ].join("\n");
}

function fallbackCarouselPages(post: Record<string, unknown>, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    page: index + 1,
    title:
      index === 0
        ? String(post.headline ?? post.title ?? "MYINC")
        : index === count - 1
          ? String(post.cta ?? "Fale com a MYINC")
          : `${String(post.theme ?? "MYINC")} - detalhe ${index}`,
    text:
      index === 0
        ? "Gancho visual premium para abrir o carrossel."
        : index === count - 1
          ? "Fechamento com CTA claro e sofisticado."
          : "Evolucao da narrativa com arquitetura, confianca e valor percebido.",
    visual_prompt: `${String(post.image_prompt ?? post.creative_brief ?? post.title ?? "MYINC")} Pagina ${index + 1}/${count} de carrossel premium, continuidade visual, composicao limpa, pouco texto e alto padrao.`,
  }));
}

async function generateImageBytes({
  openAiKey,
  runtime,
  prompt,
  size,
}: {
  openAiKey: string;
  runtime: Record<string, string | null>;
  prompt: string;
  size: string;
}) {
  const errors: string[] = [];
  for (const model of modelCandidates(runtime)) {
    const imageResponse = await fetch("https://api.openai.com/v1/images/generations", {
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
    const imageJson = await imageResponse.json().catch(() => ({}));
    if (imageResponse.ok && imageJson.data?.[0]?.b64_json) {
      const bytes = Uint8Array.from(atob(imageJson.data[0].b64_json), (c) => c.charCodeAt(0));
      if (bytes.byteLength < 20_000) {
        errors.push(`${model}: imagem muito pequena (${bytes.byteLength} bytes)`);
        continue;
      }
      return { bytes, usedModel: model };
    }
    errors.push(`${model}: ${stringifyError(imageJson?.error ?? imageJson)}`);
  }
  throw new Error(`Provedor de imagem nao retornou b64_json. ${errors.join(" | ")}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRole);
  const runtime = await loadRuntimeConfig(supabase);
  const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Geracao de imagem");

  async function log(row: Record<string, unknown>) {
    await supabase.from("system_logs").insert({ type: row.type ?? "image", ...row });
  }

  try {
    const { postId } = await req.json();
    if (!postId) return json({ error: "postId e obrigatorio." }, 400);

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();
    if (postError || !post) throw postError ?? new Error("Post nao encontrado.");

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
      .is("archived_at", null)
      .limit(12);

    const mediaBucket = cfg(runtime, "MEDIA_BUCKET", "creative-media");
    const basePrompt = imagePrompt(post, profile, visualRules, refs);
    const latestVersion = await supabase
      .from("post_versions")
      .select("output_json")
      .eq("post_id", post.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestOutput = asObject(latestVersion.data?.output_json);
    const count = carouselPageCount(String(post.format ?? ""));
    const carouselPages =
      isCarouselFormat(String(post.format ?? "")) &&
      Array.isArray(latestOutput.carousel_pages) &&
      latestOutput.carousel_pages.length
        ? latestOutput.carousel_pages.slice(0, count).map((page, index) => ({
            ...asObject(page),
            page: Number(asObject(page).page ?? index + 1),
          }))
        : fallbackCarouselPages(post, count);
    while (isCarouselFormat(String(post.format ?? "")) && carouselPages.length < count) {
      carouselPages.push(fallbackCarouselPages(post, count)[carouselPages.length]);
    }

    async function createAsset(prompt: string, label: string, index: number, isFinal: boolean) {
      const { bytes, usedModel } = await generateImageBytes({
        openAiKey,
        runtime,
        prompt,
        size: openAiSize(post.format),
      });
      const path = `${post.brand_id}/${post.id}/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await supabase.storage
        .from(mediaBucket)
        .upload(path, bytes, { contentType: "image/png", upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from(mediaBucket).getPublicUrl(path);
      const mediaUrl = publicUrl.publicUrl;
      const isCarousel = isCarouselFormat(String(post.format ?? ""));
      const { data: mediaAsset, error: mediaAssetError } = await supabase
        .from("media_assets")
        .insert({
          brand_id: post.brand_id,
          post_id: post.id,
          name: label,
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
          tags: isCarousel
            ? ["ia", "myinc", "carrossel", `pagina-${index}`]
            : ["ia", "myinc", "feed"],
          origin: `openai:${usedModel}`,
          usage_context: isCarousel ? "carousel_page" : "post_image",
          ai_allowed: true,
          storage_bucket: mediaBucket,
          storage_path: path,
          is_final: isFinal,
          used_in_publish: false,
          notes: prompt,
          metadata: {
            image_model: usedModel,
            image_size: openAiSize(post.format),
            prompt,
            carousel_page: isCarousel ? index : null,
          },
        })
        .select()
        .single();
      if (mediaAssetError) throw mediaAssetError;
      return { mediaUrl, mediaAsset, model: usedModel, path, prompt };
    }

    const generated = [];
    if (isCarouselFormat(String(post.format ?? ""))) {
      for (const page of carouselPages) {
        const pageObject = asObject(page);
        const pageNumber = Number(pageObject.page ?? generated.length + 1);
        const pagePrompt = [
          basePrompt,
          `CARROSSEL MYINC - pagina ${pageNumber}/${count}.`,
          `Titulo curto sugerido: ${String(pageObject.title ?? post.headline ?? post.title)}.`,
          `Mensagem da pagina: ${String(pageObject.text ?? post.caption ?? "")}.`,
          `Direcao visual especifica: ${String(pageObject.visual_prompt ?? post.image_prompt ?? post.creative_brief ?? "")}.`,
          "Gerar uma imagem unica para esta pagina, com continuidade visual da campanha e progressao narrativa. Nao repetir exatamente o enquadramento da pagina anterior.",
        ].join("\n");
        generated.push(
          await createAsset(
            pagePrompt,
            `Carrossel ${post.title} - pagina ${pageNumber}`,
            pageNumber,
            pageNumber === 1,
          ),
        );
      }
    } else {
      generated.push(await createAsset(basePrompt, `Criativo ${post.title}`, 1, true));
    }

    const mediaUrl = generated[0]?.mediaUrl ?? "";
    const carouselMediaUrls = isCarouselFormat(String(post.format ?? ""))
      ? generated.map((item) => item.mediaUrl)
      : [];
    const mediaAsset = generated[0]?.mediaAsset;
    const usedModel = generated[0]?.model ?? "";
    const finalPrompt = isCarouselFormat(String(post.format ?? ""))
      ? `Carrossel com ${generated.length} paginas geradas sequencialmente.`
      : basePrompt;

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
        carousel_pages: isCarouselFormat(String(post.format ?? "")) ? carouselPages : [],
        carousel_media_urls: carouselMediaUrls,
      },
    });
    if (versionError) throw versionError;

    const { data: updatedPost, error: updateError } = await supabase
      .from("posts")
      .update({
        media_url: mediaUrl,
        carousel_media_urls: carouselMediaUrls,
        error_message: null,
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
      module: isCarouselFormat(String(post.format ?? "")) ? "carousel" : "imagem",
      status: "sucesso",
      friendly_message: isCarouselFormat(String(post.format ?? ""))
        ? `Carrossel com ${carouselMediaUrls.length} paginas gerado.`
        : "Imagem real gerada, validada e salva no Supabase Storage.",
      technical_detail: `media_asset=${mediaAsset?.id}; model=${usedModel}; size=${openAiSize(post.format)}; urls=${generated.length}`,
    });

    return json({
      ok: true,
      post: updatedPost,
      mediaUrl,
      mediaAsset,
      model: usedModel,
      carouselMediaUrls,
    });
  } catch (error) {
    await log({
      module: "imagem",
      status: "erro",
      friendly_message: "Falha ao gerar imagem real.",
      technical_detail: stringifyError(error),
    });
    return json({ error: stringifyError(error) || "Erro desconhecido" }, 400);
  }
});
