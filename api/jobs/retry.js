import { json, readJson } from "../_lib/env.js";
import { requireUserOrSecret } from "../_lib/auth.js";
import { loadRuntimeConfig, patch, rest } from "../_lib/supabase.js";
import { runtime } from "../_lib/openai.js";
import { systemLog } from "../_lib/logs.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
  try {
    const auth = await requireUserOrSecret(req);
    const body = await readJson(req);
    const config = await loadRuntimeConfig();
    const brandId = String(body.brandId || runtime(config, "WORKER_BRAND_ID", process.env.WORKER_BRAND_ID || process.env.DEFAULT_BRAND_ID || "")).trim();
    const brandFilter = brandId ? `&brand_id=eq.${encodeURIComponent(brandId)}` : "";
    let ids = Array.isArray(body.jobIds) ? body.jobIds.map(String).filter(Boolean) : [];
    if (!ids.length && body.mode === "failed-posts") {
      const rows = await rest(`generation_jobs?select=id&status=eq.failed&order=updated_at.desc&limit=200${brandFilter}`).catch(() => []);
      ids = Array.isArray(rows) ? rows.map((r) => r.id) : [];
    }
    if (!ids.length) return json(res, 200, { ok: true, retried: 0, message: "Nenhum job com erro encontrado." });
    let retried = 0;
    for (const id of ids) {
      await patch("generation_jobs", `id=eq.${encodeURIComponent(id)}${brandFilter}`, { status: "queued", progress: 0, attempt_count: 0, error_message: null, error_code: null, provider_response: null, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      retried++;
    }
    await systemLog({ module: "jobs-retry", status: "sucesso", message: `${retried} job(s) reenfileirados.`, user_id: auth.user?.id });
    return json(res, 200, { ok: true, retried, message: `${retried} job(s) enviados novamente para fila.` });
  } catch (error) {
    await systemLog({ module: "jobs-retry", status: "erro", message: "Falha ao reprocessar jobs.", detail: error?.message || String(error) });
    return json(res, error?.statusCode || 500, { ok: false, error: error?.message || String(error) });
  }
}
