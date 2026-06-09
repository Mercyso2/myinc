import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stringifyError } from "../_shared/function-utils.ts";
import { cfg, getCorsHeaders, loadRuntimeConfig, requiredCfg } from "../_shared/runtime-config.ts";

function json(req: Request, body: unknown, status = 200, runtime: Record<string, string | null> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req, runtime), "Content-Type": "application/json" },
  });
}
function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente no backend. Operação real não executada.`);
  return value;
}
function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function extractResponseText(data: unknown) {
  const payload = object(data);
  if (typeof payload.output_text === "string") return payload.output_text;
  if (Array.isArray(payload.output)) {
    return payload.output
      .flatMap((item) => (Array.isArray(object(item).content) ? object(item).content : []))
      .map((content) => object(content).text ?? object(content).value ?? "")
      .join("\n")
      .trim();
  }
  const firstChoice = object(Array.isArray(payload.choices) ? payload.choices[0] : {});
  return String(object(firstChoice.message).content ?? "").trim();
}

serve(async (req) => {
  const runtimeForOptions = {} as Record<string, string | null>;
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req, runtimeForOptions) });
  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const runtime = await loadRuntimeConfig(supabase);
  const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Geração de conteúdo");
  const model = cfg(runtime, "OPENAI_TEXT_MODEL", "gpt-5.5");
  async function log(row: Record<string, unknown>) {
    await supabase.from("system_logs").insert({ type: row.type ?? "ai", ...row });
  }
  try {
    const { postId, ideaId, instruction } = await req.json();
    let post: Record<string, unknown> | null = null;
    if (postId) {
      const { data, error } = await supabase.from("posts").select("*").eq("id", postId).single();
      if (error) throw error;
      post = data;
    } else if (ideaId) {
      const { data: idea, error } = await supabase
        .from("post_ideas")
        .select("*")
        .eq("id", ideaId)
        .single();
      if (error) throw error;
      const { data: created, error: createError } = await supabase
        .from("posts")
        .insert({
          brand_id: idea.brand_id,
          monthly_plan_id: idea.monthly_plan_id,
          title: idea.theme ?? idea.headline,
          channel: idea.channel,
          format: idea.format,
          scheduled_at: idea.suggested_at,
          objective: idea.objective,
          theme: idea.theme,
          headline: idea.headline,
          caption: idea.short_text,
          cta: idea.cta,
          image_prompt: idea.initial_prompt,
          creative_brief: idea.visual_idea,
          quality_score: idea.predicted_score ?? 0,
          status: "em_producao",
        })
        .select()
        .single();
      if (createError) throw createError;
      post = created;
    } else return json(req, { error: "postId ou ideaId é obrigatório." }, 400, runtime);
    if (!post) throw new Error("Post não encontrado.");

    const brandId = String(post.brand_id);
    const [
      { data: profile },
      { data: rules },
      { data: prompts },
      { data: references },
      { data: comments },
      { data: feedbacks },
    ] = await Promise.all([
      supabase.from("brand_profiles").select("*").eq("brand_id", brandId).maybeSingle(),
      supabase
        .from("ai_brain_rules")
        .select("category,content,priority")
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
        .eq("post_id", post.id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("ai_feedbacks")
        .select("feedback_type,feedback_note")
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const premiumPrompt = `Você é um social media sênior, copywriter, estrategista comercial e diretor de arte para a MYINC, incorporadora/construtora premium.

MISSÃO: gerar uma publicação real, vendável e sofisticada para Instagram/Facebook, pronta para revisão humana.
O resultado precisa parecer trabalho de agência premium: nada genérico, nada raso, nada com cara de template barato.

POST: ${JSON.stringify(post)}
MEMÓRIA DA MARCA: ${JSON.stringify(profile)}
REGRAS ATIVAS DO CÉREBRO IA: ${JSON.stringify(rules)}
PROMPTS BASE: ${JSON.stringify(prompts)}
REFERÊNCIAS APROVADAS: ${JSON.stringify(references)}
COMENTÁRIOS HUMANOS: ${JSON.stringify(comments)}
FEEDBACKS ANTERIORES: ${JSON.stringify(feedbacks)}
INSTRUÇÃO ATUAL: ${instruction ?? "criar ou melhorar conteúdo completo"}

