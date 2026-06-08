import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { cfg, loadRuntimeConfig } from "../_shared/runtime-config.ts";
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
function quality(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
}
function isCarousel(format: unknown) {
  return String(format ?? "")
    .toLowerCase()
    .includes("carrossel");
}
function targetPages(format: unknown) {
  return String(format ?? "").includes("8") ? 8 : 5;
}
function visualRequirements(format: unknown) {
  const fmt = String(format ?? "Feed 4:5");
  return `O image_prompt deve ser longo e diretamente aproveitável pela Edge Function generate-image. Divida mentalmente em cena principal, direção de arte, fotografia/render, composição, paleta MYINC, área segura para texto, restrições de texto/logo, negative prompt forte e especificação do formato ${fmt}. Preferir imagem sem texto. Proibir logo falso, watermark, letras distorcidas, panfleto, mockup genérico, render barato e aparência infantil.`;
}
async function callOpenAI(openAiKey: string, model: string, prompt: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você é copywriter, estrategista e diretor de arte sênior para incorporadora premium. Responda apenas JSON válido.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(stringifyError(data));
  const parsed = JSON.parse(String(data.choices?.[0]?.message?.content ?? "{}"));
  if (!parsed.caption || !parsed.image_prompt)
    throw new Error("OpenAI retornou JSON sem caption/image_prompt.");
  return parsed as Row;
}
function normalizePages(parsed: Row, post: Row) {
  const count = targetPages(post.format);
  const raw = Array.isArray(parsed.carousel_pages)
    ? parsed.carousel_pages.map(object).slice(0, count)
    : [];
  while (isCarousel(post.format) && raw.length < count)
    raw.push({
      page: raw.length + 1,
      title: raw.length === 0 ? parsed.headline : `Página ${raw.length + 1}`,
      text: raw.length + 1 === count ? parsed.cta : parsed.caption,
      visual_prompt: `${String(parsed.image_prompt)} Continuidade visual premium; página ${raw.length + 1}/${count}; enquadramento diferente.`,
    });
  return isCarousel(post.format)
    ? raw.map((page, index) => ({
        ...page,
        page: Number(page.page ?? index + 1),
        visual_prompt: String(page.visual_prompt ?? parsed.image_prompt),
      }))
    : [];
}
function buildPrompt(post: Row, context: Row, instruction: unknown, improvement?: Row) {
  return `Crie conteúdo de produção real para social media da MYINC Incorporadora, com copy premium em português do Brasil e direção visual pronta para geração real de imagem.

POST: ${JSON.stringify(post)}
CONTEXTO: ${JSON.stringify(context)}
INSTRUÇÃO HUMANA: ${String(instruction ?? "melhorar conteúdo completo")}
${improvement ? `A TENTATIVA ANTERIOR ficou abaixo de 88. Corrija estes problemas e aumente especificidade: ${JSON.stringify(improvement)}` : ""}

Retorne somente JSON válido:
{
  "title":"",
  "headline":"gancho curto e forte",
  "caption":"legenda premium, clara, comercial e natural",
  "hashtags":["#MYINC"],
  "cta":"",
  "creative_brief":"direção visual objetiva",
  "image_prompt":"prompt visual muito detalhado",
  "master_prompt":"resumo do racional de produção",
  "quality_score":0,
  "carousel_pages":[{"page":1,"title":"","text":"","visual_prompt":"prompt específico da página"}],
  "video_script":{"hook_3s":"","scenes":[""],"narration":"","screen_text":[""],"cta":""},
  "story_sequence":[{"screen":1,"text":"","cta":""}],
  "quality_review":{"copy_score":0,"visual_score":0,"brand_score":0,"cta_score":0,"approved":false,"problems":[],"suggestions":[]}
}

Regras obrigatórias:
- Não invente score artificial. Dê quality_score honesto de 0 a 100.
- Se Carrossel, crie narrativa progressiva com ${targetPages(post.format)} páginas e visual_prompt específico por página, sem repetir enquadramento.
- Evite promessas exageradas, frases genéricas, excesso de emojis e aparência de panfleto.
- ${visualRequirements(post.format)}
- Para incorporadora: arquitetura contemporânea brasileira premium, fachadas, interiores, lifestyle, obra, lançamento, investimento e materiais nobres.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const supabase = serviceClient();
  let runtime: Runtime = {};
  let postId = "";
  let userId: string | null = null;
  let brandId: unknown = null;
  try {
    runtime = await loadRuntimeConfig(supabase);
    const auth = await requireActiveUser(req, supabase);
    userId = auth.user.id;
    const openAiKey = cfg(runtime, "OPENAI_API_KEY");
    if (!openAiKey) throw new Error("OPENAI_API_KEY ausente no backend.");
    const model = cfg(runtime, "OPENAI_TEXT_MODEL", "gpt-5.2");
    const { postId: bodyPostId, ideaId, instruction } = object(await req.json());
    postId = String(bodyPostId ?? "");
    let post: Row | null = null;
    if (postId) {
      const result = await supabase.from("posts").select("*").eq("id", postId).single();
      if (result.error || !result.data)
        throw new Error(`Post não encontrado: ${stringifyError(result.error)}`);
      post = result.data;
    } else if (ideaId) {
      const idea = await supabase.from("post_ideas").select("*").eq("id", String(ideaId)).single();
      if (idea.error || !idea.data)
        throw new Error(`Ideia não encontrada: ${stringifyError(idea.error)}`);
      const created = await supabase
        .from("posts")
        .insert({
          brand_id: idea.data.brand_id,
          post_idea_id: idea.data.id,
          title: idea.data.title,
          theme: idea.data.theme,
          objective: idea.data.objective,
          channel: idea.data.channel ?? "Instagram",
          format: idea.data.format ?? "Feed 1080x1350",
          scheduled_at: idea.data.suggested_date,
          creative_brief: idea.data.initial_prompt,
          image_prompt: idea.data.initial_prompt,
          status: "em_producao",
        })
        .select()
        .single();
      if (created.error || !created.data)
        throw new Error(`Falha ao criar post: ${stringifyError(created.error)}`);
      post = created.data;
      postId = String(post.id);
    }
    if (!post) throw new Error("Informe postId ou ideaId.");
    brandId = post.brand_id;
    if (
      auth.profile?.brand_id &&
      auth.profile.brand_id !== brandId &&
      auth.profile.role !== "admin"
    )
      throw new Error("Usuário sem acesso a este conteúdo.");
    const [profile, rules, prompts, references, comments, feedbacks] = await Promise.all([
      supabase.from("brand_profiles").select("*").eq("brand_id", brandId).maybeSingle(),
      supabase
        .from("ai_brain_rules")
        .select("title,rule_type,content,priority")
        .eq("brand_id", brandId)
        .eq("active", true)
        .is("archived_at", null)
        .order("priority"),
      supabase
        .from("ai_prompt_templates")
        .select("name,content")
        .eq("brand_id", brandId)
        .eq("active", true)
        .is("archived_at", null),
      supabase
        .from("library_items")
        .select("name,notes,ai_usage_rule,url,status")
        .eq("brand_id", brandId)
        .eq("status", "referência aprovada")
        .is("archived_at", null)
        .limit(20),
      supabase
        .from("content_comments")
        .select("comment,status")
        .eq("post_id", postId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("ai_feedbacks")
        .select("feedback_type,feedback_note")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    const context = {
      profile: profile.data,
      rules: rules.data,
      prompts: prompts.data,
      references: references.data,
      comments: comments.data,
      feedbacks: feedbacks.data,
    };
    let parsed = await callOpenAI(openAiKey, model, buildPrompt(post, context, instruction));
    let score = quality(parsed.quality_score);
    if (score < 88) {
      parsed = await callOpenAI(
        openAiKey,
        model,
        buildPrompt(post, context, instruction, {
          quality_score: score,
          quality_review: parsed.quality_review,
          image_prompt: parsed.image_prompt,
        }),
      );
      score = quality(parsed.quality_score);
    }
    const carouselPages = normalizePages(parsed, post);
    const review = object(parsed.quality_review);
    const qualityReview = {
      overall_score: score,
      approved: score >= 88,
      ...review,
      problems: Array.isArray(review.problems) ? review.problems : [],
      suggestions: Array.isArray(review.suggestions) ? review.suggestions : [],
    };
    const nextStatus = score >= 88 ? "aguardando_revisao" : "necessita_revisao";
    const update = await supabase
      .from("posts")
      .update({
        title: parsed.title ?? post.title,
        headline: parsed.headline ?? post.headline,
        caption: parsed.caption,
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : ["#MYINC"],
        cta: parsed.cta,
        creative_brief: parsed.creative_brief,
        image_prompt: parsed.image_prompt,
        master_prompt: parsed.master_prompt ?? buildPrompt(post, context, instruction),
        quality_score: score,
        quality_review: qualityReview,
        video_prompt: parsed.video_script
          ? JSON.stringify(parsed.video_script, null, 2)
          : post.video_prompt,
        status: nextStatus,
        error_message:
          score >= 88 ? null : "Conteúdo gerado abaixo do score mínimo; revisão humana necessária.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .select()
      .single();
    if (update.error) throw update.error;
    await supabase.from("post_versions").insert({
      brand_id: brandId,
      post_id: postId,
      version_label: `V${Date.now()}`,
      caption: parsed.caption,
      image_prompt: parsed.image_prompt,
      quality_score: score,
      human_feedback: instruction ?? null,
      output_json: {
        ...parsed,
        quality_score: score,
        quality_review: qualityReview,
        carousel_pages: carouselPages,
      },
    });
    await systemLog(supabase, {
      brand_id: brandId,
      post_id: postId,
      user_id: userId,
      module: "copy",
      type: "ai",
      status: score >= 88 ? "sucesso" : "necessita_revisao",
      friendly_message:
        score >= 88
          ? "Conteúdo textual gerado com OpenAI."
          : "Conteúdo criado, mas precisa de revisão humana.",
      technical_detail: `model=${model}; quality_score=${score}; status=${nextStatus}`,
    });
    return json(
      req,
      {
        ok: true,
        post: update.data,
        content: { ...parsed, quality_score: score, carousel_pages: carouselPages },
      },
      200,
      runtime,
    );
  } catch (error) {
    await systemLog(supabase, {
      brand_id: brandId,
      post_id: postId || null,
      user_id: userId,
      module: "copy",
      type: "ai",
      status: "erro",
      friendly_message: "Falha ao gerar conteúdo textual.",
      technical_detail: stringifyError(error),
    });
    return json(
      req,
      { ok: false, error: "Não foi possível gerar o conteúdo. O detalhe técnico foi registrado." },
      400,
      runtime,
    );
  }
});
