import { handleOptions, json, errorJson } from '../_shared/http.ts';
import { maskedEnv, env } from '../_shared/env.ts';
import { bucketName, supabaseAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const url = new URL(req.url);
    const deep = url.searchParams.get('deep') === '1';
    const requiredSecrets = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
      'OPENAI_TEXT_MODEL',
      'OPENAI_IMAGE_MODEL',
      'META_PAGE_ID',
      'META_INSTAGRAM_BUSINESS_ID',
      'META_PAGE_ACCESS_TOKEN',
      'PUBLIC_MEDIA_BASE_URL',
    ];
    const optionalVideo = ['ENABLE_OPENAI_VIDEO', 'OPENAI_VIDEO_MODEL', 'OPENAI_VIDEO_SIZE', 'OPENAI_VIDEO_SECONDS'];
    const secrets = [...requiredSecrets, ...optionalVideo].map(maskedEnv);
    const missing = secrets.filter((s) => requiredSecrets.includes(s.name) && !s.exists).map((s) => s.name);

    const result: Record<string, unknown> = {
      ok: missing.length === 0,
      missing,
      bucket: bucketName(),
      public_media_base_url: env('PUBLIC_MEDIA_BASE_URL', ''),
      secrets,
      note: 'Valores mascarados; nenhuma chave secreta é retornada.',
    };

    if (deep) {
      const supabase = supabaseAdmin();
      const tables = ['posts', 'generation_jobs', 'media_assets', 'publish_queue', 'publish_logs'];
      const tableChecks: Record<string, unknown> = {};
      for (const table of tables) {
        const { error, count } = await supabase.from(table).select('*', { count: 'exact', head: true });
        tableChecks[table] = error ? { ok: false, error: error.message } : { ok: true, count };
      }
      const { data: bucket, error: bucketError } = await supabase.storage.getBucket(bucketName());
      result.deep = { tables: tableChecks, bucket: bucketError ? { ok: false, error: bucketError.message } : { ok: true, public: bucket?.public } };
    }

    return json(result, missing.length === 0 ? 200 : 500);
  } catch (error) {
    return errorJson('Falha no diagnóstico do motor de mídia.', 500, error);
  }
});
