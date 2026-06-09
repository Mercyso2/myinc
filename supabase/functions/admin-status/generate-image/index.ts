import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stringifyError } from "../_shared/function-utils.ts";
import { getCorsHeaders, loadRuntimeConfig } from "../_shared/runtime-config.ts";
import { enqueueGenerationJob, inferJobType, json, requireEnv } from "../_shared/generation-queue.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const runtime = await loadRuntimeConfig(supabase);
  let postId: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    postId = String(body.postId ?? "");
    if (!postId) return json(req, { ok: false, error: "postId e obrigatorio." }, 400, runtime);

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (postError || !post) throw postError ?? new Error("Post nao encontrado.");

    const jobType = inferJobType(post, body.jobType ?? body.type);
    const { job, post: updatedPost } = await enqueueGenerationJob({
      supabase,
      post,
      jobType,
      payload: {
        requested_by: "generate-image",
        feedback: body.feedback ?? null,
        force: body.force ?? true,
        source: "single_button",
      },
      priority: Number(body.priority ?? 100),
    });

    return json(
      req,
      {
        ok: true,
        queued: true,
        status: "pending",
        jobId: job.id,
        jobType,
        post: updatedPost,
        mediaUrl: updatedPost.media_url ?? null,
        carouselMediaUrls: updatedPost.carousel_media_urls ?? [],
        message:
          jobType === "video"
            ? "Video/Reels enfileirado. O worker vai processar em segundo plano."
            : jobType === "carousel"
              ? "Carrossel enfileirado. As paginas serao geradas em segundo plano."
              : "Imagem enfileirada. O worker vai gerar e salvar em segundo plano.",
      },
      200,
      runtime,
    );
  } catch (error) {
    const technical = stringifyError(error);
    await supabase.from("system_logs").insert({
      post_id: postId,
      module: "generation_queue",
      type: "generation",
      status: "erro",
      friendly_message: "Falha ao enfileirar geracao.",
      technical_detail: technical,
    });

    if (postId) {
      await supabase
        .from("posts")
        .update({
          status: "erro",
          error_message: "Nao foi possivel enfileirar a geracao. Verifique migration generation_jobs.",
          technical_detail: technical,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);
    }

    return json(req, { ok: false, error: technical || "Erro desconhecido" }, 400, runtime);
  }
});
