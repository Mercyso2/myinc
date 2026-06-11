import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { callFunction, errorJson, requireActiveUser, serviceClient, stringifyError, systemLog } from "../_shared/function-utils.ts";
import { json, options } from "../_shared/runtime-config.ts";

type Row = Record<string, unknown>;

function kind(job: Row) {
  return String(job.job_type ?? job.type ?? "content");
}

async function updateJob(supabase: ReturnType<typeof serviceClient>, id: string, patch: Row) {
  await supabase.from("generation_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const body = await req.json().catch(() => ({}));
    const batchId = body.batchId ? String(body.batchId) : null;

    let query = supabase
      .from("generation_jobs")
      .select("*")
      .eq("status", "queued")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);

    if (batchId) query = query.eq("batch_id", batchId);

    const { data: job, error } = await query.maybeSingle();
    if (error) throw error;
    if (!job) return json(req, { ok: true, processed: 0, message: "Fila vazia." });

    const jobId = String(job.id);
    const postId = job.post_id ? String(job.post_id) : "";
    const jobType = kind(job);
    const input = (job.input_json ?? {}) as Row;
    const attempt = Number(job.attempt_count ?? 0) + 1;
    const maxAttempts = Number(job.max_attempts ?? 3);

    if (!postId) throw new Error("Job sem post_id.");

    await updateJob(supabase, jobId, {
      status: "processing",
      progress: 5,
      attempt_count: attempt,
      started_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
      locked_by: "process-next-generation-job-v2",
    });

    try {
      let result: unknown;
      if (jobType === "content") {
        result = await callFunction(req, "generate-post-content-safe", {
          postId,
          instruction: input.instruction ?? "Produzir conteudo premium MYINC.",
        });
      } else if (jobType === "image") {
        result = await callFunction(req, "generate-image-fast-safe", { postId });
      } else if (jobType === "carousel_page") {
        result = await callFunction(req, "generate-carousel-page", {
          postId,
          page: Number(input.page ?? 1),
          totalPages: Number(input.total_pages ?? input.totalPages ?? 5),
        });
      } else if (jobType === "video") {
        result = await callFunction(req, "generate-video", { postId, force: Boolean(input.force ?? false) });
      } else {
        throw new Error(`Tipo de job nao suportado: ${jobType}`);
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
        module: "generation-worker-v2",
        status: "sucesso",
        friendly_message: "Tarefa processada em modo compute-safe V2.",
        technical_detail: `job=${jobId}; type=${jobType}; attempt=${attempt}`,
      });

      return json(req, { ok: true, processed: 1, jobId, jobType, postId, result });
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
        await supabase.from("posts").update({
          status: "erro_ia",
          error_message: "Falha definitiva em tarefa da fila V2.",
          technical_detail: detail,
          updated_at: new Date().toISOString(),
        }).eq("id", postId);
      } else {
        const seconds = Math.min(900, Math.max(30, attempt * 60));
        await updateJob(supabase, jobId, {
          status: "queued",
          progress: 0,
          next_attempt_at: new Date(Date.now() + seconds * 1000).toISOString(),
          error_message: detail,
          technical_detail: detail,
        });
      }

      await systemLog(supabase, {
        brand_id: job.brand_id ?? null,
        post_id: postId,
        module: "generation-worker-v2",
        status: "erro",
        friendly_message: "Falha ao processar tarefa compute-safe V2.",
        technical_detail: `job=${jobId}; type=${jobType}; attempt=${attempt}; error=${detail}`,
      });

      return json(req, { ok: false, processed: 0, retry: attempt < maxAttempts, jobId, jobType, postId, error: detail }, 400);
    }
  } catch (error) {
    return errorJson(req, error);
  }
});
