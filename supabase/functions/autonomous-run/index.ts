import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  callFunction,
  errorJson,
  requireActiveUser,
  serviceClient,
} from "../_shared/function-utils.ts";
import { json, options } from "../_shared/runtime-config.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const payload = await req.json();
    const brandId = payload.brandId;
    if (!brandId) throw new Error("brandId e obrigatorio para automacao.");
    const { data: posts, error } = await supabase
      .from("posts")
      .select("*")
      .eq("brand_id", brandId)
      .is("archived_at", null)
      .neq("status", "publicado")
      .limit(30);
    if (error) throw error;

    let produced = 0;
    let generatedImages = 0;
    let approved = 0;
    let scheduled = 0;
    let published = 0;

    for (const post of posts ?? []) {
      if (!post.caption) {
        await callFunction(req, "generate-post-content", { postId: post.id });
        produced++;
      }
      if (payload.generateImages !== false && !post.media_url) {
        try {
          await callFunction(req, "generate-image", { postId: post.id });
          generatedImages++;
        } catch {
          // Keep automation running; post remains available for manual retry.
        }
      }
      if (payload.approve !== false) {
        await supabase
          .from("posts")
          .update({ status: "aprovado", approved_at: new Date().toISOString() })
          .eq("id", post.id);
        approved++;
      }
      if (payload.schedule !== false) {
        const scheduledAt =
          post.scheduled_at ?? new Date(Date.now() + (scheduled + 1) * 86400000).toISOString();
        await callFunction(req, "process-publish-queue", {
          action: "schedule",
          postId: post.id,
          channel: post.channel ?? "Instagram",
          scheduledAt,
        });
        scheduled++;
      }
    }

    if (payload.publish === true) {
      const result = await callFunction<{ processed: number }>(req, "process-publish-queue", {
        action: "process_due",
        limit: 10,
      });
      published = result.processed ?? 0;
    }

    return json(req, {
      ok: true,
      createdPosts: 0,
      produced,
      generatedImages,
      approved,
      scheduled,
      published,
    });
  } catch (error) {
    return errorJson(req, error);
  }
});
