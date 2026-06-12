import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  errorJson,
  requireActiveUser,
  serviceClient,
  stringifyError,
  systemLog,
} from "../_shared/function-utils.ts";
import { cfg, json, loadRuntimeConfig, options } from "../_shared/runtime-config.ts";

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const raw = Number(value ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return options(req);

  const supabase = serviceClient();

  try {
    await requireActiveUser(req, supabase);
    const runtime = await loadRuntimeConfig(supabase);
    const body = await req.json().catch(() => ({}));

    const baseUrl = String(
      cfg(runtime, "VERCEL_APP_URL", Deno.env.get("VERCEL_APP_URL") ?? "https://www.myinc-ia.com.br"),
    ).replace(/\/$/, "");
    const secret = cfg(runtime, "CRON_SECRET", Deno.env.get("CRON_SECRET") ?? "");
    const passes = clamp(body.passes, 6, 1, 20);
    const stopWhenEmpty = body.stopWhenEmpty !== false;

    const results: Array<Record<string, unknown>> = [];
    let processed = 0;
    let emptyRuns = 0;

    for (let index = 0; index < passes; index++) {
      const response = await fetch(`${baseUrl}/api/worker/process`, {
        method: "POST",
        headers: {
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source: "manual-trigger", pass: index + 1 }),
      });

      const text = await response.text();
      let parsed: Record<string, unknown>;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = { ok: false, raw: text };
      }

      if (!response.ok) {
        results.push({ ok: false, status: response.status, response: parsed });
        throw new Error(`Worker Vercel retornou ${response.status}: ${stringifyError(parsed)}`);
      }

      const currentProcessed = Number(parsed.processed ?? 0);
      processed += Number.isFinite(currentProcessed) ? currentProcessed : 0;
      if (!currentProcessed) emptyRuns++;
      results.push({ ok: true, status: response.status, ...parsed });

      if (stopWhenEmpty && emptyRuns >= 2) break;
    }

    await systemLog(supabase, {
      module: "worker-trigger",
      status: "sucesso",
      friendly_message: "Worker Vercel acionado manualmente.",
      technical_detail: `passes=${results.length}; processed=${processed}; baseUrl=${baseUrl}`,
    });

    return json(req, {
      ok: true,
      processed,
      passes: results.length,
      results,
      message: processed
        ? `${processed} job(s) processado(s) em ${results.length} passada(s). Clique em Atualizar para ver os cards.`
        : `Worker acionado em ${results.length} passada(s), mas não havia job pronto na fila.`,
    });
  } catch (error) {
    await systemLog(supabase, {
      module: "worker-trigger",
      status: "erro",
      friendly_message: "Falha ao acionar worker Vercel.",
      technical_detail: stringifyError(error),
    });
    return errorJson(req, error);
  }
});
