-- MYINC Social Media AI
-- Atualização blindada: fila assíncrona para feed, carrossel e vídeo.
-- Execute no Supabase SQL Editor ou via: supabase db push

create extension if not exists pgcrypto;

-- Campos usados pela pipeline atual/worker sem quebrar tabelas existentes.
alter table if exists posts add column if not exists current_version_id uuid null;
alter table if exists posts add column if not exists technical_detail text null;
alter table if exists posts add column if not exists carousel_media_urls text[] null default '{}';
alter table if exists posts add column if not exists video_url text null;
alter table if exists posts add column if not exists video_job_id text null;
alter table if exists posts add column if not exists video_status text null;
alter table if exists posts add column if not exists video_progress integer null default 0;
alter table if exists posts add column if not exists video_poster_url text null;

alter table if exists post_versions add column if not exists image_prompt text null;
alter table if exists post_versions add column if not exists human_feedback text null;
alter table if exists post_versions add column if not exists media_url text null;
alter table if exists post_versions add column if not exists output_json jsonb null default '{}'::jsonb;
alter table if exists post_versions add column if not exists is_current boolean null default false;

alter table if exists media_assets add column if not exists preview_url text null;
alter table if exists media_assets add column if not exists public_url text null;
alter table if exists media_assets add column if not exists storage_bucket text null;
alter table if exists media_assets add column if not exists storage_path text null;
alter table if exists media_assets add column if not exists is_final boolean null default false;
alter table if exists media_assets add column if not exists used_in_publish boolean null default false;
alter table if exists media_assets add column if not exists metadata jsonb null default '{}'::jsonb;

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null,
  post_id uuid null,
  parent_job_id uuid null references generation_jobs(id) on delete cascade,
  job_type text not null default 'image',
  type text null,
  provider text null,
  status text not null default 'pending',
  priority integer not null default 100,
  progress integer not null default 0,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  payload jsonb not null default '{}'::jsonb,
  input_json jsonb not null default '{}'::jsonb,
  result jsonb null,
  output_json jsonb null,
  error_message text null,
  technical_detail text null,
  locked_at timestamptz null,
  locked_by text null,
  started_at timestamptz null,
  finished_at timestamptz null,
  next_attempt_at timestamptz null,
  idempotency_key text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists generation_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references generation_jobs(id) on delete cascade,
  event_type text not null,
  message text null,
  detail jsonb null,
  created_at timestamptz not null default now()
);

create table if not exists generation_job_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references generation_jobs(id) on delete cascade,
  media_asset_id uuid null,
  asset_type text not null,
  page_number integer null,
  storage_path text null,
  public_url text null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists generation_jobs_status_idx on generation_jobs(status, priority, created_at);
create index if not exists generation_jobs_post_idx on generation_jobs(post_id, created_at desc);
create index if not exists generation_jobs_parent_idx on generation_jobs(parent_job_id, status);
create index if not exists generation_job_events_job_idx on generation_job_events(job_id, created_at desc);
create index if not exists generation_job_assets_job_idx on generation_job_assets(job_id, page_number);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists generation_jobs_set_updated_at on generation_jobs;
create trigger generation_jobs_set_updated_at
before update on generation_jobs
for each row execute function set_updated_at();

-- Função atômica para o worker pegar 1 job por vez sem duplicidade.
create or replace function claim_generation_job(worker_id text)
returns generation_jobs
language plpgsql
security definer
as $$
declare
  claimed generation_jobs;
begin
  with next_job as (
    select id
    from generation_jobs
    where status in ('pending', 'retrying')
      and (next_attempt_at is null or next_attempt_at <= now())
    order by priority asc, created_at asc
    for update skip locked
    limit 1
  )
  update generation_jobs j
     set status = 'processing',
         locked_at = now(),
         locked_by = worker_id,
         started_at = coalesce(j.started_at, now()),
         attempt_count = coalesce(j.attempt_count, 0) + 1,
         progress = greatest(coalesce(j.progress, 0), 5),
         updated_at = now()
    from next_job
   where j.id = next_job.id
   returning j.* into claimed;

  return claimed;
end;
$$;

-- Bucket público para preview/publicação.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creative-media',
  'creative-media',
  true,
  104857600,
  array['image/png','image/jpeg','image/webp','video/mp4','video/webm','application/octet-stream']
)
on conflict (id) do update
  set public = true,
      file_size_limit = greatest(coalesce(storage.buckets.file_size_limit, 0), 104857600),
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "creative media public read" on storage.objects;
create policy "creative media public read"
on storage.objects for select
using (bucket_id = 'creative-media');

drop policy if exists "creative media service write" on storage.objects;
create policy "creative media service write"
on storage.objects for all
using (bucket_id = 'creative-media')
with check (bucket_id = 'creative-media');
