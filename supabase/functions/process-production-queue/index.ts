import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  errorJson,
  requireActiveUser,
  serviceClient,
  stringifyError,
  systemLog,
} from "../_shared/function-utils.ts";
import { json, options } from "../_shared/runtime-config.ts";

function isCarousel(format = "") {
  return String(format).toLowerCase().includes("carrossel");
}

function isVideo(format = "") {
  const value = String(format).toLowerCase();
  return value.includes("reels") || value.includes("video") || value.includes("vídeo");
}

function carouselCount(format = "") {
  return String(format).includes("8") ? 8 : 5;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const payload = await req.json();
    const postIds: string[] = Array.isArray(payload.postIds) ? payload.postIds : [];
    const batchId = String(payload.batchId ?? crypto.randomUUID());
    const queuedJobs: unknown[] = [];

    for (const postId of postIds) {
      const { data: post, error: postError } = await supabase
        .from("posts")
        .select("id,brand_id,format,title")
        .eq("id", postId)
        .maybeSingle();
      if (postError || !post) {
        queuedJobs.push({ postId, ok: false, error: stringifyError(postError ?? "Post nao encontrado") });
        continue;
      }

      await supabase
        .from("posts")
        .update({ status: "em_fila", batch_id: batchId, updated_at: new Date().toISOString() })
        .eq("id", postId);

      const brandId = post.brand_id ?? payload.brandId ?? null;
      const common = {
        brand_id: brandId,
        post_id: postId,
        batch_id: batchId,
        provider: "edge-queue",
        status: "queued",
        progress: 0,
        attempt_count: 0,
        max_attempts: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: contentJob, error: contentError } = await supabase
        .from("generation_jobs")
        .insert({
          ...common,
          type: "content",
          job_type: "content",
          priority: 10,
          input_json: {
            instruction: payload.instruction ?? "Produzir conteudo premium MYINC.",
          },
        })
        .select("id,type,job_type,post_id,status")
        .single();
      if (contentError) throw contentError;
      queuedJobs.push(contentJob);

      const format = String(post.format ?? "");
      if (isCarousel(format)) {
        const count = carouselCount(format);
        for (let page = 1; page <= count; page++) {
          const { data: job, error } = await supabase
            .from("generation_jobs")
            .insert({
              ...common,
              type: "carousel_page",
              job_type: "carousel_page",
              priority: 20 + page,
              input_json: { page, total_pages: count },
            })
            .select("id,type,job_type,post_id,status,input_json")
            .single();
          if (error) throw error;
          queuedJobs.push(job);
        }
      } else if (isVideo(format)) {
        const { data: job, error } = await supabase
          .from("generation_jobs")
          .insert({
            ...common,
            type: "video",
            job_type: "video",
            priority: 20,
            input_json: { force: Boolean(payload.force) },
          })
          .select("id,type,job_type,post_id,status")
          .single();
        if (error) throw error;
        queuedJobs.push(job);
      } else {
        const { data: job, error } = await supabase
          .from("generation_jobs")
          .insert({
            ...common,
            type: "image",
            job_type: "image",
            priority: 20,
            input_json: {},
          })
          .select("id,type,job_type,post_id,status")
          .single();
        if (error) throw error;
        queuedJobs.push(job);
      }
    }

    await systemLog(supabase, {
      brand_id: payload.brandId ?? null,
      module: "production-queue",
      status: "sucesso",
      friendly_message: "Fila criada sem processamento pesado na mesma chamada.",
      technical_detail: `batch=${batchId}; posts=${postIds.length}; jobs=${queuedJobs.length}`,
    });

    return json(req, {
      ok: true,
      batchId,
      queued: queuedJobs.length,
      processed: 0,
      jobs: queuedJobs,
      message: "Fila criada. Chame process-next-generation-job repetidamente para processar uma tarefa por vez.",
    });
  } catch (error) {
    return errorJson(req, error);
  }
});
