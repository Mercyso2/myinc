-- MYINC Social Media AI v2 — compatibilidade segura com banco existente.
-- Esta migration é aditiva e idempotente. Não apaga dados e não substitui policies existentes.
-- Para ambiente isolado usando o MESMO Supabase, configure VITE_DEFAULT_BRAND_ID e WORKER_BRAND_ID.
create extension if not exists pgcrypto;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'MYINC',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.brands (id, name, status)
values ('00000000-0000-0000-0000-000000000001', 'MYINC ISOLADO', 'active')
on conflict (id) do nothing;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid null,
  email text null,
  full_name text null,
  role text not null default 'user',
  brand_id uuid null references public.brands(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_auth_user_id_idx on public.app_users(auth_user_id);
create index if not exists app_users_email_idx on public.app_users(lower(email));

create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  tone text null,
  audience text null,
  positioning text null,
  palette jsonb null,
  typography text null,
  logo_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brand_id)
);

insert into public.brand_profiles (brand_id, tone, audience, positioning, palette, typography)
values (
  '00000000-0000-0000-0000-000000000001',
  'premium, moderno, seguro, elegante e comercial',
  'compradores de imóveis, investidores e famílias que buscam alto padrão',
  'incorporadora brasileira com visual sofisticado e comunicação confiável',
  '{"primary":"#A9798B","dark":"#0e0b10","gold":"#d8b976","offwhite":"#f8f2ed"}'::jsonb,
  'Montserrat / Inter'
)
on conflict (brand_id) do nothing;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  title text not null,
  theme text null,
  objective text null,
  channel text null,
  format text null,
  headline text null,
  caption text null,
  hashtags text[] null,
  cta text null,
  image_prompt text null,
  creative_brief text null,
  master_prompt text null,
  quality_score numeric null,
  quality_review jsonb null,
  carousel_pages jsonb null,
  video_prompt text null,
  media_url text null,
  video_url text null,
  carousel_media_urls text[] null,
  status text not null default 'rascunho',
  status_reason text null,
  error_message text null,
  technical_detail text null,
  batch_id uuid null,
  scheduled_at timestamptz null,
  approved_at timestamptz null,
  published_at timestamptz null,
  published_url text null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.posts
  add column if not exists carousel_pages jsonb null,
  add column if not exists video_prompt text null,
  add column if not exists video_url text null,
  add column if not exists carousel_media_urls text[] null,
  add column if not exists error_message text null,
  add column if not exists technical_detail text null,
  add column if not exists batch_id uuid null,
  add column if not exists archived_at timestamptz null,
  add column if not exists deleted_at timestamptz null;

create index if not exists posts_brand_status_idx on public.posts(brand_id, status);
create index if not exists posts_batch_idx on public.posts(batch_id);

create table if not exists public.post_versions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  version_label text not null,
  caption text null,
  image_prompt text null,
  media_url text null,
  quality_score numeric null,
  output_json jsonb null,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  post_id uuid null references public.posts(id) on delete set null,
  name text not null,
  type text null,
  media_type text null,
  bucket text null,
  path text null,
  url text null,
  public_url text null,
  preview_url text null,
  mime_type text null,
  size_bytes bigint null,
  status text not null default 'ativo',
  tags text[] null,
  origin text null,
  usage_context text null,
  ai_allowed boolean not null default true,
  storage_bucket text null,
  storage_path text null,
  is_final boolean not null default false,
  notes text null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  name text not null,
  notes text null,
  url text null,
  item_type text null,
  ai_usage_rule text null,
  ai_allowed boolean not null default true,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_brain_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  category text not null default 'geral',
  content text not null,
  priority int not null default 100,
  active boolean not null default true,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  name text not null,
  content text not null,
  active boolean not null default true,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_visual_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  rule_type text not null,
  content text not null,
  active boolean not null default true,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  type text null,
  status text not null default 'info',
  friendly_message text null,
  technical_detail text null,
  brand_id uuid null,
  post_id uuid null,
  user_id uuid null,
  created_at timestamptz not null default now()
);

create table if not exists public.runtime_secrets (
  key text primary key,
  value text not null,
  is_secret boolean not null default true,
  updated_by uuid null,
  updated_at timestamptz not null default now()
);

insert into public.runtime_secrets (key, value, is_secret, updated_at) values
  ('OPENAI_TEXT_MODEL','gpt-4.1',false,now()),
  ('OPENAI_IMAGE_MODEL','gpt-image-1',false,now()),
  ('OPENAI_IMAGE_FALLBACK_MODELS','gpt-image-1',false,now()),
  ('OPENAI_IMAGE_QUALITY','high',false,now()),
  ('MEDIA_BUCKET','creative-media',false,now()),
  ('META_GRAPH_VERSION','v23.0',false,now())
on conflict (key) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creative-media', 'creative-media', true, 104857600, array['image/png','image/jpeg','image/webp','video/mp4'])
on conflict (id) do update set public=true, file_size_limit=104857600, allowed_mime_types=array['image/png','image/jpeg','image/webp','video/mp4'];

-- Segurança: esta migration não abre policies amplas no banco existente.
-- Se este for um banco novo e o frontend não conseguir ler/escrever, replique as policies do projeto original ou use service-role via APIs.
