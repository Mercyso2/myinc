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

function jobKind(job: Row) {
  return String(job.job_type ?? job.type ?? "content");
}

function nextAttemptSeconds(attempt: number) {
  return Math.min(900, Math.max(30, attempt * 60));
}

async function markJob(supabase: ReturnType<typeof serviceClient>, id: string, patch: Row) {
  await supabase
    .from("generation_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
}

async function appendPostError(supabase: ReturnType<typeof serviceClient>, postId: string | null, message: string) {
  if (!postId) return;
  await supabase
    .from("posts")
    .update({
      status: "erro_ia",
      error_message: "Falha ao processar uma tarefa da fila.",
      technical_detail: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const payload = await req.json().catch(() => ({}));
    const batchId = payload.batchId ? String(payload.batchId) : null;

    let query = supabase
      .from("generation_jobs")
      .select("*")
      .eq("status", "queued")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);

    if (batchId) query = query.eq("batch_id", batchId);

    const { data: job, error: jobError } = await query.maybeSingle();
    if (jobError) throw jobError;

    if (!job) {
      return json(req, {
        ok: true,
        processed: 0,
        message: "Nenhuma tarefa pendente na fila.",
      });
    }

    const jobId = String(job.id);
    const postId = job.post_id ? String(job.post_id) : null;
    const attempt = Number(job.attempt_count ?? 0) + 1;
    const maxAttempts = Number(job.max_attempts ?? 3);
    const kind = jobKind(job);

    await markJob(supabase, jobId, {
      status: "processing",
      progress: 5,
      attempt_count: attempt,
      started_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
      locked_by: "process-next-generation-job",
    });

    let output: unknown = null;
    try {
      if (!postId) throw new Error("Job sem post_id.");

      if (kind === "content") {
        const input = (job.input_json ?? {}) as Row;
        output = await callFunction(req, "generate-post-content", {
          postId,
          instruction: input.instruction ?? "Produzir conteudo premium MYINC.",
        });
      } else if (kind === "image") {
        output = await callFunction(req, "generate-image", { postId, jobType: "image" });
      } else if (kind === "carousel_page") {
        const input = (job.input_json ?? {}) as Row;
        output = await callFunction(req, "generate-image", {
          postId,
          jobType: "carousel_page",
          page: Number(input.page ?? 1),
          totalPages: Number(input.total_pages ?? input.totalPages ?? 5),
        });
      } else if (kind === "video") {
        const input = (job.input_json ?? {}) as Row;
        output = await callFunction(req, "generate-video", {
          postId,
          force: Boolean(input.force ?? false),
        });
      } else {
        throw new Error(`Tipo de job nao suportado: ${kind}`);
      }

      await markJob(supabase, jobId, {
        status: "completed",
        progress: 100,
        finished_at: new Date().toISOString(),
        output_json: output,
        result: output,
        error_message: null,
        technical_detail: null,
      });

      await systemLog(supabase, {
        brand_id: job.brand_id ?? null,
        post_id: postId,
        module: "generation-worker",
        status: "sucesso",
        friendly_message: "Uma tarefa da fila foi processada com sucesso.",
        technical_detail: `job=${jobId}; type=${kind}; attempt=${attempt}`,
      });

      return json(req, {
        ok: true,
        processed: 1,
        jobId,
        jobType: kind,
        postId,
        result: output,
      });
    } catch (error) {
      const technical = stringifyError(error);
      if (attempt >= maxAttempts) {
        await markJob(supabase, jobId, {
          status: "failed",
          progress: 100,
          finished_at: new Date().toISOString(),
          error_message: technical,
          technical_detail: technical,
        });
        await appendPostError(supabase, postId, technical);
      } else {
        const nextDate = new Date(Date.now() + nextAttemptSeconds(attempt) * 1000).toISOString();
        await markJob(supabase, jobId, {
          status: "queued",
          progress: 0,
          next_attempt_at: nextDate,
          error_message: technical,
          technical_detail: technical,
        });
      }

      await systemLog(supabase, {
        brand_id: job.brand_id ?? null,
        post_id: postId,
        module: "generation-worker",
        status: "erro",
        friendly_message: "Falha ao processar uma tarefa da fila.",
        technical_detail: `job=${jobId}; type=${kind}; attempt=${attempt}; error=${technical}`,
      });

      return json(
        req,
        {
          ok: false,
          processed: 0,
          retry: attempt < maxAttempts,
          jobId,
          jobType: kind,
          postId,
          error: technical,
        },
        400,
      );
    }
  } catch (error) {
    return errorJson(req, error);
  }
});
