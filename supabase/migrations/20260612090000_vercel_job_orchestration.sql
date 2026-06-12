-- Compute-safe orchestration for Vercel: incremental and non-destructive.
create extension if not exists pgcrypto;

alter table if exists public.generation_jobs
  add column if not exists user_id uuid null,
  add column if not exists provider_job_id text null,
  add column if not exists error_code text null,
  add column if not exists provider_response jsonb null,
  add column if not exists retry_requested_at timestamptz null;

create table if not exists public.generation_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  event_type text not null,
  message text null,
  detail jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists generation_job_events_job_created_idx
  on public.generation_job_events(job_id, created_at desc);
create unique index if not exists generation_jobs_idempotency_key_uidx
  on public.generation_jobs(idempotency_key)
  where idempotency_key is not null and archived_at is null and deleted_at is null;

alter table public.generation_job_events enable row level security;
drop policy if exists generation_job_events_authenticated_read on public.generation_job_events;
create policy generation_job_events_authenticated_read on public.generation_job_events
  for select to authenticated using (true);

-- Atomically releases stale jobs and claims exactly one due job.
create or replace function public.claim_generation_job(worker_id text)
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
     and coalesce(attempt_count, 0) < coalesce(max_attempts, 3);

  with next_job as (
    select id
      from public.generation_jobs
     where status in ('queued', 'pending', 'retrying')
       and archived_at is null
       and deleted_at is null
       and coalesce(attempt_count, 0) < coalesce(max_attempts, 3)
       and (next_attempt_at is null or next_attempt_at <= now())
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

revoke all on function public.claim_generation_job(text) from public, anon, authenticated;
grant execute on function public.claim_generation_job(text) to service_role;
