import { handleOptions, json, errorJson, readJson, asNumber, asString, nowIso } from '../_shared/http.ts';
import { requiredEnv, serviceRoleKey } from '../_shared/env.ts';
import { supabaseAdmin, updateByIdCompatible } from '../_shared/supabase.ts';

async function invokePublish(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${requiredEnv('SUPABASE_URL')}/functions/v1/publish-meta`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey()}`,
      apikey: serviceRoleKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(JSON.stringify(payload).slice(0, 1400));
  return payload as Record<string, unknown>;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const input = await readJson(req);
    const limit = Math.min(asNumber(input.limit, 3), 10);
    const supabase = supabaseAdmin();

    const { data: items, error } = await supabase
      .from('publish_queue')
      .select('*')
      .in('status', ['pending', 'queued', 'waiting', 'retry'])
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .limit(limit);

    if (error) throw error;

    const results: Array<Record<string, unknown>> = [];
    for (const item of (items ?? []) as Array<Record<string, unknown>>) {
      const queueId = String(item.id);
      const postId = asString(item.post_id || item.postId || item.post);
      const platform = asString(item.platform, 'instagram');
      try {
        await updateByIdCompatible('publish_queue', queueId, [
          { status: 'processing', started_at: nowIso(), error: null, updated_at: nowIso() },
          { status: 'processing', updated_at: nowIso() },
        ]);
        const output = await invokePublish({ post_id: postId, platform, queue_id: queueId });
        await updateByIdCompatible('publish_queue', queueId, [
          { status: 'published', output, published_at: nowIso(), finished_at: nowIso(), updated_at: nowIso() },
          { status: 'published', published_at: nowIso(), updated_at: nowIso() },
        ]);
        results.push({ queue_id: queueId, post_id: postId, platform, ok: true, output });
      } catch (error) {
        await updateByIdCompatible('publish_queue', queueId, [
          { status: 'failed', error: error instanceof Error ? error.message : String(error), finished_at: nowIso(), updated_at: nowIso() },
          { status: 'failed', updated_at: nowIso() },
        ]);
        results.push({ queue_id: queueId, post_id: postId, platform, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return json({ ok: true, processed: results.length, results });
  } catch (error) {
    return errorJson('Falha ao processar fila de publicação.', 500, error);
  }
});