PADRÃO CRIATIVO OBRIGATÓRIO:
- Copy em português do Brasil, natural, elegante, persuasiva e sem exageros jurídicos/comerciais.
- Headline curta, forte, com linguagem de incorporação premium.
- CTA objetivo, sem parecer spam.
- Hashtags poucas e estratégicas.
- Creative brief deve orientar uma arte 4:5 equivalente a 1080x1350 para feed, ou o formato correto do post.
- Image prompt deve ser SEM TEXTO NA IMAGEM, SEM LOGO, SEM LETRAS, SEM NÚMEROS; o app aplicará overlay depois.
- Para imagem: detalhe cena, lente, luz, composição, materiais, paleta MYINC, área segura e negative prompt.
- Para carrossel: crie narrativa de 5 a 8 páginas, cada página com visual diferente e continuidade de campanha.
- Para Reels/Vídeo: roteiro com gancho de 3 segundos, cenas, narração, textos de tela curtos e CTA.
- Se o conteúdo estiver abaixo de 90/100, corrija antes de devolver.

Retorne SOMENTE JSON válido neste formato:
{
  "title":"",
  "headline":"gancho curto e forte",
  "caption":"legenda pronta em português do Brasil, premium, clara e comercial",
  "hashtags":["#MYINC"],
  "cta":"",
  "creative_brief":"direção visual objetiva para designer/IA",
  "image_prompt":"prompt visual premium detalhado, sem texto na imagem, sem logo, com composição 4:5 quando for feed",
  "master_prompt":"resumo operacional do comando usado",
  "quality_score":0,
  "carousel_pages":[{"page":1,"title":"","text":"","visual_prompt":""}],
  "video_script":{"hook_3s":"","scenes":[""],"narration":"","screen_text":[""],"cta":""},
  "story_sequence":[{"screen":1,"text":"","cta":""}],
  "quality_review":{"copy_score":0,"visual_score":0,"brand_score":0,"cta_score":0,"problems":[],"suggestions":[]}
}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "Você é copywriter e diretor de arte sênior. Responda somente JSON válido, sem markdown.",
          },
          { role: "user", content: premiumPrompt },
        ],
        text: { format: { type: "json_object" } },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(stringifyError(data));
    const rawText = extractResponseText(data);
    const parsed = JSON.parse(rawText || "{}");
    if (!parsed.caption || !parsed.image_prompt)
      throw new Error("OpenAI retornou JSON sem caption/image_prompt.");
    const qualityScore = Math.max(0, Math.min(100, Number(parsed.quality_score ?? 0)));
    const qualityReview =
      parsed.quality_review && typeof parsed.quality_review === "object"
        ? { overall_score: qualityScore, ...parsed.quality_review }
        : {
            overall_score: qualityScore,
            approved: qualityScore >= 88,
            problems: qualityScore < 88 ? ["Score abaixo do padrão premium definido."] : [],
            suggestions: qualityScore < 88 ? ["Solicite uma nova versão premium antes de publicar."] : [],
          };
    const update = {
      title: parsed.title,
      headline: parsed.headline ?? post.headline,
      caption: parsed.caption,
      hashtags: parsed.hashtags ?? [],
      cta: parsed.cta,
      creative_brief: parsed.creative_brief,
      image_prompt: parsed.image_prompt,
      master_prompt: parsed.master_prompt ?? premiumPrompt,
      quality_score: qualityScore,
      quality_review: qualityReview,
      video_prompt: parsed.video_script ? JSON.stringify(parsed.video_script, null, 2) : post.video_prompt,
      status: qualityScore >= 88 ? "aguardando_revisao" : "ajuste_solicitado",
      error_message: null,
      technical_detail: null,
    };
    const { data: updatedPost, error: updateError } = await supabase
      .from("posts")
      .update(update)
      .eq("id", post.id)
      .select()
      .single();
    if (updateError) throw updateError;
    await supabase.from("post_versions").insert({
      brand_id: brandId,
      post_id: post.id,
      version_label: `V${Date.now()}`,
      caption: parsed.caption,
      image_prompt: parsed.image_prompt,
      quality_score: qualityScore,
      human_feedback: instruction ?? null,
      output_json: { ...parsed, quality_score: qualityScore, quality_review: qualityReview },
    });
    await log({
      brand_id: brandId,
      post_id: post.id,
      module: "copy",
      status: "sucesso",
      friendly_message: "Conteúdo textual gerado com OpenAI Responses API.",
      technical_detail: `model=${model}`,
    });
    return json(req, { ok: true, post: updatedPost, content: parsed }, 200, runtime);
  } catch (error) {
    await log({
      module: "copy",
      status: "erro",
      friendly_message: "Falha ao gerar conteúdo textual.",
      technical_detail: stringifyError(error),
    });
    return json(req, { error: stringifyError(error) || "Erro desconhecido" }, 400, runtime);
  }
});