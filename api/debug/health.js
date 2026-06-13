import { json } from "../_lib/env.js";
import { requireUserOrSecret } from "../_lib/auth.js";
import { loadRuntimeConfig, rest } from "../_lib/supabase.js";
import { mediaBucket } from "../_lib/storage.js";
import { runtime } from "../_lib/openai.js";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return json(res, 405, { ok: false, error: "method_not_allowed" });
  try {
    await requireUserOrSecret(req);
    const config = await loadRuntimeConfig();
    const bucket = mediaBucket(config);
    const brandId = runtime(config, "WORKER_BRAND_ID", process.env.WORKER_BRAND_ID || process.env.DEFAULT_BRAND_ID || "");
    const brandFilter = brandId ? `&brand_id=eq.${encodeURIComponent(brandId)}` : "";
    const [lastJobs, pendingRows, failedRows] = await Promise.all([
      rest(`generation_jobs?select=*&order=created_at.desc&limit=1${brandFilter}`).catch(() => []),
      rest(`generation_jobs?select=id&status=in.(queued,processing,retrying)&limit=1000${brandFilter}`).catch(() => []),
      rest(`generation_jobs?select=id&status=eq.failed&limit=1000${brandFilter}`).catch(() => [])
    ]);
    const health = {
      ok: true,
      worker: { configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY), reachable: true, oneJobPerRequest: true },
      supabase: { configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY), connected: true },
      queue: { reachable: true, lastJob: Array.isArray(lastJobs) ? lastJobs[0] ?? null : null, pending: Array.isArray(pendingRows) ? pendingRows.length : 0, failed: Array.isArray(failedRows) ? failedRows.length : 0 },
      storage: { bucket, publicBaseUrl: Boolean(runtime(config, "PUBLIC_MEDIA_BASE_URL")) },
      credentials: {
        OPENAI_API_KEY: Boolean(runtime(config, "OPENAI_API_KEY")),
        OPENAI_TEXT_MODEL: runtime(config, "OPENAI_TEXT_MODEL", "gpt-4.1"),
        OPENAI_IMAGE_MODEL: runtime(config, "OPENAI_IMAGE_MODEL", "gpt-image-1"),
        OPENAI_VIDEO_ENDPOINT: Boolean(runtime(config, "OPENAI_VIDEO_ENDPOINT")),
        META_PAGE_ACCESS_TOKEN: Boolean(runtime(config, "META_PAGE_ACCESS_TOKEN")),
        META_PAGE_ID: Boolean(runtime(config, "META_PAGE_ID") || runtime(config, "FACEBOOK_PAGE_ID")),
        META_INSTAGRAM_BUSINESS_ID: Boolean(runtime(config, "META_INSTAGRAM_BUSINESS_ID")),
        MEDIA_BUCKET: bucket,
        WORKER_BRAND_ID: brandId || null
      }
    };
    return json(res, 200, health);
  } catch (error) {
    return json(res, error?.statusCode || 500, { ok: false, worker: { configured: false, reachable: false, oneJobPerRequest: true }, supabase: { configured: Boolean(process.env.SUPABASE_URL), connected: false }, queue: { reachable: false, lastJob: null, pending: 0, failed: 0 }, storage: { bucket: "creative-media", publicBaseUrl: false }, credentials: {}, error: error?.message || String(error) });
  }
}
