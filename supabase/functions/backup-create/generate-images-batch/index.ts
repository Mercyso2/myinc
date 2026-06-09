import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { stringifyError } from "../_shared/function-utils.ts";
import { cfg, getCorsHeaders, loadRuntimeConfig } from "../_shared/runtime-config.ts";

type Runtime = Record<string, string | null>;
type Row = Record<string, unknown>;

function json(req: Request, body: unknown, status = 200, runtime: Runtime = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req, runtime), "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} ausente no backend.`);
  return value;
}

function asObject(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function extractPostIds(body: Row) {
  const raw =
    body.postIds ??
    body.post_ids ??
    body.ids ??
    body.selectedPostIds ??
    body.selected_post_ids ??
    body.posts ??
    body.postId ??
    body.post_id;

  if (Array.isArray(raw)) {
    return unique(
      raw.map((item) => {
        if (typeof item === "string") return item;
        const obj = asObject(item);
        return String(obj.id ?? obj.postId ?? obj.post_id ?? "");
      }),
    );
  }

  if (typeof raw === "string") {
    return unique(raw.split(","));
  }

  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: getCorsHeaders(req) });
  }

  let runtime: Runtime = {};

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRole);
    runtime = await loadRuntimeConfig(supabase);

    if (req.method !== "POST") {
      return json(req, { ok: false, error: "Método inválido. Use POST." }, 405, runtime);
    }

    const body = (await req.json().catch(() => ({}))) as Row;
    let postIds = extractPostIds(body);

    if (!postIds.length && body.brandId) {
      const { data, error } = await supabase
        .from("posts")
        .select("id")
        .eq("brand_id", String(body.brandId))
        .in("status", ["approved", "ready", "content_ready", "partial_image_ready", "image_error"])
        .order("updated_at", { ascending: true })
        .limit(Number(cfg(runtime, "OPENAI_IMAGE_BATCH_MAX", "1")) || 1);

      if (error) throw error;
      postIds = unique((data ?? []).map((row) => String(row.id)));
    }

    if (!postIds.length) {
      return json(req, { ok: false, error: "Nenhum postId recebido para gerar imagem." }, 400, runtime);
    }

    const maxBatch = Math.max(1, Number(cfg(runtime, "OPENAI_IMAGE_BATCH_MAX", "1")) || 1);
    const selected = postIds.slice(0, maxBatch);
    const remaining = postIds.slice(maxBatch);

    const results: Array<{ postId: string; ok: boolean; accepted?: boolean; error?: string }> = [];

    for (const postId of selected) {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRole}`,
            apikey: serviceRole,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            postId,
            feedback: body.feedback ?? body.instructions ?? null,
            source: "generate-images-batch",
            async: true,
          }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || asObject(payload).ok === false) {
          throw new Error(`generate-image HTTP ${response.status}: ${stringifyError(payload)}`);
        }

        results.push({ postId, ok: true, accepted: true });
      } catch (error) {
        results.push({ postId, ok: false, error: stringifyError(error) });
      }
    }

    const ok = results.some((result) => result.ok);
    const failed = results.filter((result) => !result.ok);

    try {
      await supabase.from("system_logs").insert({
        type: "image_batch",
        status: failed.length ? "partial" : "accepted",
        detail: `Batch assíncrono aceitou ${selected.length}/${postIds.length}. Restantes: ${remaining.length}.`,
        payload: { selected, remaining, results },
      });
    } catch {
      // Log não pode derrubar a função.
    }

    return json(
      req,
      {
        ok,
        async: true,
        processed: selected.length,
        accepted: results.filter((result) => result.ok).length,
        remaining: remaining.length,
        remainingPostIds: remaining,
        results,
        message:
          remaining.length > 0
            ? `Modo assíncrono: aceitei ${selected.length} agora e deixei ${remaining.length} para a próxima rodada.`
            : "Imagens aceitas para geração em background. Aguarde os cards atualizarem para image_ready.",
      },
      ok ? 202 : 500,
      runtime,
    );
  } catch (error) {
    return json(
      req,
      {
        ok: false,
        error: stringifyError(error),
        hint:
          "generate-images-batch não deve esperar a imagem pronta. Este hotfix apenas enfileira/aceita e deixa generate-image rodar em background.",
      },
      500,
      runtime,
    );
  }
});
