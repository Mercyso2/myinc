import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  errorJson,
  requireActiveUser,
  serviceClient,
  systemLog,
} from "../_shared/function-utils.ts";
import { cfg, json, loadRuntimeConfig, options, requiredCfg } from "../_shared/runtime-config.ts";

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("OpenAI retornou JSON invalido para planejamento.");
  }
}

function fallbackIdeas(payload: Record<string, unknown>, count: number) {
  const formats = Array.isArray(payload.formats) ? payload.formats : ["Feed 1080x1350"];
  return Array.from({ length: count }, (_, index) => ({
    title: `Conteudo premium MYINC ${index + 1}`,
    headline: `Um novo olhar para ${payload.region ?? "a sua regiao"}`,
    short_text: "Ideia inicial gerada em modo mock controlado para desenvolvimento.",
    cta: "Fale com a equipe MYINC",
    visual_idea:
      "Arquitetura premium, luz natural, composicao limpa e paleta grafite/off-white/cobre.",
    initial_prompt:
      "Imagem premium de empreendimento imobiliario de alto padrao, sem texto excessivo.",
    theme: String(payload.campaign ?? "Planejamento editorial"),
    objective: String(payload.monthlyObjective ?? "Gerar autoridade e oportunidades comerciais"),
    channel: Array.isArray(payload.channels)
      ? String(payload.channels[index % payload.channels.length])
      : "Instagram",
    format: String(formats[index % formats.length]),
    priority: index + 1,
    predicted_score: 82,
    status: "rascunho",
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const payload = await req.json();
    const brandId = String(payload.brandId ?? "");
    if (!brandId) throw new Error("brandId e obrigatorio.");

    if (payload.mode === "regenerate_idea" && payload.ideaId) {
      const { data: idea, error } = await supabase
        .from("post_ideas")
        .update({
          headline: payload.instruction ?? "Ideia refinada pelo Cerebro IA",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.ideaId)
        .select()
        .single();
      if (error) throw error;
      return json(req, { ok: true, idea });
    }

    const runtime = await loadRuntimeConfig(supabase);
    const totalPosts = Math.max(1, Math.min(60, Number(payload.totalPosts ?? 30)));
    let planPayload: Record<string, unknown>;

    if (cfg(runtime, "MOCK_AI_PROVIDER", Deno.env.get("MOCK_AI_PROVIDER") ?? "") === "true") {
      planPayload = { ideas: fallbackIdeas(payload, totalPosts) };
    } else {
      const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Planejamento mensal");
      const model = cfg(runtime, "OPENAI_TEXT_MODEL", "gpt-5.5");
      const prompt = `Crie um planejamento editorial mensal premium para a MYINC.
Dados: ${JSON.stringify(payload)}
Retorne somente JSON valido com:
{"strategy":"","ideas":[{"title":"","headline":"","short_text":"","cta":"","visual_idea":"","initial_prompt":"","theme":"","objective":"","channel":"","format":"","suggested_at":"","priority":1,"predicted_score":90}]}
Gere exatamente ${totalPosts} ideias. Use portugues do Brasil, tom premium imobiliario, formatos variados, CTAs claros, restricoes de marca e ideias visuais executaveis.`;
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "Voce e estrategista senior de social media. Responda JSON valido.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message ?? JSON.stringify(data));
      planPayload = parseJsonObject(data.choices?.[0]?.message?.content ?? "{}");
    }

    const { data: monthlyPlan, error: planError } = await supabase
      .from("monthly_plans")
      .insert({
        brand_id: brandId,
        month: payload.month ?? null,
        year: payload.year ?? null,
        title: payload.campaign ?? "Planejamento editorial mensal MYINC",
        objective: payload.monthlyObjective ?? null,
        strategy: String(planPayload.strategy ?? ""),
        total_posts: totalPosts,
        status: "gerado",
        prompt_used: JSON.stringify(payload),
        ai_response_json: planPayload,
      })
      .select()
      .single();
    if (planError) throw planError;

    const ideasInput = Array.isArray(planPayload.ideas)
      ? planPayload.ideas.slice(0, totalPosts)
      : [];
    if (!ideasInput.length) throw new Error("Planejamento nao retornou ideias validas.");

    const rows = ideasInput.map((idea: Record<string, unknown>, index: number) => ({
      brand_id: brandId,
      monthly_plan_id: monthlyPlan.id,
      title: String(idea.title ?? `Ideia ${index + 1}`),
      headline: String(idea.headline ?? idea.title ?? ""),
      short_text: String(idea.short_text ?? ""),
      cta: String(idea.cta ?? "Fale com a equipe MYINC"),
      visual_idea: String(idea.visual_idea ?? ""),
      initial_prompt: String(idea.initial_prompt ?? ""),
      theme: String(idea.theme ?? payload.campaign ?? ""),
      objective: String(idea.objective ?? payload.monthlyObjective ?? ""),
      channel: String(idea.channel ?? "Instagram"),
      format: String(idea.format ?? "Feed 1080x1350"),
      suggested_at: idea.suggested_at || null,
      priority: Number(idea.priority ?? index + 1),
      predicted_score: Number(idea.predicted_score ?? 80),
      status: "rascunho",
      ai_response_json: idea,
    }));

    const { data: ideas, error: ideasError } = await supabase
      .from("post_ideas")
      .insert(rows)
      .select();
    if (ideasError) throw ideasError;

    await systemLog(supabase, {
      brand_id: brandId,
      module: "planning",
      status: "sucesso",
      friendly_message: "Planejamento mensal gerado e salvo.",
      technical_detail: `ideas=${ideas?.length ?? 0}`,
    });

    return json(req, { ok: true, monthlyPlan, ideas: ideas ?? [] });
  } catch (error) {
    await systemLog(supabase, {
      module: "planning",
      status: "erro",
      friendly_message: "Falha ao gerar planejamento.",
      technical_detail: error instanceof Error ? error.message : String(error),
    });
    return errorJson(req, error);
  }
});
