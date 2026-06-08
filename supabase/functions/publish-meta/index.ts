import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { cfg, loadRuntimeConfig, requiredCfg } from "../_shared/runtime-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("CORS_ALLOW_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente no backend. Publicação real não executada.`);
  return value;
}
function sanitize(value: unknown) {
  return String(value)
    .replace(/EAA[A-Za-z0-9_-]+/g, "[META_TOKEN]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[OPENAI_KEY]");
}
function metaMessage(error: unknown) {
  const raw = typeof error === "string" ? error : JSON.stringify(error);
  if (raw.includes("OAuth"))
    return "Token Meta inválido ou expirado. Gere um novo token com permissões de publicação.";
  if (raw.toLowerCase().includes("permission"))
    return "Permissões Meta insuficientes para publicar neste canal.";
  if (raw.toLowerCase().includes("media"))
    return "A mídia precisa estar em uma URL pública HTTPS acessível pela Meta.";
  return "A Meta recusou a publicação. Veja o detalhe técnico nos logs.";
}
async function graph(path: string, body: Record<string, string>, version: string) {
  const response = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw data.error ?? data;
  return data;
}
function mediaUrls(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string");
  } catch {
    /* noop */
  }
  return raw
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}
function isVideo(url: string) {
  return /\.(mp4|mov|m4v)(\?|$)/i.test(url);
}
function isVideoFormat(format: unknown) {
  const normalized = String(format ?? "").toLowerCase();
  return (
    normalized.includes("reels") || normalized.includes("vídeo") || normalized.includes("video")
  );
}
function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value === "string" && value.trim().startsWith("[")) return mediaUrls(value);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const runtime = await loadRuntimeConfig(supabase);
  const token = requiredCfg(runtime, "META_PAGE_ACCESS_TOKEN", "Publicação Meta");
  const pageId = requiredCfg(runtime, "META_PAGE_ID", "Publicação Facebook");
  const igId = requiredCfg(runtime, "META_INSTAGRAM_BUSINESS_ID", "Publicação Instagram");
  const version = cfg(runtime, "META_GRAPH_VERSION", "v23.0");
  async function log(row: Record<string, unknown>) {
    await supabase.from("system_logs").insert({
      type: row.type ?? "meta",
      sanitized: true,
      ...row,
      technical_detail: sanitize(row.technical_detail ?? ""),
    });
  }
  let requestPayload: { postId?: string } = {};
  try {
    requestPayload = await req.json();
    const { postId } = requestPayload;
    if (!postId) return json({ error: "postId é obrigatório." }, 400);
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();
    if (postError || !post) throw postError ?? new Error("Post não encontrado.");
    if (!["aprovado", "agendado", "publicando"].includes(post.status))
      throw new Error("Somente posts aprovados ou agendados podem ser publicados.");
    if (!post.caption) throw new Error("Legenda obrigatória para publicação Meta.");
    const carouselUrls = asStringArray(post.carousel_media_urls);
    const urls =
      post.format?.includes("Carrossel") && carouselUrls.length > 1
        ? carouselUrls
        : isVideoFormat(post.format)
          ? asStringArray(post.video_url)
          : asStringArray(post.media_url);
    if (isVideoFormat(post.format) && !urls[0]) {
      throw new Error(
        "Reels/Vídeo exige video_url MP4 pública HTTPS. Gere o vídeo real antes de publicar.",
      );
    }
    if (!urls.length || urls.some((url) => !url.startsWith("https://")))
      throw new Error("Mídia pública HTTPS obrigatória.");
    if (isVideoFormat(post.format) && !isVideo(urls[0])) {
      throw new Error("Reels/Vídeo exige URL final .mp4/.mov/.m4v, não imagem de capa.");
    }
    await fetch(`https://graph.facebook.com/${version}/me/permissions?access_token=${token}`).then(
      async (r) => {
        const data = await r.json();
        if (!r.ok || data.error) throw data.error ?? data;
      },
    );
    await supabase
      .from("posts")
      .update({ status: "publicando", error_message: null })
      .eq("id", post.id);

    const metaIds: string[] = [];
    let publishedUrl = "";
    if (post.channel === "Instagram" || post.channel === "Ambos") {
      if (post.format?.includes("Carrossel") && urls.length > 1) {
        const children: string[] = [];
        for (const url of urls.slice(0, 10)) {
          const child = await graph(
            `${igId}/media`,
            { image_url: url, is_carousel_item: "true", access_token: token },
            version,
          );
          children.push(child.id);
        }
        const create = await graph(
          `${igId}/media`,
          {
            media_type: "CAROUSEL",
            children: children.join(","),
            caption: [post.caption, Array.isArray(post.hashtags) ? post.hashtags.join(" ") : ""]
              .filter(Boolean)
              .join("\n\n"),
            access_token: token,
          },
          version,
        );
        const publish = await graph(
          `${igId}/media_publish`,
          { creation_id: create.id, access_token: token },
          version,
        );
        metaIds.push(publish.id);
      } else if (post.format?.includes("Reels") || isVideo(urls[0])) {
        const create = await graph(
          `${igId}/media`,
          {
            media_type: "REELS",
            video_url: urls[0],
            caption: [post.caption, Array.isArray(post.hashtags) ? post.hashtags.join(" ") : ""]
              .filter(Boolean)
              .join("\n\n"),
            access_token: token,
          },
          version,
        );
        const publish = await graph(
          `${igId}/media_publish`,
          { creation_id: create.id, access_token: token },
          version,
        );
        metaIds.push(publish.id);
      } else {
        const create = await graph(
          `${igId}/media`,
          {
            image_url: urls[0],
            caption: [post.caption, Array.isArray(post.hashtags) ? post.hashtags.join(" ") : ""]
              .filter(Boolean)
              .join("\n\n"),
            access_token: token,
          },
          version,
        );
        const publish = await graph(
          `${igId}/media_publish`,
          { creation_id: create.id, access_token: token },
          version,
        );
        metaIds.push(publish.id);
      }
      publishedUrl = `https://www.instagram.com/p/${metaIds[0]}/`;
    }
    if (post.channel === "Facebook" || post.channel === "Ambos") {
      const fb = isVideo(urls[0])
        ? await graph(
            `${pageId}/videos`,
            {
              file_url: urls[0],
              description: [
                post.caption,
                Array.isArray(post.hashtags) ? post.hashtags.join(" ") : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
              access_token: token,
            },
            version,
          )
        : await graph(
            `${pageId}/photos`,
            {
              url: urls[0],
              caption: [post.caption, Array.isArray(post.hashtags) ? post.hashtags.join(" ") : ""]
                .filter(Boolean)
                .join("\n\n"),
              published: "true",
              access_token: token,
            },
            version,
          );
      metaIds.push(fb.id ?? fb.post_id);
      publishedUrl = publishedUrl || `https://www.facebook.com/${pageId}`;
    }
    const metaPublishId = metaIds.filter(Boolean).join(",");
    const { data: updatedPost } = await supabase
      .from("posts")
      .update({
        status: "publicado",
        meta_publish_id: metaPublishId,
        meta_post_id: metaPublishId,
        meta_permalink: publishedUrl,
        published_url: publishedUrl,
        published_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", post.id)
      .select()
      .single();
    await supabase
      .from("publish_queue")
      .update({
        status: "published",
        last_error: null,
        meta_response_json: { metaPublishId, publishedUrl },
      })
      .eq("post_id", post.id);
    await supabase
      .from("media_assets")
      .update({ used_in_publish: true, is_final: true })
      .eq("post_id", post.id)
      .eq("url", urls[0]);
    await supabase.from("publish_logs").insert({
      post_id: post.id,
      channel: post.channel,
      status: "published",
      friendly_message: "Post publicado na Meta com sucesso.",
      technical_detail: metaPublishId,
      meta_publish_id: metaPublishId,
      published_url: publishedUrl,
    });
    await log({
      brand_id: post.brand_id,
      post_id: post.id,
      module: "meta",
      status: "sucesso",
      friendly_message: "Publicação real Meta concluída.",
      technical_detail: metaPublishId,
    });
    return json({ ok: true, post: updatedPost, metaPublishId, publishedUrl });
  } catch (error) {
    const friendly = metaMessage(error);
    const detail = sanitize(error instanceof Error ? error.message : JSON.stringify(error));
    if (requestPayload.postId) {
      await supabase
        .from("posts")
        .update({ status: "erro", error_message: friendly })
        .eq("id", requestPayload.postId);
      await supabase
        .from("publish_queue")
        .update({
          status: "failed",
          last_error: friendly,
          next_attempt_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        })
        .eq("post_id", requestPayload.postId);
    }
    await log({
      post_id: requestPayload.postId,
      module: "meta",
      status: "erro",
      friendly_message: friendly,
      technical_detail: detail,
    });
    return json({ error: friendly, technicalDetail: detail }, 400);
  }
});
