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
    const postIds: string[] = Array.isArray(payload.postIds) ? payload.postIds : [];
    const batchId = crypto.randomUUID();
    let processed = 0;
    for (const postId of postIds) {
      await supabase.from("generation_jobs").insert({
        brand_id: payload.brandId ?? null,
        post_id: postId,
        type: "content",
        provider: "edge-function",
        status: "processing",
        input_json: payload,
      });
      await callFunction(req, "generate-post-content", {
        postId,
        instruction: payload.instruction ?? "Produzir conteudo premium MYINC.",
      });
      processed++;
    }
    return json(req, { ok: true, batchId, queued: postIds.length, processed });
  } catch (error) {
    return errorJson(req, error);
  }
});
