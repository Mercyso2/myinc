import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json } from "./runtime-config.ts";

export function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente nos Secrets da Edge Function.`);
  return value;
}

export function serviceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bearer(req: Request) {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

export async function requireActiveUser(req: Request, supabase = serviceClient()) {
  const token = bearer(req);
  if (!token) throw new Error("Token ausente.");

  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) throw new Error("Sessao invalida ou expirada.");

  const email = userData.user.email ?? "";
  const { data: profile } = await supabase
    .from("app_users")
    .select("*")
    .or(`auth_user_id.eq.${userData.user.id},email.eq.${email}`)
    .maybeSingle();

  if (profile && ["disabled", "inactive", "blocked"].includes(String(profile.status))) {
    throw new Error("Usuario sem perfil ativo em app_users.");
  }

  return { token, user: userData.user, profile };
}

export async function systemLog(
  supabase: ReturnType<typeof serviceClient>,
  row: Record<string, unknown>,
) {
  await supabase.from("system_logs").insert({
    module: row.module ?? "edge-function",
    type: row.type ?? "event",
    severity: row.severity ?? (row.status === "erro" ? "error" : "info"),
    status: row.status ?? "info",
    friendly_message: row.friendly_message ?? "",
    technical_detail: row.technical_detail ?? "",
    ...row,
  });
}

export async function callFunction<T>(
  req: Request,
  name: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const url = `${requireEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/${name}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: req.headers.get("Authorization") ?? "",
      apikey:
        req.headers.get("apikey") ??
        Deno.env.get("SUPABASE_ANON_KEY") ??
        requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error ? String(data.error) : JSON.stringify(data);
    throw new Error(`${name} falhou: ${detail}`);
  }
  return data as T;
}

export function errorJson(req: Request, error: unknown, status = 400) {
  return json(
    req,
    { ok: false, error: error instanceof Error ? error.message : String(error) },
    status,
  );
}
