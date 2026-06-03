import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const tables = [
  "app_users",
  "brands",
  "brand_profiles",
  "posts",
  "monthly_plans",
  "post_ideas",
  "media_assets",
  "library_items",
  "publish_queue",
  "generation_jobs",
  "campaigns",
  "brand_color_palette",
  "system_logs",
];
const buckets = ["brand-assets", "creative-media", "library"];
function boolEnv(name: string) {
  return Boolean(Deno.env.get(name));
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole)
      return json({ ok: false, error: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes." }, 500);
    const admin = createClient(supabaseUrl, serviceRole);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    const { data: profile } = await admin
      .from("app_users")
      .select("role,status")
      .eq("auth_user_id", userData.user?.id)
      .maybeSingle();
    const isAdmin = profile?.role === "admin" && profile?.status !== "disabled";
    if (!isAdmin)
      return json({ ok: false, admin: false, error: "Usuário atual não é admin." }, 403);

    const tableStatus: Record<string, boolean> = {};
    await Promise.all(
      tables.map(async (table) => {
        const { error } = await admin
          .from(table)
          .select("*", { count: "exact", head: true })
          .limit(1);
        tableStatus[table] = !error;
      }),
    );
    const { data: bucketRows } = await admin.storage.listBuckets();
    const bucketSet = new Set((bucketRows ?? []).map((bucket) => bucket.name));
    const storageStatus = Object.fromEntries(
      buckets.map((bucket) => [bucket, bucketSet.has(bucket)]),
    );
    const connected = Object.values(tableStatus).some(Boolean);
    return json({
      ok: connected && Object.values(tableStatus).every(Boolean),
      admin: true,
      environment: {
        openaiApiKey: boolEnv("OPENAI_API_KEY"),
        openaiTextModel: Deno.env.get("OPENAI_TEXT_MODEL") ?? null,
        openaiImageModel: Deno.env.get("OPENAI_IMAGE_MODEL") ?? null,
        metaPageAccessToken: boolEnv("META_PAGE_ACCESS_TOKEN"),
        metaPageId: boolEnv("META_PAGE_ID"),
        metaInstagramBusinessId: boolEnv("META_INSTAGRAM_BUSINESS_ID"),
        publicMediaBaseUrl: boolEnv("PUBLIC_MEDIA_BASE_URL"),
      },
      database: { connected, tables: tableStatus },
      storage: storageStatus,
      edgeFunctions: {
        adminStatus: true,
        processProductionQueue: true,
        processPublishQueue: true,
        metaTestConnection: true,
      },
    });
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : "Erro desconhecido" },
      500,
    );
  }
});
