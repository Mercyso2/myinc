import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stringifyError } from "../_shared/function-utils.ts";
import { getCorsHeaders, loadRuntimeConfig } from "../_shared/runtime-config.ts";
import { enqueueGenerationJob, inferJobType, json, requireEnv } from "../_shared/generation-queue.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const runtime = await loadRuntimeConfig(supabase);

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(50, Number(body.limit ?? 10)));
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

    if (body.onlyMissing !== false) query = query.or("media_url.is.null,carousel_media_urls.is.null");

    const { data: posts, error } = await query;
    if (error) throw error;

    const results = [];
    for (const post of posts ?? []) {
      const jobType = inferJobType(post);
      if (jobType === "video") continue;
      const result = await enqueueGenerationJob({
        supabase,
        post,
        jobType,
        payload: { requested_by: "generate-images-batch", force: body.force ?? false },
        priority: Number(body.priority ?? 120),
      });
      results.push({ postId: post.id, jobId: result.job.id, jobType });
    }

    const requested = Array.isArray(body.postIds) ? body.postIds.length : results.length;
    return json(req, {
      ok: true,
      requested,
      processed: results.length,
      generated: results.length,
      queued: results.length,
      remaining: Math.max(0, requested - results.length),
      results,
      message: `${results.length} job(s) de imagem/carrossel enfileirado(s).`,
    }, 200, runtime);
  } catch (error) {
    return json(req, { ok: false, error: stringifyError(error) }, 400, runtime);
  }
});
