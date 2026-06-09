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
  if (!value) throw new Error(`${name} ausente no backend. Operacao real nao executada.`);
  return value;
}

function asObject(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function isCarouselFormat(format = "") {
  return String(format).toLowerCase().includes("carrossel");
}

function carouselPageCount(format = "") {
  return String(format).includes("8") ? 8 : 5;
}

function openAiSize(format = "", runtime: Runtime = {}) {
  const normalized = String(format).toLowerCase();
  if (normalized.includes("quadrado") || normalized.includes("thumbnail")) {
    return cfg(runtime, "OPENAI_IMAGE_SIZE_SQUARE", "1024x1024");
  }
  if (normalized.includes("facebook") && !normalized.includes("story")) {
    return cfg(runtime, "OPENAI_IMAGE_SIZE_FACEBOOK", "1536x1024");
  }
  if (normalized.includes("story") || normalized.includes("reels") || normalized.includes("vídeo") || normalized.includes("video")) {
    return cfg(runtime, "OPENAI_IMAGE_SIZE_STORY", "1088x1936");
  }
  return cfg(runtime, "OPENAI_IMAGE_SIZE_FEED", "1088x1360");
}

function modelCandidates(runtime: Runtime) {
  const primary = cfg(runtime, "OPENAI_IMAGE_MODEL", "gpt-image-2");
  const fallbacks = cfg(runtime, "OPENAI_IMAGE_FALLBACK_MODELS", "gpt-image-1.5,gpt-image-1,gpt-image-1-mini")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

function imagePrompt(
  post: Row,
  profile: unknown,
  visualRules: unknown,
  refs: unknown,
  runtime: Runtime,
  feedback?: unknown,
) {
  const format = String(post.format ?? "Feed 4:5 / 1080x1350");
  const size = openAiSize(format, runtime);
  return [
    "CRIE UMA IMAGEM PUBLICITÁRIA PREMIUM PARA SOCIAL MEDIA DA MYINC INCORPORADORA.",
    "A saída deve parecer campanha real de incorporadora de alto padrão, não template barato, não panfleto e não card genérico.",
    "IMPORTANTE: gerar a ARTE BASE SEM TEXTO, SEM LOGO, SEM LETRAS, SEM NÚMEROS E SEM MARCAS. O texto/copy será aplicado depois no editor do app.",
    `FORMATO FINAL DO APP: ${format}. Para feed, preparar composição 4:5 equivalente a 1080x1350; geração técnica usada: ${size}.`,
    `POST: ${String(post.title ?? post.theme ?? "MYINC")}.`,
    `BRIEF: ${String(post.image_prompt ?? post.creative_brief ?? post.title ?? "Arquitetura contemporânea brasileira premium")}.`,
    `OBJETIVO: ${String(post.objective ?? "gerar desejo, autoridade e leads qualificados")}. CANAL: ${String(post.channel ?? "Instagram/Facebook")}.`,
    "DIREÇÃO DE ARTE: arquitetura contemporânea brasileira, alto padrão, estética editorial, sofisticada e comercial; materiais nobres como pedra natural, madeira, vidro, concreto bem acabado e paisagismo premium.",
    "FOTOGRAFIA/RENDER: realismo fotográfico, lente arquitetônica profissional, perspectiva correta, luz natural cinematográfica, alta faixa dinâmica, profundidade elegante e acabamento impecável.",
    "COMPOSIÇÃO: assunto principal forte, muito respiro, área segura limpa para headline e CTA, hierarquia visual clara, sem excesso de elementos, recorte pronto para Instagram.",
    "PALETA MYINC: grafite profundo, off-white, areia, madeira natural, verde paisagismo e cobre apenas como acento discreto. Evitar neon, cores infantis e saturação exagerada.",
    "NEGATIVE PROMPT: watermark, assinatura, texto deformado, logo falso, panfleto, colagem, template, mockup genérico, render barato, baixa resolução, pessoas deformadas, mãos defeituosas, geometria impossível, objetos duplicados, marca de terceiros.",
    `MEMÓRIA DA MARCA: ${JSON.stringify(profile ?? {})}.`,
    `REGRAS VISUAIS ATIVAS: ${JSON.stringify(visualRules ?? [])}.`,
    `REFERÊNCIAS APROVADAS: ${JSON.stringify(refs ?? [])}.`,
    feedback ? `FEEDBACK HUMANO OBRIGATÓRIO PARA ESTA REGERAÇÃO: ${String(feedback)}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function fallbackCarouselPages(post: Row, count: number) {
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

function pngInfo(bytes: Uint8Array) {
  const png = bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    mime: png ? "image/png" : "",
    width: png ? view.getUint32(16) : 0,
    height: png ? view.getUint32(20) : 0,
  };
}

async function generateImageBytes({
  openAiKey,
  runtime,
  prompt,
  size,
}: {
  openAiKey: string;
  runtime: Runtime;
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
    const encoded = asObject(Array.isArray(asObject(imageJson).data) ? asObject(imageJson).data[0] : {}).b64_json;
    if (imageResponse.ok && typeof encoded === "string" && encoded) {
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const info = pngInfo(bytes);
      if (info.mime !== "image/png") {
        errors.push(`${model}: MIME inválido; esperado image/png`);
        continue;
      }
      if (bytes.byteLength < 150_000) {
        errors.push(`${model}: imagem muito pequena (${bytes.byteLength} bytes)`);
        continue;
      }
      if (info.width < 1024 || info.height < 1024) {
        errors.push(`${model}: resolução baixa (${info.width}x${info.height})`);
        continue;
      }
      return { bytes, usedModel: model, info };
    }
    errors.push(`${model}: HTTP ${imageResponse.status} ${stringifyError(asObject(imageJson).error ?? imageJson)}`);
  }
  throw new Error(`Provedor de imagem nao retornou imagem valida. ${errors.join(" | ")}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRole);
  const runtime = await loadRuntimeConfig(supabase);
  const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Geracao de imagem");

  async function log(row: Row) {
    await supabase.from("system_logs").insert({ type: row.type ?? "image", ...row });
  }

  let postId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    postId = String(body.postId ?? "");
    if (!postId) return json(req, { ok: false, error: "postId e obrigatorio." }, 400, runtime);

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();
    if (postError || !post) throw postError ?? new Error("Post nao encontrado.");

    const { data: bucketRows, error: bucketsError } = await supabase.storage.listBuckets();
    const mediaBucket = cfg(runtime, "MEDIA_BUCKET", "creative-media");
    const bucketRow = (bucketRows ?? []).find((bucket) => bucket.name === mediaBucket);
    if (bucketsError || !bucketRow) throw new Error(`Bucket ${mediaBucket} nao encontrado: ${stringifyError(bucketsError)}`);
    if (!bucketRow.public) throw new Error(`Bucket ${mediaBucket} precisa estar publico para preview/publicacao.`);

    const [{ data: profile }, { data: visualRules }, { data: refs }, latestVersion] = await Promise.all([
      supabase.from("brand_profiles").select("*").eq("brand_id", post.brand_id).maybeSingle(),
      supabase
        .from("brand_visual_rules")
        .select("rule_type,content")
        .eq("brand_id", post.brand_id)
        .eq("active", true)
        .is("archived_at", null),
      supabase
        .from("library_items")
        .select("name,notes,url,ai_usage_rule")
        .eq("brand_id", post.brand_id)
        .is("archived_at", null)
        .limit(12),
      supabase
        .from("post_versions")
        .select("output_json")
        .eq("post_id", post.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const basePrompt = imagePrompt(post, profile, visualRules, refs, runtime, body.feedback);
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
      const { bytes, usedModel, info } = await generateImageBytes({
        openAiKey,
        runtime,
        prompt,
        size: openAiSize(post.format, runtime),
      });
      const path = `${post.brand_id}/${post.id}/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await supabase.storage
        .from(mediaBucket)
        .upload(path, bytes, { contentType: info.mime, upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from(mediaBucket).getPublicUrl(path);
      const mediaUrl = publicUrl.publicUrl;
      if (!mediaUrl.startsWith("https://")) throw new Error("Storage nao retornou URL publica HTTPS.");
      const head = await fetch(mediaUrl, { method: "HEAD" });
      if (!head.ok) throw new Error(`URL publica inacessivel apos upload: HTTP ${head.status}`);

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
          mime_type: info.mime,
          size_bytes: bytes.byteLength,
          status: "ativo",
          tags: isCarousel ? ["ia", "myinc", "carrossel", `pagina-${index}`] : ["ia", "myinc", "feed-4-5"],
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
            image_size: openAiSize(post.format, runtime),
            width: info.width,
            height: info.height,
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
          `Mensagem da pagina para orientar visual, sem escrever texto na imagem: ${String(pageObject.text ?? post.caption ?? "")}.`,
          `Direcao visual especifica: ${String(pageObject.visual_prompt ?? post.image_prompt ?? post.creative_brief ?? "")}.`,
          "Gerar uma imagem unica para esta pagina, com continuidade visual da campanha, variando enquadramento e mantendo area segura para overlay.",
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
    if (!mediaUrl || (isCarouselFormat(String(post.format ?? "")) && carouselMediaUrls.length !== count)) {
      throw new Error("Quality gate final: URLs geradas incompletas.");
    }
    const mediaAsset = generated[0]?.mediaAsset;
    const usedModel = generated[0]?.model ?? "";
    const finalPrompt = isCarouselFormat(String(post.format ?? ""))
      ? `Carrossel com ${generated.length} paginas geradas sequencialmente.`
      : basePrompt;

    const { data: version, error: versionError } = await supabase
      .from("post_versions")
      .insert({
        brand_id: post.brand_id,
        post_id: post.id,
        version_label: `V${Date.now()}`,
        caption: post.caption,
        image_prompt: finalPrompt,
        media_url: mediaUrl,
        quality_score: post.quality_score,
        human_feedback: body.feedback ?? null,
        is_current: true,
        output_json: {
          image_model: usedModel,
          image_size: openAiSize(post.format, runtime),
          media_url: mediaUrl,
          carousel_pages: isCarouselFormat(String(post.format ?? "")) ? carouselPages : [],
          carousel_media_urls: carouselMediaUrls,
          prompts: generated.map((item) => item.prompt),
        },
      })
      .select()
      .single();
    if (versionError) throw versionError;

    await supabase.from("post_versions").update({ is_current: false }).eq("post_id", post.id).neq("id", version.id);

    const { data: updatedPost, error: updateError } = await supabase
      .from("posts")
      .update({
        media_url: mediaUrl,
        carousel_media_urls: carouselMediaUrls,
        current_version_id: version.id,
        error_message: null,
        technical_detail: null,
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
        : "Imagem real 4:5 gerada, validada e salva no Supabase Storage.",
      technical_detail: `media_asset=${mediaAsset?.id}; model=${usedModel}; size=${openAiSize(post.format, runtime)}; urls=${generated.length}`,
    });

    return json(req, {
      ok: true,
      message: "Imagem real gerada e validada.",
      post: updatedPost,
      mediaUrl,
      mediaAsset,
      model: usedModel,
      prompt: basePrompt,
      carouselMediaUrls,
    }, 200, runtime);
  } catch (error) {
    const technical = stringifyError(error);
    await log({
      post_id: postId,
      module: "imagem",
      status: "erro",
      friendly_message: "Falha ao gerar imagem real.",
      technical_detail: technical,
    });
    if (postId) {
      await supabase
        .from("posts")
        .update({
          status: "erro_imagem",
          error_message: "Não foi possível gerar ou salvar a imagem. Verifique Secrets, modelo OpenAI, bucket e URL pública.",
          technical_detail: technical,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);
    }
    return json(req, { ok: false, error: technical || "Erro desconhecido" }, 400, runtime);
  }
});