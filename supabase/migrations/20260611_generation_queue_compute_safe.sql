-- MYINC V12 - fila compute-safe para Supabase Edge Functions
-- Objetivo: permitir processamento de 1 tarefa por chamada sem estourar limite de compute.

alter table if exists public.generation_jobs
  add column if not exists batch_id text,
  add column if not exists priority integer default 50,
  add column if not exists progress integer default 0,
  add column if not exists attempt_count integer default 0,
  add column if not exists max_attempts integer default 3,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists job_type text,
  add column if not exists input_json jsonb default '{}'::jsonb,
  add column if not exists output_json jsonb default '{}'::jsonb,
  add column if not exists result jsonb default '{}'::jsonb,
  add column if not exists error_message text,
  add column if not exists technical_detail text;

update public.generation_jobs
set job_type = coalesce(job_type, type)
where job_type is null;

create index if not exists idx_generation_jobs_queue_pick
  on public.generation_jobs (status, priority, created_at)
  where status = 'queued';

create index if not exists idx_generation_jobs_batch_status
  on public.generation_jobs (batch_id, status, priority, created_at);

create index if not exists idx_generation_jobs_post_status
  on public.generation_jobs (post_id, status, created_at);

alter table if exists public.posts
  add column if not exists batch_id text;

create index if not exists idx_posts_batch_id
  on public.posts (batch_id);
