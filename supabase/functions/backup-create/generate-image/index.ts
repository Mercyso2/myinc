import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stringifyError } from "../_shared/function-utils.ts";
import { boolCfg, cfg, getCorsHeaders, loadRuntimeConfig, requiredCfg } from "../_shared/runtime-config.ts";

declare const EdgeRuntime:
  | { waitUntil?: (promise: Promise<unknown>) => void }
  | undefined;

type Row = Record<string, unknown>;
type Runtime = Record<string, string | null>;
type SupabaseClient = ReturnType<typeof createClient>;

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

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

  if (
    normalized.includes("story") ||
    normalized.includes("reels") ||
    normalized.includes("vídeo") ||
    normalized.includes("video")
  ) {
    return cfg(runtime, "OPENAI_IMAGE_SIZE_STORY", "1024x1536");
  }

  // Para feed 4:5, a imagem final é exibida como 1080x1350 no app.
  // A geração técnica usa 1024x1536 para reduzir latência e não estourar o Edge Function.
  return cfg(runtime, "OPENAI_IMAGE_SIZE_FEED", "1024x1536");
}

function modelCandidates(runtime: Runtime) {
  // Para Supabase Edge Function, o padrão precisa ser o modelo mais rápido.
  // gpt-image-2 pode passar de 150s dependendo de fila/qualidade/tamanho.
  const primary = cfg(runtime, "OPENAI_IMAGE_MODEL", "gpt-image-1-mini");
  const fallbacks = cfg(runtime, "OPENAI_IMAGE_FALLBACK_MODELS", "gpt-image-2,gpt-image-1.5,gpt-image-1")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set([primary, ...fallbacks])];
}

function extensionFromMime(mime: string) {
  if (mime === "image/webp") return "webp";
  if (mime === "image/jpeg") return "jpg";
  return "png";
}

function detectMime(bytes: Uint8Array, requestedFormat: string) {
  const fmt = requestedFormat.toLowerCase();

  const isPng =
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;

  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;

  const isWebp =
    bytes.length > 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (isWebp) return "image/webp";
  if (isJpeg) return "image/jpeg";
  if (isPng) return "image/png";

  if (fmt === "webp") return "image/webp";
  if (fmt === "jpeg" || fmt === "jpg") return "image/jpeg";
  return "image/png";
}

function imagePrompt({
  post,
  profile,
  visualRules,
  refs,
  runtime,
  page,
  totalPages,
  feedback,
}: {
  post: Row;
  profile: unknown;
  visualRules: unknown;
  refs: unknown;
  runtime: Runtime;
  page: number;
  totalPages: number;
  feedback?: unknown;
}) {
  const format = String(post.format ?? "Feed 4:5 / 1080x1350");
  const size = openAiSize(format, runtime);
  const pageNote =
    totalPages > 1
      ? `PÁGINA ${page}/${totalPages} DO CARROSSEL. Criar uma cena própria, mantendo continuidade visual com as demais páginas.`
      : "PEÇA ÚNICA.";

  const scenes = [
    "fachada hero ou imagem mais aspiracional da campanha",
    "entrada, lobby, paisagismo ou chegada do empreendimento",
    "interior integrado com materiais nobres e luz natural",
    "detalhes de acabamento, textura, precisão e qualidade",
    "lifestyle sofisticado, humano e natural, sem deformações",
    "obra, confiança técnica, processo ou credibilidade da incorporadora",
    "vista, entorno, valorização imobiliária ou localização",
    "fechamento visual aspiracional com área limpa para CTA",
  ];

  return [
    "CRIE UMA IMAGEM PUBLICITÁRIA PREMIUM PARA SOCIAL MEDIA DA MYINC INCORPORADORA.",
    "A imagem deve parecer campanha real de incorporadora de alto padrão: fotografia/render editorial, sofisticado, moderno e comercial.",
    "NÃO gerar texto, letras, números, logotipos, placas legíveis, marcas d’água ou assinatura. O texto será aplicado depois pelo editor do app.",
    pageNote,
    totalPages > 1 ? `CENA DESTA PÁGINA: ${scenes[(page - 1) % scenes.length]}.` : "",
    `FORMATO FINAL DO APP: ${format}. Geração técnica: ${size}.`,
    `POST: ${String(post.title ?? post.theme ?? "MYINC")}.`,
    `BRIEF: ${String(post.image_prompt ?? post.creative_brief ?? post.title ?? "Arquitetura contemporânea brasileira premium")}.`,
    `OBJETIVO: ${String(post.objective ?? "gerar desejo, autoridade e leads qualificados")}. CANAL: ${String(post.channel ?? "Instagram/Facebook")}.`,
    "DIREÇÃO DE ARTE: arquitetura contemporânea brasileira, alto padrão, estética editorial, materiais nobres, pedra natural, madeira, vidro, concreto bem acabado e paisagismo premium.",
    "FOTOGRAFIA/RENDER: realismo fotográfico, lente arquitetônica profissional, perspectiva correta, luz natural cinematográfica, alta faixa dinâmica, profundidade elegante e acabamento impecável.",
    "COMPOSIÇÃO: assunto principal forte, muito respiro, área segura limpa para headline e CTA, hierarquia visual clara, sem excesso de elementos, pronto para Instagram.",
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
  const outputFormat = cfg(runtime, "OPENAI_IMAGE_FORMAT", "webp").toLowerCase();
  const timeoutMs = Number(cfg(runtime, "OPENAI_IMAGE_TIMEOUT_MS", "115000"));
  const quality = cfg(runtime, "OPENAI_IMAGE_QUALITY", "low");

  for (const model of modelCandidates(runtime)) {
    try {
      const imageResponse = await fetchWithTimeout(
        "https://api.openai.com/v1/images/generations",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt,
            size,
            output_format: outputFormat,
            quality,
            n: 1,
          }),
        },
        timeoutMs,
      );

      const imageJson = await imageResponse.json().catch(() => ({}));
      const data = asObject(imageJson).data;
      const first = Array.isArray(data) ? asObject(data[0]) : {};
      const encoded = first.b64_json;

      if (imageResponse.ok && typeof encoded === "string" && encoded) {
        const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
        const mime = detectMime(bytes, outputFormat);

        if (bytes.byteLength < 20_000) {
          errors.push(`${model}: imagem muito pequena (${bytes.byteLength} bytes)`);
          continue;
        }

        return { bytes, usedModel: model, mime, quality };
      }

      errors.push(`${model}: HTTP ${imageResponse.status} ${stringifyError(asObject(imageJson).error ?? imageJson)}`);
    } catch (error) {
      errors.push(`${model}: ${stringifyError(error)}`);
    }
  }

  throw new Error(`OpenAI não retornou imagem válida. ${errors.join(" | ")}`);
}

