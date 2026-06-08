alter table if exists public.media_assets
  add column if not exists preview_url text null,
  add column if not exists storage_bucket text null,
  add column if not exists storage_path text null,
  add column if not exists is_final boolean not null default false,
  add column if not exists used_in_publish boolean not null default false;

alter table if exists public.post_versions
  add column if not exists image_prompt text null,
  add column if not exists human_feedback text null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'creative-media',
  'creative-media',
  true,
  52428800,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/quicktime'];
