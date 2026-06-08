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
    let postIds: string[] = Array.isArray(payload.postIds) ? payload.postIds : [];
    if (!postIds.length && payload.brandId) {
      const { data, error } = await supabase
        .from("posts")
        .select("id")
        .eq("brand_id", payload.brandId)
        .is("archived_at", null)
        .neq("status", "publicado")
        .limit(30);
      if (error) throw error;
      postIds = (data ?? []).map((row) => row.id);
    }

    const results: unknown[] = [];
    let generated = 0;
    for (const postId of postIds) {
      try {
        const result = await callFunction(req, "generate-image", { postId });
        results.push({ postId, ok: true, result });
        generated++;
      } catch (error) {
        results.push({
          postId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return json(req, { ok: true, processed: postIds.length, generated, results });
  } catch (error) {
    return errorJson(req, error);
  }
});
