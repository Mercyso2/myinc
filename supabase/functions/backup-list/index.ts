import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { errorJson, requireActiveUser, serviceClient } from "../_shared/function-utils.ts";
import { json, options } from "../_shared/runtime-config.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);
  const supabase = serviceClient();
  try {
    await requireActiveUser(req, supabase);
    const { data } = await supabase
      .from("system_logs")
      .select("id,created_at,technical_detail")
      .eq("module", "backup")
      .order("created_at", { ascending: false })
      .limit(10);
    return json(req, {
      ok: true,
      backups: data ?? [],
      dbPath: "supabase-postgres",
      backupDir: "supabase-native-backups",
      uploadDir: "supabase-storage",
    });
  } catch (error) {
    return errorJson(req, error);
  }
});
