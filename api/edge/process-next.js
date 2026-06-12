const env = (key) => String(process.env[key] || "").trim();

function supabaseConfig() {
  const url = (env("SUPABASE_URL") || env("VITE_SUPABASE_URL")).replace(/\/$/, "");
  const anonKey = env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw Object.assign(
      new Error(
        "Proxy Edge sem VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY. Configure as variáveis públicas Supabase já usadas pelo frontend e faça redeploy.",
      ),
      { statusCode: 503 },
    );
  }

  const parsed = new URL(url);
  const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!local && parsed.protocol !== "https:") {
    throw Object.assign(new Error("VITE_SUPABASE_URL precisa usar HTTPS em produção."), {
      statusCode: 503,
    });
  }
  return { url, anonKey };
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  try {
    const authorization = String(req.headers.authorization || "");
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token) return res.status(401).json({ ok: false, error: "Sessão de usuário ausente." });

    const { url, anonKey } = supabaseConfig();
    const response = await fetch(`${url}/functions/v1/process-next-generation-job-safe`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(typeof req.body === "object" && req.body ? req.body : {}),
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || `Supabase Edge respondeu HTTP ${response.status}.` };
    }

    // Older deployed Edge processors return HTTP 400 after persisting/requeueing a failed job.
    // Normalize that response so the browser can continue draining the remaining queue.
    const handledJob = Boolean(data?.jobId);
    const status = response.ok || handledJob ? 200 : response.status;
    return res.status(status).json({
      ...data,
      processed: handledJob
        ? Math.max(1, Number(data?.processed || 0))
        : Number(data?.processed || 0),
      processor: "supabase-edge-proxy",
      proxiedBy: "vercel-same-origin",
    });
  } catch (error) {
    return res.status(error?.statusCode || 502).json({
      ok: false,
      processed: 0,
      processor: "supabase-edge-proxy",
      error: error?.message || String(error),
    });
  }
}
