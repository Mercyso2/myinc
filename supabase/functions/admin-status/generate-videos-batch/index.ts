import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stringifyError } from "../_shared/function-utils.ts";
import { getCorsHeaders, loadRuntimeConfig } from "../_shared/runtime-config.ts";
import { enqueueGenerationJob, json, requireEnv } from "../_shared/generation-queue.ts";

function isVideoFormat(format = "") {
  const normalized = String(format).toLowerCase();
  return normalized.includes("reels") || normalized.includes("vídeo") || normalized.includes("video");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const runtime = await loadRuntimeConfig(supabase);

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(20, Number(body.limit ?? 5)));
    let query = supabase.from("posts")
      .select("*")
      .is("deleted_at", null)
      .is("archived_at", null)
      .neq("status", "arquivado")
      .neq("status", "excluido")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (Array.isArray(body.postIds) && body.postIds.length) query = query.in("id", body.postIds);
    else if (body.brandId) query = query.eq("brand_id", body.brandId);

    const { data: posts, error } = await query;
    if (error) throw error;

    const videoPosts = (posts ?? []).filter((post) => isVideoFormat(post.format));
    const results = [];
    for (const post of videoPosts) {
      const result = await enqueueGenerationJob({
        supabase,
        post,
        jobType: "video",
        provider: body.provider ?? null,
        payload: { requested_by: "generate-videos-batch", force: body.force ?? false },
        priority: Number(body.priority ?? 140),
      });
      results.push({ postId: post.id, jobId: result.job.id, jobType: "video" });
    }

    return json(req, {
      ok: true,
      requested: videoPosts.length,
      processed: results.length,
      generated: results.length,
      queued: results.length,
      remaining: Math.max(0, videoPosts.length - results.length),
      results,
      message: `${results.length} job(s) de video/Reels enfileirado(s).`,
    }, 200, runtime);
  } catch (error) {
    return json(req, { ok: false, error: stringifyError(error) }, 400, runtime);
  }
});
