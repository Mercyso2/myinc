import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stringifyError } from "../_shared/function-utils.ts";
import { getCorsHeaders, loadRuntimeConfig } from "../_shared/runtime-config.ts";
import { json, requireEnv } from "../_shared/generation-queue.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const runtime = await loadRuntimeConfig(supabase);

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = String(body.jobId ?? "");
    const postId = String(body.postId ?? "");
    if (!jobId && !postId) return json(req, { ok: false, error: "jobId ou postId e obrigatorio." }, 400, runtime);

    let jobQuery = supabase.from("generation_jobs").select("*").order("created_at", { ascending: false }).limit(1);
    if (jobId) jobQuery = jobQuery.eq("id", jobId);
    else jobQuery = jobQuery.eq("post_id", postId);

    const { data: jobs, error } = await jobQuery;
    if (error) throw error;
    const job = jobs?.[0] ?? null;

    const [{ data: children }, { data: events }, { data: assets }, { data: post }] = await Promise.all([
      job ? supabase.from("generation_jobs").select("*").eq("parent_job_id", job.id).order("created_at") : Promise.resolve({ data: [] }),
      job ? supabase.from("generation_job_events").select("*").eq("job_id", job.id).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
      job ? supabase.from("generation_job_assets").select("*").eq("job_id", job.id).order("page_number") : Promise.resolve({ data: [] }),
      postId ? supabase.from("posts").select("*").eq("id", postId).maybeSingle().then((r) => ({ data: r.data })) : Promise.resolve({ data: null }),
    ]);

    return json(req, { ok: true, job, children, events, assets, post }, 200, runtime);
  } catch (error) {
    return json(req, { ok: false, error: stringifyError(error) }, 400, runtime);
  }
});
