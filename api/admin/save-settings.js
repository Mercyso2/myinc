import { json, readJson } from "../_lib/env.js";
import { requireAdmin } from "../_lib/auth.js";
import { saveRuntimeSettings } from "../_lib/supabase.js";
import { systemLog } from "../_lib/logs.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
  try {
    const auth = await requireAdmin(req);
    const body = await readJson(req);
    const saved = await saveRuntimeSettings(body.settings || {}, auth.user?.id || null);
    await systemLog({ module: "admin-save-settings", status: "sucesso", message: "Credenciais runtime salvas com segurança.", user_id: auth.user?.id });
    return json(res, 200, { ok: true, saved: saved.length, message: `${saved.length} configuração(ões) salva(s).` });
  } catch (error) {
    await systemLog({ module: "admin-save-settings", status: "erro", message: "Falha ao salvar credenciais.", detail: error?.message || String(error) });
    return json(res, error?.statusCode || 500, { ok: false, error: error?.message || String(error), code: error?.code || null });
  }
}
