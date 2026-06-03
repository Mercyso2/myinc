-- =========================================================
-- Runtime secrets/config managed by the ADM panel
-- Stores operational keys for Edge Functions to read with service_role.
-- WARNING: this is a pragmatic production shortcut. Keep table locked.
-- =========================================================

create table if not exists public.runtime_secrets (
  key text primary key,
  value text not null,
  is_secret boolean not null default true,
  description text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.runtime_secrets enable row level security;

-- Never expose values through anon/authenticated REST.
revoke all on public.runtime_secrets from anon;
revoke all on public.runtime_secrets from authenticated;

-- service_role keeps full access through Edge Functions.
grant all on public.runtime_secrets to service_role;

create index if not exists runtime_secrets_updated_at_idx
on public.runtime_secrets (updated_at desc);

-- Optional audit log table. Uses existing system_logs when available.
