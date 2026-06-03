-- MYINC Media Engine Edge Compatibility Patch
-- Seguro para rodar em banco existente: somente ADD COLUMN IF NOT EXISTS e criação/ajuste de bucket.

create extension if not exists pgcrypto;

-- POSTS: campos mínimos para imagem, vídeo, carrossel, status e publicação.
alter table if exists public.posts
  add column if not exists caption text,
  add column if not exists content text,
  add column if not exists format text,
  add column if not exists platform text,
  add column if not exists status text default 'draft',
  add column if not exists media_url text,
  add column if not exists video_url text,
  add column if not exists carousel_media_urls jsonb default '[]'::jsonb,
  add column if not exists storyboard jsonb default '[]'::jsonb,
  add column if not exists media_metadata jsonb default '{}'::jsonb,
  add column if not exists quality_score numeric,
  add column if not exists ai_prompt text,
  add column if not exists generation_status text,
  add column if not exists generation_error text,
  add column if not exists publish_result jsonb,
  add column if not exists scheduled_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- GENERATION JOBS: fila de geração compatível com process-production-queue.
alter table if exists public.generation_jobs
  add column if not exists post_id uuid,
  add column if not exists job_type text,
  add column if not exists status text default 'pending',
  add column if not exists input jsonb default '{}'::jsonb,
  add column if not exists output jsonb,
  add column if not exists error text,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists created_at timestamptz default now();

-- MEDIA ASSETS: registro de mídia gerada no Storage.
alter table if exists public.media_assets
  add column if not exists post_id uuid,
  add column if not exists url text,
  add column if not exists public_url text,
  add column if not exists storage_path text,
  add column if not exists media_type text,
  add column if not exists mime_type text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists duration_seconds numeric,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

-- PUBLISH QUEUE: fila de publicação compatível com process-publish-queue.
alter table if exists public.publish_queue
  add column if not exists post_id uuid,
  add column if not exists platform text default 'instagram',
  add column if not exists status text default 'pending',
  add column if not exists scheduled_at timestamptz,
  add column if not exists output jsonb,
  add column if not exists error text,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists created_at timestamptz default now();

-- PUBLISH LOGS: logs de publicação.
alter table if exists public.publish_logs
  add column if not exists post_id uuid,
  add column if not exists platform text,
  add column if not exists status text,
  add column if not exists response jsonb,
  add column if not exists error text,
  add column if not exists created_at timestamptz default now();

-- Índices seguros para filas.
create index if not exists idx_generation_jobs_status_created on public.generation_jobs(status, created_at);
create index if not exists idx_publish_queue_status_scheduled on public.publish_queue(status, scheduled_at);
create index if not exists idx_media_assets_post_id on public.media_assets(post_id);
create index if not exists idx_posts_generation_status on public.posts(generation_status);
create index if not exists idx_posts_status_scheduled on public.posts(status, scheduled_at);

-- Bucket público para mídia gerada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creative-media',
  'creative-media',
  true,
  1073741824,
  array['image/png', 'image/jpeg', 'image/webp', 'video/mp4']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 1073741824,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'video/mp4'];
