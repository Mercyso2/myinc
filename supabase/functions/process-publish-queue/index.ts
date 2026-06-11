import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { callFunction, errorJson, requireActiveUser, serviceClient, systemLog } from "../_shared/function-utils.ts";
import { json, options } from "../_shared/runtime-config.ts";

const BLOCKED_POST_STATUSES = new Set(["arquivado", "excluido", "excluído", "deletado", "deleted"]);

function blockedPost(post: Record<string, unknown> | null) {
  if (!post) return true;
  if (post.deleted_at || post.archived_at) return true;
  return BLOCKED_POST_STATUSES.has(String(post.status ?? "").toLowerCase());
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const payload = await req.json();

    if (payload.action === "schedule") {
      const { data: post, error: postError } = await supabase.from("posts").select("*").eq("id", payload.postId).single();
      if (postError || !post) throw postError ?? new Error("Post nao encontrado.");
      if (blockedPost(post)) throw new Error("Post arquivado/excluido nao pode ser agendado.");
      if (!["aprovado", "agendado"].includes(String(post.status))) throw new Error("Somente posts aprovados ou agendados podem entrar na fila.");

      const scheduledAt = payload.scheduledAt ?? post.scheduled_at ?? new Date().toISOString();
      const idempotencyKey = `${post.id}:${payload.channel ?? post.channel}:${scheduledAt}`;
      const { data: queue, error } = await supabase.from("publish_queue").upsert({
        brand_id: post.brand_id,
        post_id: post.id,
        channel: payload.channel ?? post.channel,
        scheduled_at: scheduledAt,
        status: "queued",
        mode: "semi_automatico",
        idempotency_key: idempotencyKey,
        updated_at: new Date().toISOString(),
      }, { onConflict: "idempotency_key" }).select().single();
      if (error) throw error;

      const { data: updatedPost, error: updateError } = await supabase.from("posts").update({ status: "agendado", scheduled_at: scheduledAt, updated_at: new Date().toISOString() }).eq("id", post.id).select().single();
      if (updateError) throw updateError;
      return json(req, { ok: true, post: updatedPost, queue });
    }

    const limit = Math.max(1, Math.min(20, Number(payload.limit ?? 5)));
    const { data: queues, error } = await supabase.from("publish_queue").select("*").in("status", ["queued", "failed"]).lte("scheduled_at", new Date().toISOString()).order("scheduled_at").limit(limit);
    if (error) throw error;

    let processed = 0;
    let skipped = 0;
    for (const queue of queues ?? []) {
      try {
        const { data: post } = await supabase.from("posts").select("id,status,archived_at,deleted_at").eq("id", queue.post_id).maybeSingle();
        if (blockedPost(post)) {
          await supabase.from("publish_queue").update({ status: "cancelled", last_error: "Post arquivado/excluido; publicacao cancelada.", updated_at: new Date().toISOString() }).eq("id", queue.id);
          skipped++;
          continue;
        }
        await supabase.from("publish_queue").update({ status: "processing", attempts: Number(queue.attempts ?? 0) + 1 }).eq("id", queue.id);
        const result = await callFunction<Record<string, unknown>>(req, "publish-meta", { postId: queue.post_id, queueId: queue.id });
        await supabase.from("publish_queue").update({ status: "published", meta_response_json: result, updated_at: new Date().toISOString() }).eq("id", queue.id);
        processed++;
      } catch (error) {
        await supabase.from("publish_queue").update({ status: "failed", last_error: error instanceof Error ? error.message : String(error), next_attempt_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), updated_at: new Date().toISOString() }).eq("id", queue.id);
      }
    }

    await systemLog(supabase, { module: "publish-queue", status: "sucesso", friendly_message: "Fila de publicacao processada.", technical_detail: `processed=${processed}; skipped=${skipped}` });
    return json(req, { ok: true, processed, skipped });
  } catch (error) {
    return errorJson(req, error);
  }
});
