import { handleOptions, json, errorJson, readJson, asNumber, asString, nowIso } from '../_shared/http.ts';
import { serviceRoleKey, requiredEnv } from '../_shared/env.ts';
import { supabaseAdmin, updateByIdCompatible } from '../_shared/supabase.ts';

async function invokeFunction(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${requiredEnv('SUPABASE_URL')}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey()}`,
      apikey: serviceRoleKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${name} falhou: ${JSON.stringify(payload).slice(0, 1400)}`);
  return payload as Record<string, unknown>;
}

function pickFunction(job: Record<string, unknown>, post: Record<string, unknown> | null): string {
  const raw = `${job.job_type ?? job.type ?? job.kind ?? post?.format ?? ''}`.toLowerCase();
  if (raw.includes('video') || raw.includes('reel')) return 'generate-video';
  if (raw.includes('copy') || raw.includes('content') || raw.includes('caption')) return 'generate-post-content';
  return 'generate-image';
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const input = await readJson(req);
    const limit = Math.min(asNumber(input.limit, 3), 10);
    const supabase = supabaseAdmin();

    const { data: jobs, error } = await supabase
      .from('generation_jobs')
      .select('*')
      .in('status', ['pending', 'queued', 'waiting', 'retry'])
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];
    for (const job of (jobs ?? []) as Array<Record<string, unknown>>) {
      const jobId = String(job.id);
      const postId = asString(job.post_id || job.postId || job.post);
      try {
        await updateByIdCompatible('generation_jobs', jobId, [
          { status: 'processing', started_at: nowIso(), error: null, updated_at: nowIso() },
          { status: 'processing', updated_at: nowIso() },
        ]);

        let post: Record<string, unknown> | null = null;
        if (postId) {
          const { data } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
          post = (data ?? null) as Record<string, unknown> | null;
        }

        const payload = typeof job.input === 'object' && job.input !== null ? job.input as Record<string, unknown> : {};
        const functionName = asString(input.function_name) || pickFunction(job, post);
        const output = await invokeFunction(functionName, { ...payload, post_id: postId, job_id: jobId });

        await updateByIdCompatible('generation_jobs', jobId, [
          { status: 'completed', output, finished_at: nowIso(), updated_at: nowIso() },
          { status: 'completed', updated_at: nowIso() },
        ]);
        results.push({ job_id: jobId, post_id: postId, ok: true, function: functionName, output });
      } catch (error) {
        await updateByIdCompatible('generation_jobs', jobId, [
          { status: 'failed', error: error instanceof Error ? error.message : String(error), finished_at: nowIso(), updated_at: nowIso() },
          { status: 'failed', updated_at: nowIso() },
        ]);
        results.push({ job_id: jobId, post_id: postId, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return json({ ok: true, processed: results.length, results });
  } catch (error) {
    return errorJson('Falha ao processar fila de produção.', 500, error);
  }
});
