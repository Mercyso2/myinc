import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { RUNTIME_KEYS } from "../_shared/runtime-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente nos Secrets da Edge Function.`);
  return value;
}

function bearer(req: Request) {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

const allowed = new Set<string>(RUNTIME_KEYS);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Use POST." }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = bearer(req);
    if (!token) return json({ ok: false, error: "Faça login para salvar configurações." }, 401);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      return json({ ok: false, error: "Sessão inválida ou expirada." }, 401);
    }

    const user = userData.user;
    const { data: profile } = await admin
      .from("app_users")
      .select("id,email,role,status,auth_user_id")
      .or(`auth_user_id.eq.${user.id},email.eq.${user.email ?? ""}`)
      .maybeSingle();

    // Pragmatic rule for your current deploy: any active logged application user can save settings.
    // To lock later, change this to: profile?.role === "admin" && profile?.status === "active".
    if (!profile || profile.status === "disabled" || profile.status === "inactive") {
      return json({ ok: false, error: "Usuário sem permissão para salvar configurações." }, 403);
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
        is_secret: key.includes("KEY") || key.includes("TOKEN") || key.includes("SECRET"),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length) {
      const { error } = await admin.from("runtime_secrets").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    }

    const toDelete = deleteKeys.filter((key: string) => allowed.has(key));
    if (toDelete.length) {
      const { error } = await admin.from("runtime_secrets").delete().in("key", toDelete);
      if (error) throw error;
    }

    await admin.from("system_logs").insert({
      type: "admin",
      module: "configuracoes",
      status: "sucesso",
      user_id: user.id,
      friendly_message: "Configurações técnicas atualizadas pelo painel.",
      technical_detail: `keys=${rows.map((row) => row.key).join(",")}; deleted=${toDelete.join(",")}; rejected=${rejected.join(",")}`,
    }).catch(() => null);

    return json({
      ok: true,
      saved: rows.map((row) => row.key),
      deleted: toDelete,
      rejected,
      message: "Configurações salvas. Rode Testar conexões reais em seguida.",
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
