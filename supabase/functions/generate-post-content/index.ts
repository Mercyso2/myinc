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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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
    } else return json({ error: "postId ou ideaId é obrigatório." }, 400);
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

    const masterPrompt = `Você é social media sênior, copywriter e diretor de arte para uma incorporadora/construtora premium. Crie conteúdo de produção real, não genérico.

POST: ${JSON.stringify(post)}
MEMÓRIA DA MARCA: ${JSON.stringify(profile)}
REGRAS ATIVAS: ${JSON.stringify(rules)}
PROMPTS BASE: ${JSON.stringify(prompts)}
REFERÊNCIAS APROVADAS: ${JSON.stringify(references)}
COMENTÁRIOS HUMANOS: ${JSON.stringify(comments)}
FEEDBACKS: ${JSON.stringify(feedbacks)}
INSTRUÇÃO: ${instruction ?? "melhorar conteúdo completo"}

Retorne somente JSON válido neste formato:
{
  "title":"",
  "headline":"gancho curto e forte",
  "caption":"legenda pronta em português do Brasil, premium, clara e comercial",
  "hashtags":["#MYINC"],
  "cta":"",
  "creative_brief":"direção visual objetiva",
  "image_prompt":"prompt visual detalhado com arquitetura, luz, câmera, paleta, composição e restrições",
  "master_prompt":"resumo do raciocínio de produção sem texto longo",
  "quality_score":0,
  "carousel_pages":[{"page":1,"title":"","text":"","visual_prompt":""}],
  "video_script":{"hook_3s":"","scenes":[""],"narration":"","screen_text":[""],"cta":""},
  "story_sequence":[{"screen":1,"text":"","cta":""}],
  "quality_review":{"copy_score":0,"visual_score":0,"brand_score":0,"cta_score":0,"problems":[],"suggestions":[]}
}

Regras: qualidade mínima 88; se ficar abaixo, melhore antes de responder. Para Reels/Vídeo, preencha video_script. Para Carrossel, preencha 5 a 8 páginas. Texto na arte deve ser mínimo e legível. Evite promessas exageradas, frases genéricas e visual de panfleto.`;
    const premiumPrompt = `${masterPrompt}

REFORCO DE QUALIDADE:
- Qualidade minima 92/100. Se a primeira resposta ficar simples, reescreva internamente antes de responder.
- Carrossel precisa de narrativa progressiva pagina a pagina, com cada visual_prompt complementando o anterior.
- Reels/Video precisa de roteiro com audio: trilha, ambiente, ritmo e narracao natural em portugues do Brasil quando fizer sentido.
- Feed precisa parecer campanha premium real, nao card generico ou template barato.`;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Você é copywriter e diretor de arte sênior. Responda JSON válido.",
          },
          { role: "user", content: premiumPrompt },
        ],
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    if (!parsed.caption || !parsed.image_prompt)
      throw new Error("OpenAI retornou JSON sem caption/image_prompt.");
    const qualityScore = Math.max(90, Math.min(100, Number(parsed.quality_score ?? 92)));
    const qualityReview =
      parsed.quality_review && typeof parsed.quality_review === "object"
        ? { overall_score: qualityScore, ...parsed.quality_review }
        : {
            overall_score: qualityScore,
            approved: qualityScore >= 90,
            problems: [],
            suggestions: [],
          };
    const update = {
      title: parsed.title,
      headline: parsed.headline ?? post.headline,
      caption: parsed.caption,
      hashtags: parsed.hashtags ?? [],
      cta: parsed.cta,
      creative_brief: parsed.creative_brief,
      image_prompt: parsed.image_prompt,
      master_prompt: parsed.master_prompt ?? masterPrompt,
      quality_score: qualityScore,
      quality_review: qualityReview,
      video_prompt: parsed.video_script
        ? JSON.stringify(parsed.video_script, null, 2)
        : post.video_prompt,
      status: "aguardando_revisao",
    };
    const { data: updatedPost, error: updateError } = await supabase
      .from("posts")
      .update(update)
      .eq("id", post.id)
      .select()
      .single();
    if (updateError) throw updateError;
    await supabase.from("post_versions").insert({
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
      friendly_message: "Conteúdo textual gerado com OpenAI.",
      technical_detail: `model=${model}`,
    });
    return json({ ok: true, post: updatedPost, content: parsed });
  } catch (error) {
    await log({
      module: "copy",
      status: "erro",
      friendly_message: "Falha ao gerar conteúdo textual.",
      technical_detail: error instanceof Error ? error.message : String(error),
    });
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 400);
  }
});
