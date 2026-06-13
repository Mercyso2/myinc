-- MYINC Social Media AI v2 — orquestração compute-safe Vercel.
create extension if not exists pgcrypto;

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  post_id uuid null references public.posts(id) on delete cascade,
  user_id uuid null,
  batch_id uuid null,
  type text null,
  job_type text not null default 'content',
  provider text null,
  provider_job_id text null,
  provider_response jsonb null,
  status text not null default 'queued',
  progress int not null default 0,
  priority int not null default 100,
  input_json jsonb null,
  output_json jsonb null,
  result jsonb null,
  error_code text null,
  error_message text null,
  technical_detail text null,
  attempt_count int not null default 0,
  max_attempts int not null default 3,
  locked_at timestamptz null,
  locked_by text null,
  started_at timestamptz null,
  finished_at timestamptz null,
  next_attempt_at timestamptz null,
  retry_requested_at timestamptz null,
  idempotency_key text null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.generation_jobs
  add column if not exists user_id uuid null,
  add column if not exists provider_job_id text null,
  add column if not exists error_code text null,
  add column if not exists provider_response jsonb null,
  add column if not exists retry_requested_at timestamptz null,
  add column if not exists idempotency_key text null,
  add column if not exists archived_at timestamptz null,
  add column if not exists deleted_at timestamptz null;

create table if not exists public.generation_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  event_type text not null,
  message text null,
  detail jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists generation_jobs_queue_idx on public.generation_jobs(status, priority, created_at) where archived_at is null and deleted_at is null;
create index if not exists generation_jobs_post_idx on public.generation_jobs(post_id, created_at desc);
create index if not exists generation_job_events_job_created_idx on public.generation_job_events(job_id, created_at desc);
create unique index if not exists generation_jobs_idempotency_key_uidx on public.generation_jobs(idempotency_key) where idempotency_key is not null and archived_at is null and deleted_at is null;

alter table public.generation_jobs enable row level security;
alter table public.generation_job_events enable row level security;

drop policy if exists generation_jobs_authenticated_all on public.generation_jobs;
create policy generation_jobs_authenticated_all on public.generation_jobs for all to authenticated using (true) with check (true);
drop policy if exists generation_job_events_authenticated_read on public.generation_job_events;
create policy generation_job_events_authenticated_read on public.generation_job_events for select to authenticated using (true);

create or replace function public.claim_generation_job(worker_id text, p_brand_id uuid default null)
returns public.generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.generation_jobs;
begin
  update public.generation_jobs
     set status = 'queued',
         locked_at = null,
         locked_by = null,
         next_attempt_at = now(),
         technical_detail = concat_ws(' | ', technical_detail, 'Lock expirado e liberado automaticamente.'),
         updated_at = now()
   where status = 'processing'
     and locked_at < now() - interval '15 minutes'
     and coalesce(attempt_count, 0) < coalesce(max_attempts, 3)
     and archived_at is null
     and deleted_at is null
     and (p_brand_id is null or brand_id = p_brand_id);

  with next_job as (
    select id
      from public.generation_jobs
     where status in ('queued', 'pending', 'retrying')
       and archived_at is null
       and deleted_at is null
       and coalesce(attempt_count, 0) < coalesce(max_attempts, 3)
       and (next_attempt_at is null or next_attempt_at <= now())
       and (p_brand_id is null or brand_id = p_brand_id)
     order by priority asc nulls last, created_at asc
     for update skip locked
     limit 1
  )
  update public.generation_jobs j
     set status = 'processing',
         locked_at = now(),
         locked_by = worker_id,
         started_at = now(),
         finished_at = null,
         attempt_count = coalesce(j.attempt_count, 0) + 1,
         progress = greatest(coalesce(j.progress, 0), 5),
         updated_at = now()
    from next_job
   where j.id = next_job.id
   returning j.* into claimed;

  return claimed;
end;
$$;

create or replace function public.claim_generation_job(worker_id text)
returns public.generation_jobs
language sql
security definer
set search_path = public
as $$
  select public.claim_generation_job(worker_id, null::uuid);
$$;

revoke all on function public.claim_generation_job(text, uuid) from public, anon, authenticated;
revoke all on function public.claim_generation_job(text) from public, anon, authenticated;
grant execute on function public.claim_generation_job(text, uuid) to service_role;
grant execute on function public.claim_generation_job(text) to service_role;
