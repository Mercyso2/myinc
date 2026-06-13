import { json, readJson } from "../_lib/env.js";
import { requireUserOrSecret } from "../_lib/auth.js";
import { loadRuntimeConfig, patch, selectOne } from "../_lib/supabase.js";
import { runtime } from "../_lib/openai.js";
import { systemLog } from "../_lib/logs.js";

async function graph(config, path, body) {
  const version = runtime(config, "META_GRAPH_VERSION", "v23.0");
  const token = runtime(config, "META_PAGE_ACCESS_TOKEN");
  if (!token) throw Object.assign(new Error("META_PAGE_ACCESS_TOKEN ausente no Painel ADM."), { code: "missing_meta_token" });
  const params = new URLSearchParams({ access_token: token, ...body });
  const response = await fetch(`https://graph.facebook.com/${version}/${path}`, { method: "POST", body: params });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`Meta Graph ${response.status}: ${JSON.stringify(data).slice(0, 1000)}`), { providerResponse: data });
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
  try {
    const auth = await requireUserOrSecret(req);
    const body = await readJson(req);
    const postId = String(body.postId || "");
    if (!postId) throw Object.assign(new Error("postId obrigatório."), { statusCode: 400 });
    const post = await selectOne("posts", `select=*&id=eq.${encodeURIComponent(postId)}&limit=1`);
    if (!post) throw Object.assign(new Error("Post não encontrado."), { statusCode: 404 });
    if (!post.media_url) throw Object.assign(new Error("Post sem media_url pública para publicar."), { statusCode: 400 });
    const config = await loadRuntimeConfig();
    const allowedBrandId = runtime(config, "WORKER_BRAND_ID", process.env.WORKER_BRAND_ID || process.env.DEFAULT_BRAND_ID || "");
    if (allowedBrandId && String(post.brand_id) !== String(allowedBrandId)) throw Object.assign(new Error("Post fora do brand_id isolado deste deploy."), { statusCode: 403, code: "brand_scope_denied" });
    const igId = runtime(config, "META_INSTAGRAM_BUSINESS_ID");
    if (!igId) throw Object.assign(new Error("META_INSTAGRAM_BUSINESS_ID ausente no Painel ADM."), { code: "missing_ig_id" });
    const caption = [post.caption, Array.isArray(post.hashtags) ? post.hashtags.join(" ") : "", post.cta].filter(Boolean).join("\n\n");
    const media = await graph(config, `${igId}/media`, { image_url: post.media_url, caption });
    const publish = await graph(config, `${igId}/media_publish`, { creation_id: media.id });
    const updated = await patch("posts", `id=eq.${post.id}`, { status: "publicado", published_url: publish.id ? `https://www.instagram.com/p/${publish.id}` : null, published_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_message: null });
    await systemLog({ module: "publish-meta", status: "sucesso", message: "Post publicado na Meta.", detail: JSON.stringify({ media, publish }), post_id: post.id, brand_id: post.brand_id, user_id: auth.user?.id });
    return json(res, 200, { ok: true, post: updated, result: publish, message: "Publicação enviada para Instagram/Meta." });
  } catch (error) {
    await systemLog({ module: "publish-meta", status: "erro", message: "Falha na publicação Meta.", detail: error?.message || String(error) });
    return json(res, error?.statusCode || 500, { ok: false, error: error?.message || String(error), code: error?.code || null });
  }
}
