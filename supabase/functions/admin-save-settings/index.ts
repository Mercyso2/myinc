import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, options, RUNTIME_KEYS } from "../_shared/runtime-config.ts";

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente nos Secrets da Edge Function.`);
  return value;
}

function bearer(req: Request) {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

function isSecretKey(key: string) {
  return key.includes("KEY") || key.includes("TOKEN") || key.includes("SECRET") || key.includes("PASSWORD");
}

const allowed = new Set<string>(RUNTIME_KEYS);

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  if (req.method !== "POST") return json(req, { ok: false, error: "Use POST." }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = bearer(req);
    if (!token) return json(req, { ok: false, error: "Faça login para salvar configurações." }, 401);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      return json(req, { ok: false, error: "Sessão inválida ou expirada.", detail: userError?.message ?? null }, 401);
    }

    const user = userData.user;
    const userEmail = user.email ?? "";

    const { data: profileById, error: profileByIdError } = await admin
      .from("app_users")
      .select("id,email,role,status,auth_user_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileByIdError) {
      return json(req, { ok: false, error: "Erro ao consultar perfil por auth_user_id.", detail: profileByIdError.message }, 500);
    }

    let profile = profileById;

    if (!profile && userEmail) {
      const { data: profileByEmail, error: profileByEmailError } = await admin
        .from("app_users")
        .select("id,email,role,status,auth_user_id")
        .ilike("email", userEmail)
        .maybeSingle();

      if (profileByEmailError) {
        return json(req, { ok: false, error: "Erro ao consultar perfil por email.", detail: profileByEmailError.message }, 500);
      }

      profile = profileByEmail;
    }

    // Regra pragmática atual: qualquer usuário logado e ativo pode salvar configurações.
    if (!profile || profile.status === "disabled" || profile.status === "inactive") {
      return json(req, {
        ok: false,
        error: "Usuário sem permissão para salvar configurações.",
        user: { id: user.id, email: userEmail },
        profile,
      }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const settings = body?.settings && typeof body.settings === "object" ? body.settings : {};
    const deleteKeys = Array.isArray(body?.deleteKeys) ? body.deleteKeys : [];

    const rows: Array<Record<string, unknown>> = [];
    const rejected: string[] = [];

    for (const [key, raw] of Object.entries(settings)) {
      if (!allowed.has(key)) {
        rejected.push(key);
        continue;
      }
      const value = String(raw ?? "").trim();
      if (!value) continue;
      rows.push({
        key,
        value,
        is_secret: isSecretKey(key),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length) {
      const { error } = await admin.from("runtime_secrets").upsert(rows, { onConflict: "key" });
      if (error) return json(req, { ok: false, error: "Falha ao salvar em runtime_secrets.", detail: error.message }, 500);
    }

    const toDelete = deleteKeys
      .map((key: unknown) => String(key ?? "").trim())
      .filter((key: string) => allowed.has(key));

    if (toDelete.length) {
      const { error } = await admin.from("runtime_secrets").delete().in("key", toDelete);
      if (error) return json(req, { ok: false, error: "Falha ao apagar chaves em runtime_secrets.", detail: error.message }, 500);
    }

    try {
      await admin.from("system_logs").insert({
        type: "admin",
        module: "configuracoes",
        status: "sucesso",
        user_id: user.id,
        friendly_message: "Configurações técnicas atualizadas pelo painel.",
        technical_detail: `keys=${rows.map((row) => row.key).join(",")}; deleted=${toDelete.join(",")}; rejected=${rejected.join(",")}`,
      });
    } catch {
      // Logs não podem quebrar o salvamento.
    }

    return json(req, {
      ok: true,
      saved: rows.map((row) => row.key),
      deleted: toDelete,
      rejected,
      message: "Configurações salvas. Rode Testar conexões reais em seguida.",
    });
  } catch (error) {
    return json(req, { ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
