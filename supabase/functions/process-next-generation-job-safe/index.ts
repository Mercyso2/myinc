import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  callFunction,
  errorJson,
  requireActiveUser,
  serviceClient,
  stringifyError,
  systemLog,
} from "../_shared/function-utils.ts";
import { json, options } from "../_shared/runtime-config.ts";

type Row = Record<string, unknown>;

function kindOf(job: Row) {
  return String(job.job_type ?? job.type ?? "content");
}

async function updateJob(supabase: ReturnType<typeof serviceClient>, id: string, patch: Row) {
  await supabase
    .from("generation_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
}

async function claimQueuedFallback(supabase: ReturnType<typeof serviceClient>) {
  const { data: candidate, error: selectError } = await supabase
    .from("generation_jobs")
    .select("*")
    .eq("status", "queued")
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!candidate) return null;

  const { data: claimed, error: claimError } = await supabase
    .from("generation_jobs")
    .update({
      status: "processing",
      locked_at: new Date().toISOString(),
      locked_by: "supabase-edge-compute-safe-fallback",
      started_at: new Date().toISOString(),
      attempt_count: Number(candidate.attempt_count ?? 0) + 1,
      progress: Math.max(Number(candidate.progress ?? 0), 5),
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidate.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();
  if (claimError) throw claimError;
  return claimed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    await req.json().catch(() => ({}));
    const rpc = await supabase.rpc("claim_generation_job", {
      worker_id: "supabase-edge-compute-safe",
    });
    if (rpc.error && !String(rpc.error.message ?? "").includes("claim_generation_job"))
      throw rpc.error;
    const job = rpc.data ?? (await claimQueuedFallback(supabase));
    if (!job)
      return json(req, {
        ok: true,
        processed: 0,
        processor: "supabase-edge",
        message: "Fila vazia.",
      });

    const jobId = String(job.id);
    const postId = job.post_id ? String(job.post_id) : "";
    const type = kindOf(job);
    const attempt = Number(job.attempt_count ?? 1);
    const maxAttempts = Number(job.max_attempts ?? 3);
    const input = (job.input_json ?? {}) as Row;

    if (!postId) throw new Error("Job sem post_id.");

    try {
      let result: unknown;
      if (type === "content") {
        result = await callFunction(req, "generate-post-content", {
          postId,
          instruction: input.instruction ?? "Produzir conteudo premium MYINC.",
        });
      } else if (type === "image") {
        result = await callFunction(req, "generate-image", { postId, jobType: "image" });
      } else if (type === "carousel_page") {
        result = await callFunction(req, "generate-carousel-page", {
          postId,
          page: Number(input.page ?? 1),
          totalPages: Number(input.total_pages ?? input.totalPages ?? 5),
        });
      } else if (type === "video") {
        result = await callFunction(req, "generate-video", {
          postId,
          force: Boolean(input.force ?? false),
        });
      } else {
        throw new Error(`Tipo de job nao suportado: ${type}`);
      }

      await updateJob(supabase, jobId, {
        status: "completed",
        progress: 100,
        finished_at: new Date().toISOString(),
        output_json: result,
        result,
        error_message: null,
        technical_detail: null,
      });

      await systemLog(supabase, {
        brand_id: job.brand_id ?? null,
        post_id: postId,
        module: "generation-worker-safe",
        status: "sucesso",
        friendly_message: "Uma tarefa pequena foi processada com sucesso.",
        technical_detail: `job=${jobId}; type=${type}; attempt=${attempt}`,
      });

      return json(req, {
        ok: true,
        processed: 1,
        processor: "supabase-edge",
        jobId,
        jobType: type,
        postId,
        result,
      });
    } catch (err) {
      const detail = stringifyError(err);
      if (attempt >= maxAttempts) {
        await updateJob(supabase, jobId, {
          status: "failed",
          progress: 100,
          finished_at: new Date().toISOString(),
          error_message: detail,
          technical_detail: detail,
        });
        await supabase
          .from("posts")
          .update({
            status: "erro_ia",
            error_message: "Falha definitiva em tarefa da fila.",
            technical_detail: detail,
            updated_at: new Date().toISOString(),
          })
          .eq("id", postId);
      } else {
        await updateJob(supabase, jobId, {
          status: "queued",
          progress: 0,
          next_attempt_at: new Date(
            Date.now() + Math.min(900, Math.max(30, attempt * 60)) * 1000,
          ).toISOString(),
          error_message: detail,
          technical_detail: detail,
        });
      }

      await systemLog(supabase, {
        brand_id: job.brand_id ?? null,
        post_id: postId,
        module: "generation-worker-safe",
        status: "erro",
        friendly_message: "Falha ao processar tarefa pequena.",
        technical_detail: `job=${jobId}; type=${type}; attempt=${attempt}; error=${detail}`,
      });

      return json(req, {
        ok: false,
        processed: 1,
        processor: "supabase-edge",
        retry: attempt < maxAttempts,
        jobId,
        jobType: type,
        postId,
        error: detail,
      });
    }
  } catch (error) {
    return errorJson(req, error);
  }
});
