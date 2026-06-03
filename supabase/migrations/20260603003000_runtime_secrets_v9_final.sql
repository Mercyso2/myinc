-- =========================================================
-- MYINC V9 FINAL - runtime_secrets + RLS direto para painel
-- Resolve: painel não salva credenciais / Failed to fetch / Edge CORS.
-- Este SQL é idempotente: pode rodar mais de uma vez.
-- =========================================================

create extension if not exists pgcrypto;

create table if not exists public.runtime_secrets (
  key text primary key,
  value text not null,
  is_secret boolean not null default true,
  updated_by uuid null,
  updated_at timestamptz not null default now()
);

alter table public.runtime_secrets enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.runtime_secrets to authenticated;

-- Remove policies antigas para evitar conflito.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'runtime_secrets'
  loop
    execute format('drop policy if exists %I on public.runtime_secrets', p.policyname);
  end loop;
end $$;

-- ATALHO DE PRODUÇÃO: qualquer usuário autenticado salva configurações.
-- Depois que estiver estável, você pode restringir para admin.
create policy runtime_secrets_select_authenticated
on public.runtime_secrets
for select
to authenticated
using (true);

create policy runtime_secrets_insert_authenticated
on public.runtime_secrets
for insert
to authenticated
with check (true);

create policy runtime_secrets_update_authenticated
on public.runtime_secrets
for update
to authenticated
using (true)
with check (true);

create policy runtime_secrets_delete_authenticated
on public.runtime_secrets
for delete
to authenticated
using (true);

-- Bucket público para imagens/vídeos acessíveis pela Meta.
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
  104857600,
  array['image/png', 'image/jpeg', 'image/webp', 'video/mp4']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'video/mp4'];

-- Policies simples para leitura pública do bucket e escrita por usuários autenticados.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'creative_media_%'
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;

create policy creative_media_public_read
on storage.objects
for select
to public
using (bucket_id = 'creative-media');

create policy creative_media_authenticated_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'creative-media');

create policy creative_media_authenticated_update
on storage.objects
for update
to authenticated
using (bucket_id = 'creative-media')
with check (bucket_id = 'creative-media');

create policy creative_media_authenticated_delete
on storage.objects
for delete
to authenticated
using (bucket_id = 'creative-media');

-- Chaves base não secretas para o painel já reconhecer defaults.
insert into public.runtime_secrets (key, value, is_secret, updated_at)
values
  ('OPENAI_TEXT_MODEL', 'gpt-4.1-mini', false, now()),
  ('OPENAI_IMAGE_MODEL', 'gpt-image-2', false, now()),
  ('OPENAI_IMAGE_QUALITY', 'high', false, now()),
  ('ENABLE_OPENAI_VIDEO', 'true', false, now()),
  ('OPENAI_VIDEO_MODEL', 'sora-2-pro', false, now()),
  ('OPENAI_VIDEO_SIZE', '1080x1920', false, now()),
  ('OPENAI_VIDEO_SECONDS', '8', false, now()),
  ('MEDIA_BUCKET', 'creative-media', false, now()),
  ('PUBLIC_MEDIA_BASE_URL', 'https://wsikywlyvtkrtejddymy.supabase.co/storage/v1/object/public/creative-media', false, now()),
  ('DEFAULT_TIMEZONE', 'America/Sao_Paulo', false, now()),
  ('ALLOW_LOCAL_PUBLISH_SIMULATION', 'false', false, now())
on conflict (key) do update set
  value = excluded.value,
  is_secret = excluded.is_secret,
  updated_at = now();

select key, is_secret, updated_at
from public.runtime_secrets
order by key;
