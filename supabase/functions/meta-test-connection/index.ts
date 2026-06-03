import { handleOptions, json, errorJson } from '../_shared/http.ts';
import { env, requiredEnv } from '../_shared/env.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const version = env('META_GRAPH_VERSION', 'v23.0');
    const token = requiredEnv('META_PAGE_ACCESS_TOKEN');
    const pageId = env('META_PAGE_ID');
    const igId = env('META_INSTAGRAM_BUSINESS_ID');

    const checks: Record<string, unknown> = { page_id_configured: Boolean(pageId), instagram_business_id_configured: Boolean(igId) };

    const me = await fetch(`https://graph.facebook.com/${version}/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
    checks.me = await me.json().catch(() => ({}));
    checks.me_ok = me.ok;

    if (pageId) {
      const page = await fetch(`https://graph.facebook.com/${version}/${pageId}?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(token)}`);
      checks.page = await page.json().catch(() => ({}));
      checks.page_ok = page.ok;
    }

    if (igId) {
      const ig = await fetch(`https://graph.facebook.com/${version}/${igId}?fields=id,username,name&access_token=${encodeURIComponent(token)}`);
      checks.instagram = await ig.json().catch(() => ({}));
      checks.instagram_ok = ig.ok;
    }

    return json({ ok: Boolean(checks.me_ok), checks });
  } catch (error) {
    return errorJson('Falha no teste de conexão Meta.', 500, error);
  }
});
