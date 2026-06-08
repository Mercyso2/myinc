import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { cfg, loadRuntimeConfig, requiredCfg } from "../_shared/runtime-config.ts";
import {
  requireActiveUser,
  serviceClient,
  stringifyError,
  systemLog,
} from "../_shared/function-utils.ts";

type Row = Record<string, unknown>;
type Runtime = Record<string, string | null>;

function cors(req: Request, runtime?: Runtime) {
  const configured = cfg(runtime ?? {}, "CORS_ALLOW_ORIGIN", "http://localhost:5173");
  const origin = req.headers.get("Origin") ?? "";
  const allowed = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
function json(req: Request, body: unknown, status = 200, runtime?: Runtime) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req, runtime), "Content-Type": "application/json" },
  });
}
function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}
function isCarousel(format: unknown) {
  return String(format ?? "")
    .toLowerCase()
    .includes("carrossel");
}
function pageCount(format: unknown) {
  return String(format ?? "").includes("8") ? 8 : 5;
}

function preset(format: unknown) {
  const value = String(format ?? "").toLowerCase();
  if (value.includes("facebook") && !value.includes("story"))
    return {
      name: "Facebook horizontal 1.5:1",
      size: "1536x1024",
      composition: "horizontal, assunto no terço central e respiro lateral",
    };
  if (value.includes("quadrado") || value.includes("1080x1080"))
    return {
      name: "Quadrado 1:1",
      size: "1024x1024",
      composition: "quadrada, editorial e equilibrada",
    };
  if (value.includes("story") || value.includes("reels") || value.includes("1080x1920"))
    return {
      name: "Story/Reels 9:16",
      size: "1024x1536",
      composition: "vertical 9:16, com amplo respiro superior e inferior para overlays",
    };
  return {
    name: "Feed 4:5",
    size: "1024x1536",
    composition: "vertical 4:5 premium, assunto principal bem definido e área segura",
  };
}
function modelCandidates(runtime: Runtime) {
  const primary = requiredCfg(runtime, "OPENAI_IMAGE_MODEL", "Geração de imagem").trim();
  const fallback = cfg(runtime, "OPENAI_IMAGE_FALLBACK_MODELS", "gpt-image-1")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallback])];
}
function visualPrompt(
  post: Row,
  profile: unknown,
  rules: unknown,
  refs: unknown,
  feedback: unknown,
) {
  const format = preset(post.format);
  return [
    "CRIE UMA IMAGEM FOTOGRÁFICA/RENDER PREMIUM PARA A MYINC INCORPORADORA. A imagem final deve ser SEM TEXTO e pronta para receber overlay no frontend.",
    `A) CENA PRINCIPAL: ${String(post.image_prompt ?? post.creative_brief ?? post.theme ?? post.title ?? "arquitetura contemporânea brasileira premium")}. Objetivo: ${String(post.objective ?? "despertar desejo e confiança")}.`,
    "B) DIREÇÃO DE ARTE: campanha imobiliária brasileira sofisticada, contemporânea, autêntica, aspiracional sem ostentação; materiais nobres como pedra natural, madeira, vidro e concreto de acabamento impecável.",
    "C) FOTOGRAFIA/RENDER: realismo fotográfico de nível editorial, lente arquitetônica profissional, perspectiva correta, luz natural cinematográfica, exposição equilibrada, alta faixa dinâmica, detalhes e texturas fisicamente plausíveis.",
    `D) COMPOSIÇÃO: ${format.composition}; hierarquia visual clara, profundidade elegante e espaço negativo limpo para copy posterior.`,
    "E) PALETA MYINC: grafite profundo, off-white, areia, madeira natural, verde paisagismo e cobre apenas como acento discreto.",
    "F) ÁREA SEGURA: preserve uma área ampla, uniforme e sem elementos importantes para aplicação posterior de headline e CTA; nunca desenhe caixas de texto.",
    "G) TEXTO/LOGO: não gerar palavras, letras, números, placas legíveis, logotipos ou símbolos de marca. Não inventar logo MYINC nem marcas de terceiros.",
    "H) NEGATIVE PROMPT FORTE: sem watermark, sem assinatura, sem texto deformado, sem logo falso, sem panfleto, sem colagem, sem template, sem mockup genérico, sem render barato, sem visual infantil, sem neon, sem saturação excessiva, sem pessoas deformadas, sem mãos defeituosas, sem geometria impossível, sem objetos duplicados, sem baixa resolução.",
    `I) ESPECIFICAÇÃO: ${format.name}; geração técnica ${format.size}; preservar composição adequada ao recorte final de social media.`,
    `Contexto de marca permitido: ${JSON.stringify(profile ?? {})}. Regras ativas: ${JSON.stringify(rules ?? [])}. Referências aprovadas: ${JSON.stringify(refs ?? [])}.`,
    feedback ? `FEEDBACK HUMANO OBRIGATÓRIO PARA ESTA REGENERAÇÃO: ${String(feedback)}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
function fallbackPages(post: Row, count: number) {
  const scenes = [
    "fachada hero ao amanhecer",
    "entrada e paisagismo",
    "interior integrado com materiais nobres",
    "detalhe construtivo e acabamento",
    "lifestyle sofisticado e natural",
    "obra com precisão e segurança",
    "vista e entorno valorizado",
    "encerramento arquitetônico memorável",
  ];
  return Array.from({ length: count }, (_, index) => ({
    page: index + 1,
    visual_prompt: `${scenes[index]}; continuidade de luz, paleta e linguagem da campanha; enquadramento diferente das demais páginas`,
  }));
}
function pngInfo(bytes: Uint8Array) {
  const png =
    bytes.length > 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    mime: png ? "image/png" : "",
    width: png ? view.getUint32(16) : 0,
    height: png ? view.getUint32(20) : 0,
  };
}
async function generate(
  openAiKey: string,
  runtime: Runtime,
  prompt: string,
  size: string,
  log: (detail: string, status?: string) => Promise<void>,
) {
  const failures: string[] = [];
  for (const model of modelCandidates(runtime)) {
    await log(`Tentando modelo=${model}; size=${size}`, "tentativa");
    try {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          size,
          quality: cfg(runtime, "OPENAI_IMAGE_QUALITY", "high"),
          output_format: "png",
          n: 1,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      const encoded = object(
        Array.isArray(object(payload).data) ? object(payload).data[0] : {},
      ).b64_json;
      if (!response.ok || typeof encoded !== "string" || !encoded)
        throw new Error(
          `HTTP ${response.status}: ${stringifyError(object(payload).error ?? payload)}; b64_json=${Boolean(encoded)}`,
        );
      const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      const info = pngInfo(bytes);
      if (info.mime !== "image/png")
        throw new Error("MIME/assinatura inválida; esperado image/png.");
      if (bytes.byteLength < 150_000)
        throw new Error(`arquivo abaixo do quality gate (${bytes.byteLength} bytes)`);
      if (info.width < 1024 || info.height < 1024)
        throw new Error(`resolução abaixo do quality gate (${info.width}x${info.height})`);
      await log(
        `Modelo aprovado=${model}; bytes=${bytes.byteLength}; dimensões=${info.width}x${info.height}`,
        "sucesso_modelo",
      );
      return { bytes, model, info };
    } catch (error) {
      const detail = `${model}: ${stringifyError(error)}`;
      failures.push(detail);
      await log(detail, "erro_modelo");
    }
  }
  throw new Error(`Todos os modelos de imagem falharam. ${failures.join(" | ")}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const supabase = serviceClient();
  let runtime: Runtime = {};
  let postId = "";
  let post: Row | null = null;
  let userId: string | null = null;
  const requestId = crypto.randomUUID();
  const log = async (detail: string, status = "info", friendly = "Processamento de imagem.") =>
    systemLog(supabase, {
      brand_id: post?.brand_id ?? null,
      post_id: postId || null,
      user_id: userId,
      module: "imagem",
      type: "image",
      status,
      friendly_message: friendly,
      technical_detail: `[${requestId}] ${detail}`,
    });
  try {
    runtime = await loadRuntimeConfig(supabase);
    const auth = await requireActiveUser(req, supabase);
    userId = auth.user.id;
    const body = object(await req.json());
    postId = String(body.postId ?? "");
    if (!postId)
      return json(
        req,
        { ok: false, error: "Selecione um post antes de gerar a imagem." },
        400,
        runtime,
      );
    const found = await supabase.from("posts").select("*").eq("id", postId).single();
    if (found.error || !found.data)
      throw new Error(`Post não encontrado: ${stringifyError(found.error)}`);
    post = found.data;
    if (
      auth.profile?.brand_id &&
      auth.profile.brand_id !== post.brand_id &&
      auth.profile.role !== "admin"
    )
      throw new Error("Usuário sem acesso a este post.");
    const recent = await supabase
      .from("system_logs")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .eq("module", "imagem")
      .gte("created_at", new Date(Date.now() - 60_000).toISOString())
      .limit(4);
    if ((recent.data?.length ?? 0) >= 3)
      return json(
        req,
        { ok: false, error: "Aguarde um minuto antes de gerar novamente." },
        429,
        runtime,
      );
    const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Geração de imagem");
    modelCandidates(runtime);
    const bucket = cfg(runtime, "MEDIA_BUCKET", "creative-media");
    const buckets = await supabase.storage.listBuckets();
    const bucketRow = buckets.data?.find((item) => item.name === bucket);
    if (buckets.error || !bucketRow)
      throw new Error(`Bucket ${bucket} não existe: ${stringifyError(buckets.error)}`);
    if (!bucketRow.public)
      throw new Error(`Bucket ${bucket} precisa ser público para publicação Meta.`);
    const [profile, rules, refs, version] = await Promise.all([
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
        .eq("status", "referência aprovada")
        .is("archived_at", null)
        .limit(12),
      supabase
        .from("post_versions")
        .select("output_json")
        .eq("post_id", postId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const basePrompt = visualPrompt(post, profile.data, rules.data, refs.data, body.feedback);
    const count = pageCount(post.format);
    const output = object(version.data?.output_json);
    const pages =
      isCarousel(post.format) &&
      Array.isArray(output.carousel_pages) &&
      output.carousel_pages.length
        ? output.carousel_pages.slice(0, count).map(object)
        : fallbackPages(post, count);
    while (isCarousel(post.format) && pages.length < count)
      pages.push(fallbackPages(post, count)[pages.length]);
    const generated: Array<{ mediaUrl: string; mediaAsset: Row; model: string; prompt: string }> =
      [];
    const createAsset = async (prompt: string, index: number) => {
      const result = await generate(openAiKey, runtime, prompt, preset(post!.format).size, log);
      const path = `${post!.brand_id}/${postId}/${crypto.randomUUID()}.png`;
      const upload = await supabase.storage
        .from(bucket)
        .upload(path, result.bytes, { contentType: result.info.mime, upsert: false });
      if (upload.error) throw new Error(`Upload falhou: ${stringifyError(upload.error)}`);
      const mediaUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      if (!mediaUrl.startsWith("https://"))
        throw new Error("Storage não retornou URL HTTPS pública.");
      const head = await fetch(mediaUrl, { method: "HEAD" });
      if (!head.ok) throw new Error(`URL pública inacessível após upload: HTTP ${head.status}`);
      const asset = await supabase
        .from("media_assets")
        .insert({
          brand_id: post!.brand_id,
          post_id: postId,
          name: `${post!.title} - imagem ${index}`,
          type: "Imagem gerada",
          media_type: "Imagem gerada",
          bucket,
          path,
          url: mediaUrl,
          public_url: mediaUrl,
          preview_url: mediaUrl,
          mime_type: result.info.mime,
          size_bytes: result.bytes.byteLength,
          status: "ativo",
          tags: [
            "ia",
            "myinc",
            isCarousel(post!.format) ? "carrossel" : "imagem",
            `pagina-${index}`,
          ],
          origin: `openai:${result.model}`,
          usage_context: isCarousel(post!.format) ? "carousel_page" : "post_image",
          ai_allowed: true,
          storage_bucket: bucket,
          storage_path: path,
          is_final: index === 1,
          used_in_publish: false,
          notes: prompt,
          metadata: {
            image_model: result.model,
            image_size: preset(post!.format).size,
            width: result.info.width,
            height: result.info.height,
            prompt,
            carousel_page: isCarousel(post!.format) ? index : null,
          },
        })
        .select()
        .single();
      if (asset.error || !asset.data?.id)
        throw new Error(`media_assets não foi inserido: ${stringifyError(asset.error)}`);
      return { mediaUrl, mediaAsset: asset.data, model: result.model, prompt };
    };
    if (isCarousel(post.format))
      for (let i = 0; i < pages.length; i++)
        generated.push(
          await createAsset(
            `${basePrompt}\nCARROSSEL: página ${i + 1}/${count}. Direção específica: ${String(pages[i].visual_prompt ?? "")}. Manter continuidade visual e variar o enquadramento.`,
            i + 1,
          ),
        );
    else generated.push(await createAsset(basePrompt, 1));
    const mediaUrl = generated[0]?.mediaUrl ?? "";
    const carouselMediaUrls = isCarousel(post.format) ? generated.map((item) => item.mediaUrl) : [];
    if (!mediaUrl || (isCarousel(post.format) && carouselMediaUrls.length !== count))
      throw new Error("Quality gate final: URLs geradas incompletas.");
    const versionInsert = await supabase
      .from("post_versions")
      .insert({
        brand_id: post.brand_id,
        post_id: postId,
        version_label: `V${Date.now()}`,
        caption: post.caption,
        image_prompt: basePrompt,
        media_url: mediaUrl,
        quality_score: post.quality_score,
        human_feedback: body.feedback ?? null,
        is_current: true,
        output_json: {
          image_model: generated[0].model,
          image_size: preset(post.format).size,
          media_url: mediaUrl,
          carousel_pages: isCarousel(post.format) ? pages : [],
          carousel_media_urls: carouselMediaUrls,
          prompts: generated.map((item) => item.prompt),
        },
      })
      .select()
      .single();
    if (versionInsert.error || !versionInsert.data?.id)
      throw new Error(`post_versions não foi inserido: ${stringifyError(versionInsert.error)}`);
    await supabase
      .from("post_versions")
      .update({ is_current: false })
      .eq("post_id", postId)
      .neq("id", versionInsert.data.id);
    const update = await supabase
      .from("posts")
      .update({
        media_url: mediaUrl,
        carousel_media_urls: carouselMediaUrls,
        current_version_id: versionInsert.data.id,
        error_message: null,
        status: "aguardando_revisao",
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .select()
      .single();
    if (update.error || update.data?.media_url !== mediaUrl)
      throw new Error(`posts.media_url não foi atualizado: ${stringifyError(update.error)}`);
    await log(
      `Concluído; model=${generated[0].model}; assets=${generated.length}; version=${versionInsert.data.id}; url=${mediaUrl}`,
      "sucesso",
      "Imagem real gerada, salva e validada.",
    );
    return json(
      req,
      {
        ok: true,
        message: "Imagem real gerada e validada.",
        post: update.data,
        mediaUrl,
        carouselMediaUrls,
        model: generated[0].model,
        prompt: basePrompt,
        mediaAsset: generated[0].mediaAsset,
      },
      200,
      runtime,
    );
  } catch (error) {
    const technical = stringifyError(error);
    await log(technical, "erro", "Não foi possível gerar a imagem deste post.");
    if (postId)
      await supabase
        .from("posts")
        .update({
          status: "erro_imagem",
          error_message:
            "Não foi possível gerar ou salvar a imagem. Tente novamente ou contate o administrador.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);
    return json(
      req,
      {
        ok: false,
        error:
          "Não foi possível gerar ou salvar a imagem. Tente novamente; o detalhe técnico foi registrado.",
        requestId,
      },
      technical.includes("Sessao") || technical.includes("Token") ? 401 : 400,
      runtime,
    );
  }
});
