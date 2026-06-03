import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { cfg, loadRuntimeConfig } from "../_shared/runtime-config.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const runtime = await loadRuntimeConfig(supabase);
    const token = cfg(runtime, "META_PAGE_ACCESS_TOKEN");
    const pageId = cfg(runtime, "META_PAGE_ID") || cfg(runtime, "FACEBOOK_PAGE_ID");
    const igId = cfg(runtime, "META_INSTAGRAM_BUSINESS_ID");
    const version = cfg(runtime, "META_GRAPH_VERSION", "v23.0");
    const missing = [
      !token && "META_PAGE_ACCESS_TOKEN",
      !pageId && "META_PAGE_ID",
      !igId && "META_INSTAGRAM_BUSINESS_ID",
    ].filter(Boolean);
    if (missing.length)
      return json({ ok: false, missing, message: "Credenciais Meta incompletas." }, 400);
    const [page, ig] = await Promise.all([
      fetch(
        `https://graph.facebook.com/${version}/${pageId}?fields=id,name,access_token&access_token=${token}`,
      ).then((r) => r.json().then((data) => ({ ok: r.ok, data }))),
      fetch(
        `https://graph.facebook.com/${version}/${igId}?fields=id,username&access_token=${token}`,
      ).then((r) => r.json().then((data) => ({ ok: r.ok, data }))),
    ]);
    return json({
      ok: page.ok && ig.ok,
      page: page.data,
      instagram: ig.data,
      graphVersion: version,
    });
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : "Erro desconhecido" },
      400,
    );
  }
});
