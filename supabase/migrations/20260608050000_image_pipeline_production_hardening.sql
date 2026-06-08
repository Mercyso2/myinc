-- Production hardening for the real OpenAI -> Storage -> post pipeline.
alter table if exists public.posts
  add column if not exists carousel_media_urls text[] not null default '{}',
  add column if not exists error_message text null,
  add column if not exists current_version_id uuid null;

alter table if exists public.post_versions
  add column if not exists brand_id uuid null references public.brands(id) on delete cascade,
  add column if not exists media_url text null,
  add column if not exists output_json jsonb null,
  add column if not exists is_current boolean not null default false,
  add column if not exists human_feedback text null;

alter table if exists public.system_logs
  add column if not exists user_id uuid null,
  add column if not exists post_id uuid null references public.posts(id) on delete set null,
  add column if not exists technical_detail text not null default '';

create index if not exists idx_system_logs_image_rate_limit
  on public.system_logs(user_id, post_id, module, created_at desc);
create index if not exists idx_post_versions_current
  on public.post_versions(post_id, is_current, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creative-media', 'creative-media', true, 104857600, array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "creative_media_public_read" on storage.objects;
create policy "creative_media_public_read" on storage.objects for select to public
using (bucket_id = 'creative-media');

-- Upload/update/delete remain authenticated; Edge Functions use service role and bypass RLS.
drop policy if exists "creative_media_authenticated_insert" on storage.objects;
create policy "creative_media_authenticated_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'creative-media');

do $$ begin perform pg_notify('pgrst', 'reload schema'); end $$;
