import { callEdgeFunction } from "@/lib/supabase/client";

export type ProcessNextGenerationJobResult = {
  ok: boolean;
  processed: number;
  jobId?: string;
  jobType?: string;
  postId?: string;
  result?: unknown;
  message?: string;
  error?: string;
};

export async function processNextGenerationJob(token: string, payload: { batchId?: string } = {}) {
  const response = await fetch("/api/jobs/process-next", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as ProcessNextGenerationJobResult;
  if (!response.ok)
    throw new Error(data.error ?? `Processador Vercel respondeu HTTP ${response.status}.`);
  return data;
}

export function useExternalAiWorker() {
  const flag = String(import.meta.env.VITE_MYINC_EXTERNAL_AI_WORKER ?? "true").toLowerCase();
  return flag !== "false";
}

export async function processGenerationBatchSequentially(
  token: string,
  payload: {
    batchId?: string;
    maxSteps?: number;
    onStep?: (step: { index: number; result: ProcessNextGenerationJobResult }) => void;
    forceEdge?: boolean;
  } = {},
) {
  const maxSteps = Math.max(1, Math.min(120, Number(payload.maxSteps ?? 60)));
  const results: ProcessNextGenerationJobResult[] = [];

  for (let index = 0; index < maxSteps; index++) {
    const result = await processNextGenerationJob(token, { batchId: payload.batchId });
    results.push(result);
    payload.onStep?.({ index: index + 1, result });
    if (!result.ok || result.processed === 0) break;
  }

  return results;
}

export async function retryPostGenerationJobs(token: string, postId: string) {
  const response = await fetch("/api/jobs/retry", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ postId }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    retried?: number;
    error?: string;
  };
  if (!response.ok) throw new Error(data.error ?? `Retry respondeu HTTP ${response.status}.`);
  return { ...data, message: `${data.retried ?? 0} job(s) reenfileirado(s) para retry.` };
}
