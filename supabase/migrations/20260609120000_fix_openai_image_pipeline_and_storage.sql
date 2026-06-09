-- MYINC hotfix: OpenAI image/text pipeline + creative-media public bucket

alter table if exists public.posts
  add column if not exists carousel_media_urls text[] default '{}',
  add column if not exists current_version_id uuid,
  add column if not exists technical_detail text;

alter table if exists public.post_versions
  add column if not exists brand_id uuid,
  add column if not exists is_current boolean default false;

create index if not exists idx_system_logs_image_rate_limit
  on public.system_logs (post_id, user_id, module, created_at desc)
  where module = 'imagem';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creative-media',
  'creative-media',
  true,
  52428800,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'creative-media public read'
  ) then
    create policy "creative-media public read"
      on storage.objects
      for select
      using (bucket_id = 'creative-media');
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'runtime_secrets'
  ) then
    update public.runtime_secrets set value = 'gpt-5.5' where key = 'OPENAI_TEXT_MODEL';
    if not found then
      insert into public.runtime_secrets (key, value) values ('OPENAI_TEXT_MODEL', 'gpt-5.5');
    end if;

    update public.runtime_secrets set value = 'gpt-image-2' where key = 'OPENAI_IMAGE_MODEL';
    if not found then
      insert into public.runtime_secrets (key, value) values ('OPENAI_IMAGE_MODEL', 'gpt-image-2');
    end if;

    update public.runtime_secrets set value = 'gpt-image-1.5,gpt-image-1,gpt-image-1-mini' where key = 'OPENAI_IMAGE_FALLBACK_MODELS';
    if not found then
      insert into public.runtime_secrets (key, value) values ('OPENAI_IMAGE_FALLBACK_MODELS', 'gpt-image-1.5,gpt-image-1,gpt-image-1-mini');
    end if;

    update public.runtime_secrets set value = 'high' where key = 'OPENAI_IMAGE_QUALITY';
    if not found then
      insert into public.runtime_secrets (key, value) values ('OPENAI_IMAGE_QUALITY', 'high');
    end if;

    update public.runtime_secrets set value = 'png' where key = 'OPENAI_IMAGE_FORMAT';
    if not found then
      insert into public.runtime_secrets (key, value) values ('OPENAI_IMAGE_FORMAT', 'png');
    end if;

    update public.runtime_secrets set value = '1088x1360' where key = 'OPENAI_IMAGE_SIZE_FEED';
    if not found then
      insert into public.runtime_secrets (key, value) values ('OPENAI_IMAGE_SIZE_FEED', '1088x1360');
    end if;
  end if;
end $$;