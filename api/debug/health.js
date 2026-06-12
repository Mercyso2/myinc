const value = (name) => String(process.env[name] || "").trim();
const supabaseUrl = () => value("SUPABASE_URL").replace(/\/$/, "");
const serviceKey = () => value("SUPABASE_SERVICE_ROLE_KEY");

function maskSecret(secret) {
  if (!secret) return null;
  return `${secret.slice(0, Math.min(5, secret.length))}••••${secret.slice(-4)}`;
}

function safeProviderError(data, status) {
  const message = data?.error?.message || data?.message || `HTTP ${status}`;
  return String(message).slice(0, 500);
}

async function authorize(req) {
  const authorization = String(req.headers.authorization || "");
  if (value("DEBUG_ADMIN_SECRET") && authorization === `Bearer ${value("DEBUG_ADMIN_SECRET")}`)
    return "admin-secret";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token)
    throw Object.assign(new Error("Sessão de usuário ou DEBUG_ADMIN_SECRET ausente."), {
      statusCode: 401,
    });
  const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${token}` },
  });
  const user = await response.json().catch(() => ({}));
  if (!response.ok || !user?.id)
    throw Object.assign(new Error("Sessão inválida ou expirada."), { statusCode: 401 });
  const profileResponse = await rest(
    `app_users?select=role,status&or=(auth_user_id.eq.${user.id},email.eq.${encodeURIComponent(user.email || "")})&limit=1`,
  );
  const profile = profileResponse.body?.[0];
  if (
    !profileResponse.ok ||
    !profile ||
    profile.role !== "admin" ||
    ["disabled", "inactive", "blocked"].includes(String(profile.status))
  ) {
    throw Object.assign(
      new Error("Apenas administradores ativos podem executar o diagnóstico técnico."),
      { statusCode: 403 },
    );
  }
  return "authenticated-admin";
}

async function rest(path, options = {}) {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

async function testOpenAi(apiKey, imageModel) {
  if (!apiKey)
    return { configured: false, connected: false, error: "OPENAI_API_KEY não encontrada." };
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  const modelIds = Array.isArray(data?.data) ? data.data.map((model) => model.id) : [];
  return {
    configured: true,
    connected: response.ok,
    status: response.status,
    imageModel,
    imageModelAvailable: response.ok && modelIds.includes(imageModel),
    error: response.ok ? null : safeProviderError(data, response.status),
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });
  try {
    if (!supabaseUrl() || !serviceKey()) {
      return res.status(200).json({
        ok: false,
        runtime: "nodejs",
        worker: { deployed: true, configured: false, oneJobPerRequest: true },
        queue: { reachable: false, lastJob: null },
        credentials: {
          openai: {
            configured: false,
            connected: false,
            source: "edge-secrets-unavailable-to-vercel",
            masked: null,
          },
          metaConfigured: false,
        },
        error:
          "Worker Vercel sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY. Os Secrets das Edge Functions continuam válidos e serão usados pelo fallback Supabase Edge compute-safe.",
      });
    }

    const actor = await authorize(req);
    const [jobs, logs, secrets] = await Promise.all([
      rest("generation_jobs?select=id,status,error_message&order=created_at.desc&limit=1"),
      rest("generation_job_events?select=id,event_type&order=created_at.desc&limit=1"),
      rest("runtime_secrets?select=key,value,updated_at&limit=200"),
    ]);
    const rows = Array.isArray(secrets.body) ? secrets.body : [];
    const runtime = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    const openAiKey = String(runtime.OPENAI_API_KEY || value("OPENAI_API_KEY") || "");
    const openAiSource = runtime.OPENAI_API_KEY
      ? "supabase.runtime_secrets"
      : value("OPENAI_API_KEY")
        ? "vercel-env"
        : "missing";
    const imageModel = String(
      runtime.OPENAI_IMAGE_MODEL || value("OPENAI_IMAGE_MODEL") || "gpt-image-1",
    );
    const openai = await testOpenAi(openAiKey, imageModel);

    return res.status(200).json({
      ok: jobs.ok && logs.ok && secrets.ok && openai.connected && openai.imageModelAvailable,
      actor,
      runtime: "nodejs",
      worker: { deployed: true, configured: true, oneJobPerRequest: true },
      queue: { reachable: jobs.ok, status: jobs.status, lastJob: jobs.body?.[0] ?? null },
      logs: { reachable: logs.ok, status: logs.status },
      credentials: {
        tableReachable: secrets.ok,
        openai: {
          ...openai,
          source: openAiSource,
          masked: maskSecret(openAiKey),
          updatedAt: rows.find((row) => row.key === "OPENAI_API_KEY")?.updated_at ?? null,
        },
        metaConfigured: Boolean(runtime.META_PAGE_ACCESS_TOKEN || value("META_PAGE_ACCESS_TOKEN")),
      },
    });
  } catch (error) {
    return res
      .status(error?.statusCode || 500)
      .json({ ok: false, runtime: "nodejs", error: error?.message || String(error) });
  }
}
