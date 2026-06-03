import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { env, requiredEnv, serviceRoleKey } from './env.ts';

export function supabaseAdmin(): SupabaseClient {
  return createClient(requiredEnv('SUPABASE_URL'), serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bucketName(): string {
  return env('MEDIA_BUCKET', env('SUPABASE_STORAGE_BUCKET', 'creative-media'));
}

export async function updateByIdCompatible(
  table: string,
  id: string,
  payloads: Array<Record<string, unknown>>,
): Promise<{ ok: boolean; error?: unknown }> {
  const supabase = supabaseAdmin();
  for (const payload of payloads) {
    const { error } = await supabase.from(table).update(payload).eq('id', id);
    if (!error) return { ok: true };
  }
  return { ok: false, error: `Não foi possível atualizar ${table}.${id}` };
}

export async function insertCompatible(
  table: string,
  payloads: Array<Record<string, unknown>>,
): Promise<{ ok: boolean; data?: unknown; error?: unknown }> {
  const supabase = supabaseAdmin();
  for (const payload of payloads) {
    const { data, error } = await supabase.from(table).insert(payload).select('*').maybeSingle();
    if (!error) return { ok: true, data };
  }
  return { ok: false, error: `Não foi possível inserir em ${table}` };
}

export async function maybeGetPost(postId?: string): Promise<Record<string, unknown> | null> {
  if (!postId) return null;
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
  if (error) return null;
  return data as Record<string, unknown> | null;
}
