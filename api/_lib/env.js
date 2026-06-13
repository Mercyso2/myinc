export function env(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value === null || String(value).trim() === "" ? fallback : String(value).trim();
}

export function requiredEnv(name) {
  const value = env(name);
  if (!value) throw Object.assign(new Error(`${name} ausente na Vercel.`), { statusCode: 503, code: "missing_env" });
  return value;
}

export function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8").end(JSON.stringify(body));
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

export function bearer(req) {
  const header = String(req.headers.authorization || req.headers.Authorization || "");
  return header.replace(/^Bearer\s+/i, "").trim();
}

export function short(value, max = 1200) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return raw.length > max ? `${raw.slice(0, max)}...` : raw;
}

export function publicBaseUrl(req) {
  return env("VERCEL_APP_URL") || `https://${req.headers.host}`;
}
