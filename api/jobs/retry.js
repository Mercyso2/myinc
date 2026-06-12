const env = (key) => String(process.env[key] || "").trim();
const url = () => env("SUPABASE_URL").replace(/\/$/, "");
const key = () => env("SUPABASE_SERVICE_ROLE_KEY");

async function rest(path, options = {}) {
  const response = await fetch(`${url()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw Object.assign(new Error(`Supabase REST ${response.status}: ${JSON.stringify(data)}`), {
      statusCode: 500,
    });
  return data;
}

async function activeUser(req) {
  const token = String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const response = await fetch(`${url()}/auth/v1/user`, {
    headers: { apikey: key(), Authorization: `Bearer ${token}` },
  });
  const user = await response.json().catch(() => ({}));
  if (!response.ok || !user?.id)
    throw Object.assign(new Error("Sessão inválida ou expirada."), { statusCode: 401 });
  const profiles = await rest(
    `app_users?select=brand_id,status&or=(auth_user_id.eq.${user.id},email.eq.${encodeURIComponent(user.email || "")})&limit=1`,
  );
  const profile = profiles?.[0];
  if (profile && ["disabled", "inactive", "blocked"].includes(String(profile.status)))
    throw Object.assign(new Error("Usuário sem perfil ativo."), { statusCode: 403 });
  return profile;
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  try {
    if (!url() || !key())
      throw Object.assign(new Error("Backend Supabase não configurado."), { statusCode: 503 });
    const profile = await activeUser(req);
    const { jobId, postId } = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (!jobId && !postId)
      return res.status(400).json({ ok: false, error: "jobId ou postId obrigatório." });
    const filters = jobId
      ? `id=eq.${encodeURIComponent(jobId)}`
      : `post_id=eq.${encodeURIComponent(postId)}`;
    const jobs = await rest(
      `generation_jobs?select=id,brand_id,status&${filters}&status=in.(failed,retrying)&order=created_at.desc`,
    );
    const allowed = (jobs || []).filter(
      (job) => !profile?.brand_id || job.brand_id === profile.brand_id,
    );
    if (!allowed.length)
      return res
        .status(404)
        .json({ ok: false, error: "Nenhum job com falha disponível para retry neste projeto." });
    const ids = allowed.map((job) => job.id).join(",");
    const retried = await rest(`generation_jobs?id=in.(${ids})`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "queued",
        progress: 0,
        attempt_count: 0,
        locked_at: null,
        locked_by: null,
        started_at: null,
        finished_at: null,
        next_attempt_at: null,
        retry_requested_at: new Date().toISOString(),
        error_message: null,
        error_code: null,
        updated_at: new Date().toISOString(),
      }),
    });
    await rest("generation_job_events", {
      method: "POST",
      body: JSON.stringify(
        allowed.map((job) => ({
          job_id: job.id,
          event_type: "retry",
          message: "Retry solicitado por usuário autenticado.",
          detail: { previous_status: job.status },
        })),
      ),
    });
    return res.status(200).json({
      ok: true,
      retried: retried.length,
      jobs: retried.map((job) => ({ id: job.id, status: job.status })),
    });
  } catch (error) {
    return res
      .status(error?.statusCode || 500)
      .json({ ok: false, error: error?.message || String(error) });
  }
}
