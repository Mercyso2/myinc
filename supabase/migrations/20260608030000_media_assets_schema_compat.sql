alter table if exists public.media_assets
  add column if not exists type text null,
  add column if not exists bucket text null,
  add column if not exists path text null,
  add column if not exists size_bytes bigint null,
  add column if not exists public_url text null,
  add column if not exists mime_type text null,
  add column if not exists duration_seconds numeric null,
  add column if not exists metadata jsonb null,
  add column if not exists usage_context text null,
  add column if not exists preview_url text null,
  add column if not exists storage_bucket text null,
  add column if not exists storage_path text null,
  add column if not exists is_final boolean not null default false,
  add column if not exists used_in_publish boolean not null default false;

update public.media_assets
set
  type = coalesce(type, media_type),
  bucket = coalesce(bucket, storage_bucket),
  path = coalesce(path, storage_path),
  size_bytes = coalesce(size_bytes, file_size),
  public_url = coalesce(public_url, url)
where type is null
   or bucket is null
   or path is null
   or size_bytes is null
   or public_url is null;

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

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end $$;
