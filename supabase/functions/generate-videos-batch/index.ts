import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  callFunction,
  errorJson,
  requireActiveUser,
  serviceClient,
  stringifyError,
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
        .select("id,format")
        .eq("brand_id", payload.brandId)
        .or("format.ilike.%reels%,format.ilike.%video%,format.ilike.%vídeo%")
        .limit(1);
      if (error) throw error;
      postIds = (data ?? []).map((row) => row.id);
    }

    const selectedPostIds = postIds.slice(0, 1);
    const remaining = Math.max(0, postIds.length - selectedPostIds.length);
    const results: unknown[] = [];
    let generated = 0;

    for (const postId of selectedPostIds) {
      try {
        const result = await callFunction(req, "generate-video", { postId, force: payload.force });
        results.push({ postId, ok: true, result });
        generated++;
      } catch (error) {
        results.push({ postId, ok: false, error: stringifyError(error) });
      }
    }

    const responseBody = {
      ok: generated > 0 || selectedPostIds.length === 0,
      processed: selectedPostIds.length,
      requested: postIds.length,
      generated,
      remaining,
      results,
      message: "Processamento limitado a 1 video por chamada para evitar timeout.",
    };

    if (selectedPostIds.length && generated === 0) {
      return json(req, { ...responseBody, error: "Nenhum video foi gerado." }, 400);
    }
    return json(req, responseBody);
  } catch (error) {
    return errorJson(req, error);
  }
});
