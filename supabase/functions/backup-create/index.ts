import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  errorJson,
  requireActiveUser,
  serviceClient,
  stringifyError,
  systemLog,
} from "../_shared/function-utils.ts";
import { cfg, json, loadRuntimeConfig, options } from "../_shared/runtime-config.ts";

const BACKUP_TABLES = [
  "brands",
  "brand_profiles",
  "brand_color_palette",
  "ai_brain_rules",
  "ai_prompt_templates",
  "monthly_plans",
  "post_ideas",
  "posts",
  "post_versions",
  "content_comments",
  "media_assets",
  "library_items",
  "publish_queue",
  "generation_jobs",
  "campaigns",
  "system_logs",
] as const;

function safeLabel(value: unknown) {
  return String(value ?? "manual")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "manual";
}

async function ensureBucket(supabase: ReturnType<typeof serviceClient>, bucket: string) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if ((buckets ?? []).some((item) => item.name === bucket)) return;

  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
  });
  if (error && !String(error.message ?? "").toLowerCase().includes("already")) throw error;
}

async function selectTable(
  supabase: ReturnType<typeof serviceClient>,
  table: string,
  brandId: string | null,
) {
  const limit = table === "system_logs" ? 750 : 2500;

  if (brandId) {
    const filtered = await supabase.from(table).select("*").eq("brand_id", brandId).limit(limit);
    if (!filtered.error) return { rows: filtered.data ?? [], filteredByBrand: true, error: null };
  }

  const all = await supabase.from(table).select("*").limit(limit);
  if (all.error) return { rows: [], filteredByBrand: false, error: stringifyError(all.error) };
  return { rows: all.data ?? [], filteredByBrand: false, error: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);

  const supabase = serviceClient();

  try {
    const { profile } = await requireActiveUser(req, supabase);
    const payload = await req.json().catch(() => ({}));
    const runtime = await loadRuntimeConfig(supabase);

    const brandId = String(payload.brandId ?? profile?.brand_id ?? "") || null;
    const bucket = cfg(runtime, "BACKUP_BUCKET", "library");
    const label = safeLabel(payload.label);
    const createdAt = new Date().toISOString();
    const stamp = createdAt.replace(/[:.]/g, "-");
    const path = `backups/myinc-${label}-${stamp}.json`;

    await ensureBucket(supabase, bucket);

    const tables: Record<string, unknown> = {};
    const summary: Record<string, { rows: number; filteredByBrand: boolean; error: string | null }> = {};

    for (const table of BACKUP_TABLES) {
      const result = await selectTable(supabase, table, brandId);
      tables[table] = result.rows;
      summary[table] = {
        rows: Array.isArray(result.rows) ? result.rows.length : 0,
        filteredByBrand: result.filteredByBrand,
        error: result.error,
      };
    }

    const backup = {
      id: crypto.randomUUID(),
      label,
      createdAt,
      brandId,
      mode: "json-storage-export",
      version: "v1.4-production-hardening",
      tables,
      summary,
    };

    const bytes = new TextEncoder().encode(JSON.stringify(backup, null, 2));
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: "application/json",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    await systemLog(supabase, {
      brand_id: brandId,
      module: "backup",
      status: "sucesso",
      friendly_message: "Backup JSON completo criado no Storage.",
      technical_detail: JSON.stringify({
        id: backup.id,
        bucket,
        path,
        sizeBytes: bytes.byteLength,
        summary,
      }),
    });

    return json(req, {
      ok: true,
      backup: {
        id: backup.id,
        label,
        createdAt,
        brandId,
        bucket,
        path,
        sizeBytes: bytes.byteLength,
        summary,
      },
      message: `Backup criado em ${bucket}/${path}.`,
    });
  } catch (error) {
    await systemLog(supabase, {
      module: "backup",
      status: "erro",
      friendly_message: "Falha ao criar backup JSON.",
      technical_detail: stringifyError(error),
    }).catch(() => undefined);

    return errorJson(req, error);
  }
});
