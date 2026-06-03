import { callEdgeFunction } from "@/lib/supabase/client";
import { BaseRepository } from "./base-repository";
import type { PostRow, PublishQueueRow } from "@/lib/supabase/types";

export const publishQueueRepository = new BaseRepository<PublishQueueRow>("publish_queue");
export const publishLogRepository = new BaseRepository<{
  id: string;
  post_id?: string | null;
  archived_at?: string | null;
}>("publish_logs");

export function queuePost(token: string, postId: string, channel: string, scheduledAt: string) {
  return publishQueueRepository.upsert(
    token,
    [
      {
        post_id: postId,
        channel,
        scheduled_at: scheduledAt,
        status: "queued",
        idempotency_key: `${postId}:${channel}:${scheduledAt}`,
      },
    ],
    "idempotency_key",
  );
}

export function schedulePost(
  token: string,
  post: { id: string; channel: string },
  scheduledAt: string,
) {
  return callEdgeFunction<{ ok: true; post: PostRow; queue: PublishQueueRow }>(
    "process-publish-queue",
    token,
    {
      action: "schedule",
      postId: post.id,
      channel: post.channel,
      scheduledAt,
    },
  );
}

export function processPublishQueue(token: string, limit = 5) {
  return callEdgeFunction<{ ok: true; processed: number }>("process-publish-queue", token, {
    action: "process_due",
    limit,
  });
}
