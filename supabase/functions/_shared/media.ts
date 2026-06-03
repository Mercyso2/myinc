import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { bucketName, insertCompatible, supabaseAdmin, updateByIdCompatible } from './supabase.ts';
import { nowIso } from './http.ts';

export type MediaKind = 'image' | 'video' | 'carousel' | 'audio' | 'other';

export function slugPart(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'media';
}

export function detectMime(bytes: Uint8Array): { mime: string; ext: string; valid: boolean } {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: 'image/png', ext: 'png', valid: true };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg', valid: true };
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { mime: 'image/webp', ext: 'webp', valid: true };
  }
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return { mime: 'video/mp4', ext: 'mp4', valid: true };
  }
  return { mime: 'application/octet-stream', ext: 'bin', valid: false };
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.split(',').pop()! : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function ensurePublicBucket(): Promise<void> {
  const supabase = supabaseAdmin();
  const bucket = bucketName();
  const { data } = await supabase.storage.getBucket(bucket);
  if (!data) {
    await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: 1024 * 1024 * 1024,
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'video/mp4'],
    });
  }
}

export async function uploadMediaBytes(params: {
  postId?: string;
  title?: string;
  bytes: Uint8Array;
  kind: MediaKind;
  preferredExt?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ url: string; path: string; mime: string; ext: string }> {
  await ensurePublicBucket();
  const supabase = supabaseAdmin();
  const detected = detectMime(params.bytes);
  const mime = params.contentType || detected.mime;
  const ext = params.preferredExt || detected.ext;

  if (!detected.valid && !params.contentType) {
    throw new Error('Mídia inválida: assinatura de arquivo não reconhecida. Não vou salvar placeholder falso.');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = slugPart(params.title || params.postId || 'myinc-media');
  const path = `${params.kind}/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${name}-${stamp}-${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucketName()).upload(path, new Blob([params.bytes], { type: mime }), {
    upsert: false,
    contentType: mime,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucketName()).getPublicUrl(path);
  const url = data.publicUrl;

  await insertCompatible('media_assets', [
    {
      id: crypto.randomUUID(),
      post_id: params.postId ?? null,
      url,
      public_url: url,
      storage_path: path,
      media_type: params.kind,
      mime_type: mime,
      metadata: params.metadata ?? {},
      created_at: nowIso(),
    },
    {
      post_id: params.postId ?? null,
      url,
      storage_path: path,
      media_type: params.kind,
      mime_type: mime,
      created_at: nowIso(),
    },
    {
      url,
      type: params.kind,
      created_at: nowIso(),
    },
  ]);

  return { url, path, mime, ext };
}

export async function updatePostAfterMedia(params: {
  postId?: string;
  kind: MediaKind;
  url: string;
  metadata?: Record<string, unknown>;
  videoUrl?: string;
  carouselUrls?: string[];
}): Promise<void> {
  if (!params.postId) return;
  const isVideo = params.kind === 'video';
  const payload: Record<string, unknown> = {
    generation_status: 'completed',
    status: 'ready_for_review',
    media_url: isVideo ? null : params.url,
    video_url: isVideo ? params.url : params.videoUrl ?? null,
    media_metadata: params.metadata ?? {},
    updated_at: nowIso(),
  };
  if (params.carouselUrls?.length) payload.carousel_media_urls = params.carouselUrls;

  await updateByIdCompatible('posts', params.postId, [
    payload,
    {
      status: 'ready_for_review',
      media_url: isVideo ? params.videoUrl ?? params.url : params.url,
      updated_at: nowIso(),
    },
    {
      media_url: isVideo ? params.videoUrl ?? params.url : params.url,
      updated_at: nowIso(),
    },
  ]);
}

export async function getPublicPostMedia(post: Record<string, unknown>): Promise<{ imageUrl?: string; videoUrl?: string; carouselUrls: string[] }> {
  const carousel = Array.isArray(post.carousel_media_urls) ? post.carousel_media_urls.filter((x) => typeof x === 'string') as string[] : [];
  return {
    imageUrl: typeof post.media_url === 'string' ? post.media_url : undefined,
    videoUrl: typeof post.video_url === 'string' ? post.video_url : undefined,
    carouselUrls: carousel,
  };
}
