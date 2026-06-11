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

export function processNextGenerationJob(token: string, payload: { batchId?: string } = {}) {
  return callEdgeFunction<ProcessNextGenerationJobResult>(
    "process-next-generation-job",
    token,
    payload,
  );
}

export async function processGenerationBatchSequentially(
  token: string,
  payload: {
    batchId?: string;
    maxSteps?: number;
    onStep?: (step: { index: number; result: ProcessNextGenerationJobResult }) => void;
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
