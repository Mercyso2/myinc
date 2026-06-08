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
    const payload = await req.json().catch(() => ({}));
    const backup = {
      id: crypto.randomUUID(),
      label: payload.label ?? "manual",
      mode: "supabase-marker",
      createdAt: new Date().toISOString(),
      note: "Marcador de backup registrado. Use backups nativos do Supabase para dump completo.",
    };
    await systemLog(supabase, {
      brand_id: profile?.brand_id ?? null,
      module: "backup",
      status: "sucesso",
      friendly_message: "Marcador de backup criado.",
      technical_detail: JSON.stringify(backup),
    });
    return json(req, { ok: true, backup, backups: [backup] });
  } catch (error) {
    return errorJson(req, error);
  }
});
