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

function safeJson(value: unknown, max = 4000) {
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
  const pillars = String(payload.pillars ?? "autoridade, prova social, bastidores, produto, relacionamento");
  const region = String(payload.region ?? "Londrina e região");
  const campaign = String(payload.campaign ?? "Planejamento editorial MYINC");
  return Array.from({ length: count }, (_, index) => {
    const format = String(formats[index % formats.length] ?? "Feed 1080x1350");
    const pillar = pillars.split(",")[index % Math.max(1, pillars.split(",").length)]?.trim() || "autoridade";
    return {
      title: `${campaign} — ${pillar} ${index + 1}`,
      headline: `Um olhar premium sobre ${pillar} em ${region}`,
      short_text: `Conteúdo ${index + 1} para reforçar ${pillar}, posicionamento premium e relacionamento com compradores e investidores.` ,
      cta: "Fale com a equipe MYINC",
      visual_idea: "Arquitetura premium, luz natural, paleta clara, composição limpa e sensação de alto padrão.",
      initial_prompt: "Imagem premium de empreendimento imobiliário de alto padrão, fundo claro/off-white, luz natural, sem texto, sem logo, sem letras e sem números.",
      theme: `${pillar} MYINC`,
      objective: String(payload.monthlyObjective ?? "Gerar autoridade e oportunidades comerciais"),
      channel: "Instagram",
      format,
      priority: index + 1,
      predicted_score: 82,
      status: "rascunho",
    };
  });
}

