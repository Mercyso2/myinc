import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { errorJson, requireActiveUser, serviceClient } from "../_shared/function-utils.ts";
import { json, options } from "../_shared/runtime-config.ts";

function scorePost(post: Record<string, unknown>) {
  const caption = String(post.caption ?? "");
  const mediaUrl = String(post.media_url ?? "");
  const prompt = String(post.image_prompt ?? "");
  const score =
    45 +
    Math.min(20, Math.floor(caption.length / 18)) +
    (mediaUrl.startsWith("https://") ? 15 : 0) +
    (prompt.length > 180 ? 10 : 0) +
    (String(post.cta ?? "").length > 3 ? 10 : 0);
  const overall = Math.max(0, Math.min(100, score));
  return {
    overall_score: overall,
    copy_score: Math.min(100, 50 + Math.floor(caption.length / 12)),
    visual_score: mediaUrl ? 85 : 55,
    brand_score: prompt.toLowerCase().includes("premium") ? 88 : 70,
    cta_score: String(post.cta ?? "").length > 3 ? 90 : 55,
    approved: overall >= 85,
    status: overall >= 85 ? "aprovado" : overall >= 65 ? "precisa_revisao" : "reprovado",
    problems: [
      ...(mediaUrl ? [] : ["Midia final ausente."]),
      ...(caption.length > 40 ? [] : ["Legenda curta demais para avaliacao completa."]),
    ],
    suggestions: [
      "Validar aderencia visual antes de publicar.",
      "Manter aprovacao humana para campanha real.",
    ],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const { postId } = await req.json();
    const { data: post, error } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();
    if (error || !post) throw error ?? new Error("Post nao encontrado.");
    const review = scorePost(post);
    const { data: updated, error: updateError } = await supabase
      .from("posts")
      .update({
        quality_score: review.overall_score,
        quality_review: review,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .select()
      .single();
    if (updateError) throw updateError;
    return json(req, { ok: true, post: updated, review });
  } catch (error) {
    return errorJson(req, error);
  }
});