async function safeLog(supabase: SupabaseClient, row: Row) {
  try {
    await supabase.from("system_logs").insert(row);
  } catch {
    // Logs não podem derrubar a geração.
  }
}

async function markPostError(supabase: SupabaseClient, postId: string, error: unknown) {
  const message = stringifyError(error).slice(0, 1500);
  try {
    await supabase
      .from("posts")
      .update({
        status: "image_error",
        technical_detail: `Erro na geração da imagem: ${message}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
  } catch {
    // Não bloquear.
  }
}

async function runImageGeneration({
  supabase,
  runtime,
  openAiKey,
  body,
  postId,
}: {
  supabase: SupabaseClient;
  runtime: Runtime;
  openAiKey: string;
  body: Row;
  postId: string;
}) {
  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("*")
    .eq("id", postId)
    .single();

  if (postError || !post) {
    throw postError ?? new Error("Post não encontrado.");
  }

  const format = String(post.format ?? "");
  const totalPages = isCarouselFormat(format) ? carouselPageCount(format) : 1;
  const page = Math.max(1, Math.min(asNumber(body.page, 1), totalPages));

  const mediaBucket = cfg(runtime, "MEDIA_BUCKET", "creative-media");
  const { data: bucketRows, error: bucketError } = await supabase.storage.listBuckets();
  const bucket = (bucketRows ?? []).find((item) => item.name === mediaBucket);

  if (bucketError || !bucket) {
    throw new Error(`Bucket ${mediaBucket} não encontrado. ${stringifyError(bucketError)}`);
  }

  if (!bucket.public) {
    throw new Error(`Bucket ${mediaBucket} precisa estar público para preview/publicação.`);
  }

  await supabase
    .from("posts")
    .update({
      status: "generating_image",
      technical_detail: totalPages > 1 ? `Gerando imagem ${page}/${totalPages} em background` : "Gerando imagem em background",
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);

  const [{ data: profile }, { data: visualRules }, { data: refs }] = await Promise.all([
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
  ]);

  const prompt = imagePrompt({
    post,
    profile,
    visualRules,
    refs,
    runtime,
    page,
    totalPages,
    feedback: body.feedback,
  });

  const size = openAiSize(format, runtime);
  const { bytes, usedModel, mime, quality } = await generateImageBytes({ openAiKey, runtime, prompt, size });
  const ext = extensionFromMime(mime);

  const filePath =
    totalPages > 1
      ? `${post.brand_id}/${postId}/carousel-page-${page}-${Date.now()}.${ext}`
      : `${post.brand_id}/${postId}/hero-${Date.now()}.${ext}`;

  const upload = await supabase.storage.from(mediaBucket).upload(filePath, bytes, {
    contentType: mime,
    upsert: true,
  });

  if (upload.error) {
    throw upload.error;
  }

  const { data: publicUrlData } = supabase.storage.from(mediaBucket).getPublicUrl(filePath);
  const publicUrl = publicUrlData.publicUrl;

  const existingCarousel = Array.isArray(post.carousel_media_urls)
    ? [...(post.carousel_media_urls as unknown[]).map(String)]
    : [];
  const carouselUrls = [...existingCarousel];

  if (totalPages > 1) {
    carouselUrls[page - 1] = publicUrl;
  }

  const outputJson = {
    image_url: publicUrl,
    media_url: publicUrl,
    image_model: usedModel,
    image_size: size,
    image_quality: quality,
    image_format: ext,
    generated_at: new Date().toISOString(),
    page,
    totalPages,
    prompt,
  };

  await supabase
    .from("posts")
    .update({
      image_url: totalPages > 1 ? carouselUrls[0] ?? publicUrl : publicUrl,
      media_url: totalPages > 1 ? carouselUrls[0] ?? publicUrl : publicUrl,
      carousel_media_urls: totalPages > 1 ? carouselUrls : null,
      status: totalPages > 1 && carouselUrls.filter(Boolean).length < totalPages ? "partial_image_ready" : "image_ready",
      technical_detail:
        totalPages > 1
          ? `Imagem ${page}/${totalPages} criada com ${usedModel}.`
          : `Imagem criada com ${usedModel}.`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);

  try {
    await supabase.from("post_versions").insert({
      post_id: postId,
      brand_id: post.brand_id,
      version_type: "image",
      status: "generated",
      image_url: publicUrl,
      output_json: outputJson,
      is_current: true,
    });
  } catch {
    // Não bloqueia a geração caso post_versions tenha schema antigo.
  }

  await safeLog(supabase, {
    type: "image_generation",
    status: "success",
    brand_id: post.brand_id,
    post_id: postId,
    detail: totalPages > 1 ? `Página ${page}/${totalPages} criada.` : "Imagem criada.",
    payload: { usedModel, size, mime, bytes: bytes.byteLength, quality },
  });

  return {
    ok: true,
    postId,
    imageUrl: publicUrl,
    mediaUrl: publicUrl,
    carouselMediaUrls: totalPages > 1 ? carouselUrls : undefined,
    page,
    totalPages,
    usedModel,
    size,
    mime,
    bytes: bytes.byteLength,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: getCorsHeaders(req) });
  }

  let runtime: Runtime = {};

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRole);
    runtime = await loadRuntimeConfig(supabase);

    if (req.method !== "POST") {
      return json(req, { ok: false, error: "Método inválido. Use POST." }, 405, runtime);
    }

    const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Geração de imagem");
    const body = (await req.json().catch(() => ({}))) as Row;
    const postId = asString(body.postId ?? body.post_id);

    if (!postId) {
      return json(req, { ok: false, error: "postId é obrigatório." }, 400, runtime);
    }

    const shouldRunInBackground =
      boolCfg(runtime, "OPENAI_IMAGE_BACKGROUND", true) && body.wait !== true && body.sync !== true;

    if (shouldRunInBackground) {
      await supabase
        .from("posts")
        .update({
          status: "generating_image",
          technical_detail: "Imagem aceita. A geração continuará em background; aguarde e recarregue/atualize o card.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);

      const task = runImageGeneration({ supabase, runtime, openAiKey, body, postId }).catch(async (error) => {
        await markPostError(supabase, postId, error);
        await safeLog(supabase, {
          type: "image_generation",
          status: "error",
          post_id: postId,
          detail: stringifyError(error),
          payload: { source: "background" },
        });
      });

      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(task);
      } else {
        // Ambiente local: deixa a promise iniciar sem bloquear resposta.
        task.catch(() => undefined);
      }

      return json(
        req,
        {
          ok: true,
          accepted: true,
          async: true,
          postId,
          status: "generating_image",
          message:
            "Geração aceita em background. O navegador não ficará preso no limite de 150s. Aguarde o status virar image_ready.",
        },
        202,
        runtime,
      );
    }

    const result = await runImageGeneration({ supabase, runtime, openAiKey, body, postId });
    return json(req, result, 200, runtime);
  } catch (error) {
    return json(
      req,
      {
        ok: false,
        error: stringifyError(error),
        hint:
          "O modo síncrono estoura 150s no Supabase. Use OPENAI_IMAGE_BACKGROUND=true e OPENAI_IMAGE_MODEL=gpt-image-1-mini para estabilizar.",
      },
      500,
      runtime,
    );
  }
});
