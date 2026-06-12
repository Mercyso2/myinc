import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  json,
  loadRuntimeConfig,
  options,
  publicRuntimeStatus,
} from "../_shared/runtime-config.ts";

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
  "runtime_secrets",
];

const buckets = ["brand-assets", "creative-media", "library"];

function bearer(req: Request) {
  return (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRole) {
      return json(
        req,
        {
          ok: false,
          admin: false,
          error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente nos Secrets da Edge Function.",
          environment: { supabaseUrl: Boolean(supabaseUrl), serviceRole: Boolean(serviceRole) },
        },
        500,
      );
    }

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = bearer(req);
    if (!token) return json(req, { ok: false, admin: false, error: "Token ausente." }, 401);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
      return json(
        req,
        {
          ok: false,
          admin: false,
          error: "Token inválido ou sessão expirada.",
          detail: userError?.message ?? null,
        },
        401,
      );
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email ?? "";

    const { data: profile } = await admin
      .from("app_users")
      .select("id,email,role,status,auth_user_id,brand_id")
      .or(`auth_user_id.eq.${userId},email.eq.${userEmail}`)
      .maybeSingle();

    const allowed = profile && profile.status !== "disabled" && profile.status !== "inactive";
    if (!allowed) {
      return json(
        req,
        {
          ok: false,
          admin: false,
          error: "Usuário sem perfil ativo em app_users.",
          user: { id: userId, email: userEmail },
          profile: profile ?? null,
        },
        403,
      );
    }

    const runtime = await loadRuntimeConfig(admin);

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

    let storageStatus: Record<string, boolean> = {};
    let creativeMediaPublic = false;
    try {
      const { data: bucketRows } = await admin.storage.listBuckets();
      const bucketSet = new Set((bucketRows ?? []).map((bucket) => bucket.name));
      creativeMediaPublic = Boolean(
        (bucketRows ?? []).find((bucket) => bucket.name === "creative-media")?.public,
      );
      storageStatus = Object.fromEntries(buckets.map((bucket) => [bucket, bucketSet.has(bucket)]));
    } catch {
      storageStatus = Object.fromEntries(buckets.map((bucket) => [bucket, false]));
    }

    const connected = Object.values(tableStatus).some(Boolean);
    const { data: lastImageError } = await admin
      .from("system_logs")
      .select("technical_detail,created_at")
      .in("module", ["imagem", "vercel-ai-worker-v3", "image-fast-safe", "carousel-page"])
      .eq("status", "erro")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const publicStatus = publicRuntimeStatus(runtime);
    const edgeOpenAiKey =
      Deno.env.get("OPENAI_API_KEY")?.trim() || runtime.OPENAI_API_KEY?.trim() || "";
    let edgeOpenAiConnection = {
      tested: false,
      connected: false,
      status: null as number | null,
      error: null as string | null,
    };
    if (edgeOpenAiKey) {
      try {
        const response = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${edgeOpenAiKey}` },
        });
        const body = await response.json().catch(() => ({}));
        edgeOpenAiConnection = {
          tested: true,
          connected: response.ok,
          status: response.status,
          error: response.ok
            ? null
            : String(body?.error?.message ?? body?.message ?? `HTTP ${response.status}`).slice(
                0,
                500,
              ),
        };
      } catch (error) {
        edgeOpenAiConnection = {
          tested: true,
          connected: false,
          status: null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return json(req, {
      ok: true,
      admin: profile?.role === "admin",
      user: { id: userId, email: userEmail },
      profile,
      environment: {
        supabaseUrl: Boolean(supabaseUrl),
        serviceRole: Boolean(serviceRole),
        ...publicStatus,
      },
      database: { connected, tables: tableStatus },
      storage: storageStatus,
      imageDiagnostic: {
        openaiApiKey: Boolean(edgeOpenAiKey),
        openaiKeySource: Deno.env.get("OPENAI_API_KEY")?.trim()
          ? "supabase-edge-secret"
          : runtime.OPENAI_API_KEY?.trim()
            ? "runtime_secrets"
            : "missing",
        openaiConnection: edgeOpenAiConnection,
        textModel: Boolean(publicStatus.openaiTextModel),
        imageModel: Boolean(publicStatus.openaiImageModel),
        imageModelName: publicStatus.openaiImageModel,
        imageFallbackModels: publicStatus.openaiImageFallbackModels,
        storage: storageStatus["creative-media"] === true,
        creativeMediaBucket: storageStatus["creative-media"] === true,
        publicUrl: creativeMediaPublic && Boolean(publicStatus.publicMediaBaseUrl),
        generateImageFunction: true,
        lastTechnicalError: lastImageError?.technical_detail ?? null,
      },
      edgeFunctions: {
        adminStatus: true,
        adminSaveSettings: true,
        adminUsers: true,
        aiGeneratePlan: true,
        autonomousRun: true,
        backupCreate: true,
        backupList: true,
        generateImage: true,
        generateImagesBatch: true,
        generatePostContent: true,
        generateVideo: true,
        generateVideosBatch: true,
        improvePost: true,
        metaTestConnection: true,
        processProductionQueue: true,
        processNextGenerationJobSafe: true,
        processPublishQueue: true,
        publishMeta: true,
        renderTemplate: true,
        renderTemplatesBatch: true,
        reviewPostQuality: true,
      },
    });
  } catch (error) {
    return json(
      req,
      { ok: false, admin: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
