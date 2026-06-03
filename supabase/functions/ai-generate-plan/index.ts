import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function log(supabase: ReturnType<typeof createClient>, row: Record<string, unknown>) {
  await supabase.from("system_logs").insert({ type: row.type ?? "ai", ...row });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente no backend. Operação real não executada.`);
  return value;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = requireEnv("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_TEXT_MODEL") ?? "gpt-4.1-mini";
  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    const payload = await req.json();
    const brandId = payload.brandId;
    if (!brandId) return json({ error: "brandId é obrigatório." }, 400);

    const totalPosts = Number(payload.totalPosts ?? 30);
    const { data: brand } = await supabase.from("brands").select("*").eq("id", brandId).single();
    const { data: profile } = await supabase
      .from("brand_profiles")
      .select("*")
      .eq("brand_id", brandId)
      .maybeSingle();
    const { data: rules } = await supabase
      .from("ai_brain_rules")
      .select("category,content,priority")
      .eq("brand_id", brandId)
      .eq("active", true)
      .is("archived_at", null)
      .order("priority");
    const { data: references } = await supabase
      .from("library_items")
      .select("name,notes,ai_usage_rule,status,url")
      .eq("brand_id", brandId)
      .eq("status", "referência aprovada")
      .is("archived_at", null)
      .limit(20);

    const prompt = `Gere um planejamento mensal profissional em JSON válido. Marca: ${JSON.stringify(brand)}. Memória: ${JSON.stringify(profile)}. Regras ativas: ${JSON.stringify(rules)}. Referências aprovadas: ${JSON.stringify(references)}. Briefing: ${JSON.stringify(payload)}. Retorne exatamente: {"plan":{"name":"...","month":1,"year":2026,"objective":"...","total_posts":${totalPosts},"channels":[],"formats_distribution":{},"campaign_distribution":{}},"ideas":[{"suggested_at":"ISO datetime","channel":"Instagram|Facebook|Ambos","format":"Feed 1080x1350|Feed quadrado 1080x1080|Story 1080x1920|Reels 1080x1920|Carrossel 5 páginas|Carrossel 8 páginas|Facebook 1200x630|Thumbnail","objective":"...","theme":"...","headline":"gancho","short_text":"legenda preliminar curta","cta":"...","visual_idea":"...","creative_brief":"...","initial_prompt":"prompt inicial de imagem","predicted_score":0-100,"status":"rascunho"}]}. Gere ${totalPosts} ideias diferentes, específicas e não genéricas.`;

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Você é um estrategista sênior de social media. Responda somente JSON válido.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    const completionJson = await completion.json();
    if (!completion.ok) throw new Error(JSON.stringify(completionJson));

    const content = completionJson.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    if (!parsed.plan || !Array.isArray(parsed.ideas) || parsed.ideas.length === 0) {
      throw new Error("OpenAI retornou JSON sem plan/ideas válidos.");
    }

    const { data: monthlyPlan, error: planError } = await supabase
      .from("monthly_plans")
      .insert({ ...parsed.plan, brand_id: brandId, total_posts: totalPosts, status: "generated" })
      .select()
      .single();
    if (planError) throw planError;

    const ideasPayload = parsed.ideas.slice(0, totalPosts).map((idea: Record<string, unknown>) => ({
      monthly_plan_id: monthlyPlan.id,
      brand_id: brandId,
      suggested_at: idea.suggested_at,
      channel: idea.channel,
      format: idea.format,
      theme: idea.theme,
      objective: idea.objective,
      headline: idea.headline,
      short_text: idea.short_text,
      cta: idea.cta,
      visual_idea: idea.visual_idea,
      initial_prompt: idea.initial_prompt,
      predicted_score: idea.predicted_score,
      status: idea.status ?? "rascunho",
    }));
    const { data: ideas, error: ideasError } = await supabase
      .from("post_ideas")
      .insert(ideasPayload)
      .select();
    if (ideasError) throw ideasError;

    await log(supabase, {
      brand_id: brandId,
      module: "planejamento",
      status: "sucesso",
      friendly_message: "Planejamento mensal gerado com OpenAI e salvo no Supabase.",
      technical_detail: `monthly_plan=${monthlyPlan.id}; ideas=${ideas?.length ?? 0}`,
    });

    return json({ ok: true, monthlyPlan, ideas });
  } catch (error) {
    await log(supabase, {
      module: "planejamento",
      status: "erro",
      friendly_message: "Falha ao gerar planejamento com IA.",
      technical_detail: error instanceof Error ? error.message : String(error),
    });
    return json({ error: error instanceof Error ? error.message : "Erro desconhecido" }, 400);
  }
});
