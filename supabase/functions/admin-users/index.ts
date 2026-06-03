import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole)
      throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes.");

    const authHeader = req.headers.get("Authorization") ?? "";
    const adminClient = createClient(supabaseUrl, serviceRole);
    const callerToken = authHeader.replace("Bearer ", "");
    const { data: caller } = await adminClient.auth.getUser(callerToken);
    const { data: profile } = await adminClient
      .from("app_users")
      .select("role,status")
      .eq("auth_user_id", caller.user?.id)
      .maybeSingle();
    if (profile?.role !== "admin" || profile?.status === "disabled") {
      return new Response(JSON.stringify({ error: "Apenas admin pode criar usuários." }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { email, password, fullName, role = "user", brandId } = await req.json();
    if (!email || !fullName) throw new Error("Informe email e nome.");
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: password || crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (createError) throw createError;

    const { error: profileError } = await adminClient.from("app_users").upsert(
      {
        auth_user_id: created.user.id,
        email,
        full_name: fullName,
        role,
        brand_id: brandId || null,
        status: "active",
      },
      { onConflict: "email" },
    );
    if (profileError) throw profileError;

    return new Response(JSON.stringify({ ok: true, userId: created.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