async function loadPlanningContext(supabase: ReturnType<typeof serviceClient>, brandId: string) {
  const [profile, rules, prompts, references] = await Promise.all([
    supabase.from("brand_profiles").select("primary_audience,benefits,differentiators,tone,communication_style,preferred_words,forbidden_words,primary_palette,secondary_palette,preferred_visual_style,composition_rules,image_text_rules,mantra").eq("brand_id", brandId).maybeSingle(),
    supabase.from("ai_brain_rules").select("category,content,priority").eq("brand_id", brandId).eq("active", true).is("archived_at", null).order("priority").limit(6),
    supabase.from("ai_prompt_templates").select("name,content").eq("brand_id", brandId).eq("active", true).is("archived_at", null).limit(4),
    supabase.from("library_items").select("name,notes,ai_usage_rule,url,status").eq("brand_id", brandId).is("archived_at", null).limit(4),
  ]);
  return {
    profile: profile.data ?? null,
    rules: rules.data ?? [],
    prompts: prompts.data ?? [],
    references: references.data ?? [],
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} excedeu ${Math.round(ms / 1000)}s. Usando fallback seguro.`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
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
Briefing: ${safeJson(payload, 1800)}
Contexto da marca: ${safeJson(context, 2200)}
Regras:
- Português do Brasil.
- Incorporadora/construtora premium.
- Ideias específicas, úteis, comerciais e humanas.
- Visual claro/lite: branco, off-white, areia, luz natural, muito respiro.
- Sem promessa absoluta de valorização.
- initial_prompt sempre SEM TEXTO, SEM LOGO, SEM LETRAS, SEM NÚMEROS.
- Variar formatos conforme briefing.
Retorne JSON válido:
{"strategy":"","ideas":[{"title":"","headline":"","short_text":"","cta":"","visual_idea":"","initial_prompt":"","theme":"","objective":"","channel":"","format":"","suggested_at":"","priority":1,"predicted_score":90}]}`;

  const controller = new AbortController();
  const timeoutMs = Number(Deno.env.get("OPENAI_PLANNING_TIMEOUT_MS") ?? "85000");
  const timer = setTimeout(() => controller.abort("planning-timeout"), timeoutMs);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Você é estrategista senior de social media imobiliário premium. Responda apenas JSON válido, curto e objetivo." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorMessage(data?.error?.message ?? data?.error ?? data));
    const parsed = parseJsonObject(data.choices?.[0]?.message?.content ?? "{}");
    const ideas = Array.isArray(parsed.ideas) ? parsed.ideas.slice(0, totalPosts) : [];
    if (!ideas.length) throw new Error("OpenAI não retornou ideias válidas.");
    return { strategy: String(parsed.strategy ?? ""), ideas, source: "openai" };
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const payload = await req.json();
    const brandId = String(payload.brandId ?? "");
    if (!brandId) throw new Error("brandId é obrigatório.");

    if (payload.mode === "regenerate_idea" && payload.ideaId) {
      const { data: idea, error } = await supabase
        .from("post_ideas")
        .update({ headline: payload.instruction ?? "Ideia refinada pelo Cérebro IA", updated_at: new Date().toISOString() })
        .eq("id", payload.ideaId)
        .select()
        .single();
      if (error) throw error;
      return json(req, { ok: true, idea });
    }

    const runtime = await loadRuntimeConfig(supabase);
    const requested = Number(payload.totalPosts ?? 10);
    const maxPerCall = Number(cfg(runtime, "PLANNING_MAX_PER_CALL", Deno.env.get("PLANNING_MAX_PER_CALL") ?? "6"));
    const totalPosts = Math.max(1, Math.min(maxPerCall, Number.isFinite(requested) ? requested : maxPerCall));
    const mockEnabled = cfg(runtime, "MOCK_AI_PROVIDER", Deno.env.get("MOCK_AI_PROVIDER") ?? "") === "true";
    let planPayload: Record<string, unknown> & { source?: string };

    if (mockEnabled) {
      if (isProduction(runtime)) throw new Error("MOCK_AI_PROVIDER proibido em produção. Configure OPENAI_API_KEY.");
      planPayload = { strategy: "Mock somente para desenvolvimento.", ideas: fallbackIdeas(payload, totalPosts), source: "mock" };
    } else {
      const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Planejamento mensal");
      const model = cfg(runtime, "OPENAI_TEXT_MODEL", Deno.env.get("OPENAI_TEXT_MODEL") ?? "gpt-4.1-mini");
      try {
        planPayload = await withTimeout(
          generateOpenAiPlan(supabase, openAiKey, model, payload, totalPosts, brandId),
          Number(Deno.env.get("PLANNING_FUNCTION_TIMEOUT_MS") ?? "95000"),
          "Planejamento IA",
        );
      } catch (aiError) {
        planPayload = {
          strategy: `Fallback compute-safe acionado: ${errorMessage(aiError)}`,
          ideas: fallbackIdeas(payload, totalPosts),
          source: "fallback_compute_safe",
        };
        await systemLog(supabase, {
          brand_id: brandId,
          module: "planning",
          status: "alerta",
          friendly_message: "Planejamento usou fallback para evitar timeout.",
          technical_detail: errorMessage(aiError),
        });
      }
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
        status: requested > totalPosts ? "gerado_parcial_compute_safe" : planPayload.source === "fallback_compute_safe" ? "gerado_fallback_compute_safe" : "gerado",
        prompt_used: JSON.stringify({ ...payload, requestedTotalPosts: requested, generatedThisCall: totalPosts, source: planPayload.source ?? "openai" }),
        ai_response_json: planPayload,
      })
      .select()
      .single();
    if (planError) throw planError;

    const ideasInput = Array.isArray(planPayload.ideas) ? planPayload.ideas.slice(0, totalPosts) : [];
    if (!ideasInput.length) throw new Error("Planejamento não retornou ideias válidas.");

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
      technical_detail: `requested=${requested}; generated=${ideas?.length ?? 0}; max_per_call=${maxPerCall}; source=${planPayload.source ?? "openai"}`,
    });

    return json(req, {
      ok: true,
      monthlyPlan,
      ideas: ideas ?? [],
      maxPerCall,
      requestedTotalPosts: requested,
      source: planPayload.source ?? "openai",
      message: requested > totalPosts ? `Geradas ${totalPosts} ideias nesta chamada para evitar timeout. Rode novamente para completar o mês.` : "Planejamento gerado.",
    });
  } catch (error) {
    await systemLog(supabase, { module: "planning", status: "erro", friendly_message: "Falha ao gerar planejamento.", technical_detail: errorMessage(error) });
    return errorJson(req, error);
  }
});
