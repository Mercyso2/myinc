import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  errorJson,
  requireActiveUser,
  serviceClient,
  stringifyError,
  systemLog,
} from "../_shared/function-utils.ts";
import { cfg, json, loadRuntimeConfig, options, requiredCfg } from "../_shared/runtime-config.ts";

function errorMessage(value: unknown) {
  return stringifyError(value);
}

function isProduction(runtime: Record<string, string | null>) {
  return ["production", "prod"].includes(String(cfg(runtime, "APP_ENV", Deno.env.get("APP_ENV") ?? "")).toLowerCase());
}

function safeJson(value: unknown, max = 5500) {
  const text = JSON.stringify(value ?? null);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

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
  const formats = Array.isArray(payload.formats) ? Object.keys(payload.formats as Record<string, unknown>) : ["Feed 1080x1350"];
  return Array.from({ length: count }, (_, index) => ({
    title: `Conteudo premium MYINC ${index + 1}`,
    headline: `Um novo olhar para ${payload.region ?? "a sua regiao"}`,
    short_text: "Ideia inicial gerada em modo mock controlado para desenvolvimento.",
    cta: "Fale com a equipe MYINC",
    visual_idea: "Arquitetura premium, luz natural, composicao limpa e paleta clara MYINC.",
    initial_prompt: "Imagem premium de empreendimento imobiliario de alto padrao, fundo claro, sem texto e sem logo.",
    theme: String(payload.campaign ?? "Planejamento editorial"),
    objective: String(payload.monthlyObjective ?? "Gerar autoridade e oportunidades comerciais"),
    channel: Array.isArray(payload.channels) ? String(payload.channels[index % payload.channels.length]) : "Instagram",
    format: String(formats[index % formats.length] ?? "Feed 1080x1350"),
    priority: index + 1,
    predicted_score: 82,
    status: "rascunho",
  }));
}

async function loadPlanningContext(supabase: ReturnType<typeof serviceClient>, brandId: string) {
  const [profile, rules, prompts, references] = await Promise.all([
    supabase.from("brand_profiles").select("primary_audience,benefits,differentiators,tone,communication_style,preferred_words,forbidden_words,primary_palette,secondary_palette,preferred_visual_style,composition_rules,image_text_rules,mantra").eq("brand_id", brandId).maybeSingle(),
    supabase.from("ai_brain_rules").select("category,content,priority").eq("brand_id", brandId).eq("active", true).is("archived_at", null).order("priority").limit(8),
    supabase.from("ai_prompt_templates").select("name,content").eq("brand_id", brandId).eq("active", true).is("archived_at", null).limit(5),
    supabase.from("library_items").select("name,notes,ai_usage_rule,url,status").eq("brand_id", brandId).is("archived_at", null).limit(6),
  ]);
  return {
    profile: profile.data ?? null,
    rules: rules.data ?? [],
    prompts: prompts.data ?? [],
    references: references.data ?? [],
  };
}

