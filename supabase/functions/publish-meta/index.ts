import { handleOptions, json, errorJson, readJson, asString, nowIso } from '../_shared/http.ts';
import { env, envBool, requiredEnv } from '../_shared/env.ts';
import { supabaseAdmin, updateByIdCompatible, insertCompatible } from '../_shared/supabase.ts';
import { getPublicPostMedia } from '../_shared/media.ts';

async function graphPost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const version = env('META_GRAPH_VERSION', 'v23.0');
  const token = requiredEnv('META_PAGE_ACCESS_TOKEN');
  const body = new URLSearchParams({ ...params, access_token: token });
  const response = await fetch(`https://graph.facebook.com/${version}/${path}`, { method: 'POST', body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Meta API ${path} falhou: ${JSON.stringify(data).slice(0, 1600)}`);
  return data as Record<string, unknown>;
}

async function graphGet(path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const version = env('META_GRAPH_VERSION', 'v23.0');
  const token = requiredEnv('META_PAGE_ACCESS_TOKEN');
  const search = new URLSearchParams({ ...params, access_token: token });
  const response = await fetch(`https://graph.facebook.com/${version}/${path}?${search.toString()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Meta API ${path} falhou: ${JSON.stringify(data).slice(0, 1600)}`);
  return data as Record<string, unknown>;
}

async function publishInstagramImage(imageUrl: string, caption: string): Promise<Record<string, unknown>> {
  const igId = requiredEnv('META_INSTAGRAM_BUSINESS_ID');
  const container = await graphPost(`${igId}/media`, { image_url: imageUrl, caption });
  const creationId = String(container.id ?? '');
  if (!creationId) throw new Error('Meta não retornou creation_id para imagem Instagram.');
  return await graphPost(`${igId}/media_publish`, { creation_id: creationId });
}

async function publishInstagramCarousel(imageUrls: string[], caption: string): Promise<Record<string, unknown>> {
  const igId = requiredEnv('META_INSTAGRAM_BUSINESS_ID');
  if (imageUrls.length < 2) return publishInstagramImage(imageUrls[0], caption);

  const children: string[] = [];
  for (const imageUrl of imageUrls.slice(0, 10)) {
    const child = await graphPost(`${igId}/media`, { image_url: imageUrl, is_carousel_item: 'true' });
    if (!child.id) throw new Error('Meta não retornou child id para carrossel.');
    children.push(String(child.id));
  }
  const container = await graphPost(`${igId}/media`, {
    media_type: 'CAROUSEL',
    children: children.join(','),
    caption,
  });
  const creationId = String(container.id ?? '');
  if (!creationId) throw new Error('Meta não retornou creation_id para carrossel Instagram.');
  return await graphPost(`${igId}/media_publish`, { creation_id: creationId });
}

async function publishInstagramReel(videoUrl: string, caption: string): Promise<Record<string, unknown>> {
  const igId = requiredEnv('META_INSTAGRAM_BUSINESS_ID');
  const container = await graphPost(`${igId}/media`, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: 'true',
  });
  const creationId = String(container.id ?? '');
  if (!creationId) throw new Error('Meta não retornou creation_id para Reels.');
  return await graphPost(`${igId}/media_publish`, { creation_id: creationId });
}

async function publishFacebookImage(imageUrl: string, caption: string): Promise<Record<string, unknown>> {
  const pageId = requiredEnv('META_PAGE_ID');
  return await graphPost(`${pageId}/photos`, { url: imageUrl, caption, published: 'true' });
}

async function publishFacebookVideo(videoUrl: string, caption: string): Promise<Record<string, unknown>> {
  const pageId = requiredEnv('META_PAGE_ID');
  return await graphPost(`${pageId}/videos`, { file_url: videoUrl, description: caption, published: 'true' });
}

function isVideoFormat(post: Record<string, unknown>, platform: string): boolean {
  const format = `${post.format ?? post.type ?? post.content_type ?? ''}`.toLowerCase();
  return platform.toLowerCase().includes('reel') || format.includes('reel') || format.includes('video');
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const input = await readJson(req);
    const postId = asString(input.post_id || input.postId);
    const platform = asString(input.platform, 'instagram').toLowerCase();
    const dryRun = input.dry_run === true || input.dryRun === true;

    if (!postId) throw new Error('post_id é obrigatório para publicar.');

    const supabase = supabaseAdmin();
    const { data: post, error } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
    if (error) throw error;
    if (!post) throw new Error(`Post não encontrado: ${postId}`);

    const media = await getPublicPostMedia(post as Record<string, unknown>);
    const caption = asString(input.caption, asString((post as Record<string, unknown>).caption, asString((post as Record<string, unknown>).content, '')));
    const wantsVideo = isVideoFormat(post as Record<string, unknown>, platform);

    if (wantsVideo && !media.videoUrl) {
      throw new Error('Publicação de Reels/vídeo bloqueada: video_url MP4 real não encontrado. Gere vídeo antes de publicar.');
    }
    if (!wantsVideo && !media.imageUrl && media.carouselUrls.length === 0) {
      throw new Error('Publicação bloqueada: nenhuma imagem pública encontrada em media_url/carousel_media_urls.');
    }

    if (dryRun || envBool('META_DRY_RUN', false)) {
      return json({ ok: true, dry_run: true, post_id: postId, platform, media });
    }

    if (envBool('ALLOW_LOCAL_PUBLISH_SIMULATION', false)) {
      return json({ ok: true, simulated: true, warning: 'ALLOW_LOCAL_PUBLISH_SIMULATION=true. Nada foi publicado na Meta.', post_id: postId, platform });
    }

    let result: Record<string, unknown>;
    if (platform.includes('facebook')) {
      result = wantsVideo ? await publishFacebookVideo(media.videoUrl!, caption) : await publishFacebookImage(media.carouselUrls[0] || media.imageUrl!, caption);
    } else if (wantsVideo) {
      result = await publishInstagramReel(media.videoUrl!, caption);
    } else if (media.carouselUrls.length > 1) {
      result = await publishInstagramCarousel(media.carouselUrls, caption);
    } else {
      result = await publishInstagramImage(media.carouselUrls[0] || media.imageUrl!, caption);
    }

    await updateByIdCompatible('posts', postId, [
      { status: 'published', published_at: nowIso(), publish_result: result, updated_at: nowIso() },
      { status: 'published', published_at: nowIso(), updated_at: nowIso() },
    ]);

    await insertCompatible('publish_logs', [
      { id: crypto.randomUUID(), post_id: postId, platform, status: 'published', response: result, created_at: nowIso() },
      { post_id: postId, platform, status: 'published', response: result, created_at: nowIso() },
      { post_id: postId, platform, status: 'published', created_at: nowIso() },
    ]);

    return json({ ok: true, post_id: postId, platform, result });
  } catch (error) {
    return errorJson('Falha ao publicar na Meta.', 500, error);
  }
});
