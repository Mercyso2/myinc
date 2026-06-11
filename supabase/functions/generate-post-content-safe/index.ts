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
  if (!value) throw new Error(`${name} ausente no backend.`);
  return value;
}

function obj(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function trim(value: unknown, max = 1200) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function responseText(data: unknown) {
  const payload = obj(data);
  if (typeof payload.output_text === "string") return payload.output_text;
  if (Array.isArray(payload.output)) {
    return payload.output.flatMap((item) => Array.isArray(obj(item).content) ? obj(item).content : [])
      .map((part) => obj(part).text ?? obj(part).value ?? "")
      .join("\n")
      .trim();
  }
  const first = obj(Array.isArray(payload.choices) ? payload.choices[0] : {});
  return String(obj(first.message).content ?? "").trim();
}

function parseJson(raw: string) {
  try { return JSON.parse(raw || "{}"); } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("JSON invalido retornado pela IA.");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const runtime = await loadRuntimeConfig(supabase);
  const openAiKey = requiredCfg(runtime, "OPENAI_API_KEY", "Conteudo seguro");
  const model = cfg(runtime, "OPENAI_TEXT_MODEL", "gpt-5.5");

  async function log(row: Row) {
    await supabase.from("system_logs").insert({ type: row.type ?? "ai", ...row });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const postId = String(body.postId ?? "");
    if (!postId) return json(req, { ok: false, error: "postId e obrigatorio." }, 400, runtime);

    const { data: post, error: postError } = await supabase.from("posts").select("*").eq("id", postId).single();
    if (postError || !post) throw postError ?? new Error("Post nao encontrado.");
    const brandId = String(post.brand_id);

    const [profile, rules, refs] = await Promise.all([
      supabase.from("brand_profiles").select("primary_audience,benefits,differentiators,tone,communication_style,preferred_visual_style,composition_rules,image_text_rules,mantra").eq("brand_id", brandId).maybeSingle(),
      supabase.from("ai_brain_rules").select("category,content,priority").eq("brand_id", brandId).eq("active", true).is("archived_at", null).order("priority").limit(6),
      supabase.from("library_items").select("name,notes,ai_usage_rule").eq("brand_id", brandId).is("archived_at", null).limit(4),
    ]);

    const prompt = `Gere conteudo premium MYINC em JSON valido.
Post: ${trim(post, 1200)}
Marca: ${trim(profile.data, 900)}
Regras: ${trim(rules.data ?? [], 900)}
Referencias: ${trim(refs.data ?? [], 700)}
Instrucao: ${trim(body.instruction ?? "Produzir conteudo premium", 500)}
Obrigatorio: portugues do Brasil, headline curta, legenda elegante, CTA claro, poucas hashtags, visual claro/lite. Image prompt sem texto, sem logo, sem letras e sem numeros.
Formato JSON: {"title":"","headline":"","caption":"","hashtags":["#MYINC"],"cta":"","creative_brief":"","image_prompt":"","master_prompt":"","quality_score":90,"carousel_pages":[{"page":1,"title":"","text":"","visual_prompt":""}],"video_script":{"hook_3s":"","scenes":[""],"narration":"","screen_text":[""],"cta":""},"quality_review":{"copy_score":90,"visual_score":90,"brand_score":90,"cta_score":90,"problems":[],"suggestions":[]}}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: "Voce e social media senior. Responda somente JSON valido." },
          { role: "user", content: prompt },
        ],
        text: { format: { type: "json_object" } },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(stringifyError(data));
    const parsed = parseJson(responseText(data));
    if (!parsed.caption || !parsed.image_prompt) throw new Error("IA retornou conteudo incompleto.");

    const quality = Math.max(0, Math.min(100, Number(parsed.quality_score ?? 90)));
    const review = parsed.quality_review && typeof parsed.quality_review === "object" ? { overall_score: quality, ...parsed.quality_review } : { overall_score: quality };

    const { data: updatedPost, error: updateError } = await supabase.from("posts").update({
      title: parsed.title ?? post.title,
      headline: parsed.headline ?? post.headline,
      caption: parsed.caption,
      hashtags: parsed.hashtags ?? [],
      cta: parsed.cta,
      creative_brief: parsed.creative_brief,
      image_prompt: parsed.image_prompt,
      master_prompt: parsed.master_prompt ?? prompt,
      quality_score: quality,
      quality_review: review,
      video_prompt: parsed.video_script ? JSON.stringify(parsed.video_script, null, 2) : post.video_prompt,
      status: quality >= 88 ? "aguardando_revisao" : "ajuste_solicitado",
      error_message: null,
      technical_detail: null,
      updated_at: new Date().toISOString(),
    }).eq("id", post.id).select().single();
    if (updateError) throw updateError;

    await supabase.from("post_versions").insert({
      brand_id: brandId,
      post_id: post.id,
      version_label: `SAFE-${Date.now()}`,
      caption: parsed.caption,
      image_prompt: parsed.image_prompt,
      quality_score: quality,
      output_json: { ...parsed, quality_score: quality, quality_review: review },
    });

    await log({ brand_id: brandId, post_id: post.id, module: "copy-safe", status: "sucesso", friendly_message: "Conteudo compute-safe gerado.", technical_detail: `model=${model}; prompt_chars=${prompt.length}` });
    return json(req, { ok: true, post: updatedPost, content: parsed }, 200, runtime);
  } catch (error) {
    await log({ module: "copy-safe", status: "erro", friendly_message: "Falha ao gerar conteudo compute-safe.", technical_detail: stringifyError(error) });
    return json(req, { ok: false, error: stringifyError(error) }, 400, runtime);
  }
});
