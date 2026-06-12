const value = (name) => String(process.env[name] || "").trim();
const supabaseUrl = () => value("SUPABASE_URL").replace(/\/$/, "");
const serviceKey = () => value("SUPABASE_SERVICE_ROLE_KEY");

async function authorize(req) {
  const authorization = String(req.headers.authorization || "");
  if (value("DEBUG_ADMIN_SECRET") && authorization === `Bearer ${value("DEBUG_ADMIN_SECRET")}`)
    return "admin";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token)
    throw Object.assign(new Error("DEBUG_ADMIN_SECRET ou sessão de usuário ausente."), {
      statusCode: 401,
    });
  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${token}` },
  });
  const user = await response.json().catch(() => ({}));
  if (!response.ok || !user?.id)
    throw Object.assign(new Error("Sessão inválida."), { statusCode: 401 });
  return "user";
}

async function get(path) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}` },
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });
  try {
    if (!supabaseUrl() || !serviceKey())
      throw Object.assign(new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes."), {
        statusCode: 503,
      });
    const actor = await authorize(req);
    const [jobs, logs, secrets] = await Promise.all([
      get("generation_jobs?select=id,status&limit=1"),
      get("generation_job_events?select=id,event_type&limit=1"),
      get("runtime_secrets?select=key&limit=200"),
    ]);
    const keys = Array.isArray(secrets.body) ? secrets.body.map((row) => row.key) : [];
    return res.status(200).json({
      ok: jobs.ok && logs.ok && secrets.ok,
      actor,
      runtime: "nodejs",
      queue: { reachable: jobs.ok, status: jobs.status, lockRpc: "claim_generation_job" },
      logs: { reachable: logs.ok, status: logs.status },
      credentials: {
        tableReachable: secrets.ok,
        openaiConfigured: keys.includes("OPENAI_API_KEY") || Boolean(value("OPENAI_API_KEY")),
        metaConfigured:
          keys.includes("META_PAGE_ACCESS_TOKEN") || Boolean(value("META_PAGE_ACCESS_TOKEN")),
      },
    });
  } catch (error) {
    return res
      .status(error?.statusCode || 500)
      .json({ ok: false, error: error?.message || String(error) });
  }
}
