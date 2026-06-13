import { env, requiredEnv, short } from "./env.js";

export function supabaseConfig() {
  return {
    url: requiredEnv("SUPABASE_URL").replace(/\/$/, ""),
    serviceKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  };
}

export async function rest(path, options = {}) {
  const { url, serviceKey } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw Object.assign(new Error(`Supabase REST ${response.status}: ${short(body || text)}`), { statusCode: response.status, details: body });
  return body;
}

export async function rpc(fn, payload = {}) {
  return rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(payload) });
}

export const first = (result) => Array.isArray(result) ? result[0] : result;
export const insert = async (table, row) => first(await rest(table, { method: "POST", body: JSON.stringify(row) }));
export const patch = async (table, query, row) => first(await rest(`${table}?${query}`, { method: "PATCH", body: JSON.stringify(row) }));
export const selectOne = async (table, query) => first(await rest(`${table}?${query}`));

export async function authUser(token) {
  if (!token) throw Object.assign(new Error("Token de usuário ausente."), { statusCode: 401, code: "missing_token" });
  const { url, serviceKey } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) throw Object.assign(new Error("Sessão inválida ou expirada."), { statusCode: 401, details: data });
  return data;
}

export async function appProfileForUser(user) {
  const email = encodeURIComponent(user.email || "");
  return selectOne("app_users", `select=*&or=(auth_user_id.eq.${user.id},email.eq.${email})&limit=1`).catch(() => null);
}

export async function loadRuntimeConfig() {
  const rows = await rest("runtime_secrets?select=key,value").catch(() => []);
  const config = {};
  for (const [key, value] of Object.entries(process.env)) if (key) config[key] = value;
  if (Array.isArray(rows)) for (const row of rows) if (row?.key && String(row.value || "").trim()) config[row.key] = String(row.value).trim();
  return config;
}

export async function saveRuntimeSettings(settings, userId) {
  const allowed = new Set([
    "OPENAI_API_KEY", "OPENAI_TEXT_MODEL", "OPENAI_IMAGE_MODEL", "OPENAI_IMAGE_FALLBACK_MODELS", "OPENAI_IMAGE_QUALITY", "OPENAI_IMAGE_FORMAT",
    "OPENAI_IMAGE_SIZE_FEED", "OPENAI_IMAGE_SIZE_STORY", "OPENAI_IMAGE_SIZE_SQUARE", "OPENAI_IMAGE_SIZE_FACEBOOK",
    "MEDIA_BUCKET", "PUBLIC_MEDIA_BASE_URL", "META_GRAPH_VERSION", "META_PAGE_ACCESS_TOKEN", "META_PAGE_ID", "FACEBOOK_PAGE_ID", "META_INSTAGRAM_BUSINESS_ID",
    "OPENAI_VIDEO_ENDPOINT", "OPENAI_VIDEO_MODEL", "OPENAI_VIDEO_SIZE", "OPENAI_VIDEO_SECONDS", "CRON_SECRET", "VERCEL_APP_URL", "WORKER_BRAND_ID", "DEFAULT_BRAND_ID", "ISOLATED_ENVIRONMENT_NAME"
  ]);
  const rows = Object.entries(settings || {})
    .filter(([key, value]) => allowed.has(key) && String(value ?? "").trim())
    .map(([key, value]) => ({ key, value: String(value).trim(), is_secret: /KEY|TOKEN|SECRET/i.test(key), updated_by: userId || null, updated_at: new Date().toISOString() }));
  if (!rows.length) throw new Error("Nenhuma configuração válida para salvar.");
  return rest("runtime_secrets?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows)
  });
}
