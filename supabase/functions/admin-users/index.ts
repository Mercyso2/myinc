import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  errorJson,
  requireActiveUser,
  serviceClient,
  systemLog,
} from "../_shared/function-utils.ts";
import { json, options } from "../_shared/runtime-config.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    const { profile } = await requireActiveUser(req, supabase);
    if (profile?.role !== "admin") throw new Error("Apenas admin pode criar usuarios.");

    const payload = await req.json();
    const email = String(payload.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(payload.password ?? "");
    if (!email.includes("@")) throw new Error("Email invalido.");
    if (password.length < 8) throw new Error("Senha deve ter pelo menos 8 caracteres.");

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: payload.fullName ?? "" },
    });
    if (error) throw error;

    const { error: upsertError } = await supabase.from("app_users").upsert(
      {
        auth_user_id: data.user.id,
        email,
        full_name: payload.fullName ?? null,
        role: payload.role ?? "editor",
        brand_id: payload.brandId ?? profile?.brand_id ?? null,
        status: payload.status ?? "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );
    if (upsertError) throw upsertError;

    await systemLog(supabase, {
      module: "admin-users",
      status: "sucesso",
      friendly_message: "Usuario criado no Supabase Auth e app_users.",
      technical_detail: `email=${email}; role=${payload.role ?? "editor"}`,
    });
    return json(req, { ok: true, userId: data.user.id });
  } catch (error) {
    await systemLog(supabase, {
      module: "admin-users",
      status: "erro",
      friendly_message: "Falha ao criar usuario.",
      technical_detail: error instanceof Error ? error.message : String(error),
    });
    return errorJson(req, error);
  }
});