async function generateOpenAiPlan(
  supabase: ReturnType<typeof serviceClient>,
  openAiKey: string,
  model: string,
  payload: Record<string, unknown>,
  totalPosts: number,
  brandId: string,
) {
  const context = await loadPlanningContext(supabase, brandId);
  const prompt = `Crie planejamento editorial premium para MYINC.
Quantidade: ${totalPosts} ideias. Nunca gere mais que ${totalPosts}.
Dados do briefing: ${safeJson(payload, 2800)}
Contexto da marca: ${safeJson(context, 3600)}
Regras obrigatorias:
- Portugues do Brasil.
- Incorporadora/construtora premium.
- Ideias especificas, uteis, comerciais e humanas, sem conteudo generico.
- Perfil visual claro/lite: branco, off-white, areia, luz natural, muito respiro, sofisticacao limpa.
- Sem promessa absoluta de valorizacao.
- Visual_prompt e initial_prompt sempre SEM TEXTO, SEM LOGO, SEM LETRAS, SEM NUMEROS.
- Variar formatos conforme briefing.
Retorne somente JSON valido:
{"strategy":"","ideas":[{"title":"","headline":"","short_text":"","cta":"","visual_idea":"","initial_prompt":"","theme":"","objective":"","channel":"","format":"","suggested_at":"","priority":1,"predicted_score":90}]}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Voce e estrategista senior de social media imobiliario premium. Responda apenas JSON valido." },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorMessage(data?.error?.message ?? data?.error ?? data));
  const parsed = parseJsonObject(data.choices?.[0]?.message?.content ?? "{}");
  const ideas = Array.isArray(parsed.ideas) ? parsed.ideas.slice(0, totalPosts) : [];
  return { strategy: String(parsed.strategy ?? ""), ideas };
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
        .update({ headline: payload.instruction ?? "Ideia refinada pelo Cerebro IA", updated_at: new Date().toISOString() })
        .eq("id", payload.ideaId)
        .select()
        .single();
      if (error) throw error;
      return json(req, { ok: true, idea });
    }

    const runtime = await loadRuntimeConfig(supabase);
    const requested = Number(payload.totalPosts ?? 10);
    const totalPosts = Math.max(1, Math.min(10, Number.isFinite(requested) ? requested : 10));
    const mockEnabled = cfg(runtime, "MOCK_AI_PROVIDER", Deno.env.get("MOCK_AI_PROVIDER") ?? "") === "true";
    let planPayload: Record<string, unknown>;

    if (mockEnabled) {
      if (isProduction(runtime)) throw new Error("MOCK_AI_PROVIDER proibido em producao. Configure OPENAI_API_KEY.");
      planPayload = { strategy: "Mock somente para desenvolvimento.", ideas: fallbackIdeas(payload, totalPosts) };
    } else {
      const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Planejamento mensal");
      const model = cfg(runtime, "OPENAI_TEXT_MODEL", "gpt-5.2");
      planPayload = await generateOpenAiPlan(supabase, openAiKey, model, payload, totalPosts, brandId);
    }

    const { data: monthlyPlan, error: planError } = await supabase
      .from("monthly_plans")
      .insert({
        brand_id: brandId,
        month: payload.month ?? null,
        year: payload.year ?? null,
        name: payload.campaign ?? "Planejamento editorial mensal MYINC",
        title: payload.campaign ?? "Planejamento editorial mensal MYINC",
        objective: payload.monthlyObjective ?? null,
        strategy: String(planPayload.strategy ?? ""),
        total_posts: totalPosts,
        status: requested > totalPosts ? "gerado_parcial_compute_safe" : "gerado",
        prompt_used: JSON.stringify({ ...payload, requestedTotalPosts: requested, generatedThisCall: totalPosts }),
        ai_response_json: planPayload,
      })
      .select()
      .single();
    if (planError) throw planError;

    const ideasInput = Array.isArray(planPayload.ideas) ? planPayload.ideas.slice(0, totalPosts) : [];
    if (!ideasInput.length) throw new Error("Planejamento nao retornou ideias validas.");

    const rows = ideasInput.map((idea: Record<string, unknown>, index) => ({
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

    const { data: ideas, error: ideasError } = await supabase.from("post_ideas").insert(rows).select();
    if (ideasError) throw ideasError;

    await systemLog(supabase, {
      brand_id: brandId,
      module: "planning",
      status: "sucesso",
      friendly_message: "Planejamento compute-safe gerado e salvo.",
      technical_detail: `requested=${requested}; generated=${ideas?.length ?? 0}; max_per_call=10`,
    });

    return json(req, { ok: true, monthlyPlan, ideas: ideas ?? [], maxPerCall: 10, requestedTotalPosts: requested });
  } catch (error) {
    await systemLog(supabase, { module: "planning", status: "erro", friendly_message: "Falha ao gerar planejamento.", technical_detail: errorMessage(error) });
    return errorJson(req, error);
  }
});
