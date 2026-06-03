-- MYINC Social Media AI — esquema base revisado para Supabase/Postgres.
-- Objetivo: base segura, idempotente e compatível com Supabase Auth.
-- IMPORTANTE:
-- 1) Não usa public.users. Usa public.app_users para não confundir com auth.users.
-- 2) Usa create table if not exists e add column seguro para suportar bancos parcialmente criados.
-- 3) Inclui campos operacionais necessários para planejamento, produção em massa, biblioteca, publicação e logs.
-- 4) Inclui updated_at automático.
-- 5) Inclui RLS básica por brand_id e helper de admin.

create extension if not exists "pgcrypto";

-- =========================================================
-- HELPERS
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select au.id
  from public.app_users au
  where au.auth_user_id = auth.uid()
    and au.status = 'active'
  limit 1;
$$;

create or replace function public.current_app_user_role()
returns text
language sql
stable
as $$
  select coalesce(au.role, 'viewer')
  from public.app_users au
  where au.auth_user_id = auth.uid()
    and au.status = 'active'
  limit 1;
$$;

create or replace function public.current_app_brand_id()
returns uuid
language sql
stable
as $$
  select au.brand_id
  from public.app_users au
  where au.auth_user_id = auth.uid()
    and au.status = 'active'
  limit 1;
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.status = 'active'
      and au.role = 'admin'
  );
$$;

-- =========================================================
-- USUÁRIOS / MARCA
-- =========================================================

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  brand_id uuid,
  email text unique not null,
  full_name text,
  role text not null default 'admin' check (role in ('admin', 'editor', 'aprovador', 'viewer')),
  status text not null default 'active' check (status in ('active', 'inactive', 'invited', 'blocked')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.app_users(id) on delete set null,
  name text not null,
  public_name text,
  slug text unique,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users
  add constraint app_users_brand_id_fkey
  foreign key (brand_id) references public.brands(id) on delete set null;

create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  site text,
  instagram text,
  facebook text,
  whatsapp text,
  commercial_email text,
  region text,
  niche text,
  segment text,
  slogan text,
  primary_audience text,
  secondary_audience text,
  persona text,
  problems_solved text,
  benefits text,
  differentiators text,
  average_ticket text,
  objections text,
  guarantees text,
  social_proof text,
  cases text,
  testimonials text,
  faq text,
  default_cta text,
  brand_mantra text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id)
);

create table if not exists public.brand_color_palette (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  token text not null,
  label text,
  hex text not null,
  usage text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, token)
);

create table if not exists public.brand_voice_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rule_type text not null,
  content text not null,
  priority int not null default 5,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_visual_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  rule_type text not null,
  content text not null,
  priority int not null default 5,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  description text,
  price_range text,
  status text not null default 'active',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_services (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'active',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_references (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  title text not null,
  url text,
  reference_type text,
  usage_rule text,
  ai_allowed boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_forbidden_terms (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  term text not null,
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, term)
);

create table if not exists public.brand_preferred_terms (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  term text not null,
  context text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, term)
);

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  asset_type text not null,
  url text not null,
  storage_bucket text,
  storage_path text,
  tags text[] not null default '{}',
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- PLANEJAMENTO
-- =========================================================

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  objective text,
  start_date date,
  end_date date,
  status text not null default 'active',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  month int not null check (month between 1 and 12),
  year int not null check (year between 2024 and 2100),
  objective text,
  total_posts int not null default 30 check (total_posts > 0 and total_posts <= 120),
  channels jsonb not null default '[]'::jsonb,
  formats_distribution jsonb not null default '{}'::jsonb,
  campaign_distribution jsonb not null default '{}'::jsonb,
  plan_brief jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'generated', 'in_review', 'approved', 'in_production', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, month, year, name)
);

create table if not exists public.custom_campaign_themes (
  id uuid primary key default gen_random_uuid(),
  monthly_plan_id uuid not null references public.monthly_plans(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  theme text not null,
  quantity int not null check (quantity > 0),
  objective text,
  formats jsonb not null default '[]'::jsonb,
  channels jsonb not null default '[]'::jsonb,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_ideas (
  id uuid primary key default gen_random_uuid(),
  monthly_plan_id uuid not null references public.monthly_plans(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  converted_post_id uuid,
  suggested_at timestamptz,
  channel text,
  format text,
  theme text,
  objective text,
  headline text,
  short_text text,
  cta text,
  visual_idea text,
  initial_prompt text,
  predicted_score int check (predicted_score is null or predicted_score between 0 and 100),
  status text not null default 'rascunho' check (status in ('rascunho', 'tema_aprovado', 'reprovado', 'arquivado')),
  approved_at timestamptz,
  rejected_reason text,
  regenerate_count int not null default 0,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- PRODUÇÃO / POSTS
-- =========================================================

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  monthly_plan_id uuid references public.monthly_plans(id) on delete set null,
  source_idea_id uuid references public.post_ideas(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  batch_id uuid,
  title text not null,
  channel text not null,
  format text not null,
  scheduled_at timestamptz,
  scheduled_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references public.app_users(id) on delete set null,
  published_at timestamptz,
  objective text,
  theme text,
  headline text,
  caption text,
  hashtags text[] not null default '{}',
  cta text,
  image_prompt text,
  video_prompt text,
  master_prompt text,
  creative_brief text,
  media_url text,
  current_version_id uuid,
  quality_score int not null default 0 check (quality_score >= 0 and quality_score <= 100),
  status text not null default 'rascunho' check (status in ('rascunho', 'tema_aprovado', 'em_producao', 'aguardando_revisao', 'ajuste_solicitado', 'aprovado', 'agendado', 'publicando', 'publicado', 'erro', 'pausado', 'arquivado')),
  status_reason text,
  meta_publish_id text,
  meta_container_id text,
  meta_post_id text,
  meta_permalink text,
  published_url text,
  error_message text,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_idea_id)
);

alter table public.post_ideas
  add constraint post_ideas_converted_post_id_fkey
  foreign key (converted_post_id) references public.posts(id) on delete set null;

create table if not exists public.post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  version_label text not null,
  version_type text not null default 'content',
  generated_by text default 'ai',
  caption text,
  hashtags text[] not null default '{}',
  cta text,
  image_prompt text,
  video_prompt text,
  media_url text,
  quality_score int check (quality_score is null or quality_score between 0 and 100),
  human_feedback text,
  prompt_snapshot jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  is_current boolean not null default false,
  restored_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.posts
  add constraint posts_current_version_id_fkey
  foreign key (current_version_id) references public.post_versions(id) on delete set null;

create table if not exists public.content_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  version_id uuid references public.post_versions(id) on delete set null,
  user_id uuid references public.app_users(id) on delete set null,
  comment text not null,
  comment_type text not null default 'human_feedback',
  feedback_for_ai boolean not null default true,
  status text not null default 'aberto' check (status in ('aberto', 'resolvido', 'arquivado')),
  resolved_at timestamptz,
  resolved_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- MÍDIA / BIBLIOTECA
-- =========================================================

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  name text not null,
  media_type text not null,
  url text not null,
  preview_url text,
  storage_bucket text,
  storage_path text,
  width int,
  height int,
  duration numeric,
  file_size bigint,
  status text not null default 'ativo' check (status in ('ativo', 'referencia_aprovada', 'referencia_proibida', 'template', 'arquivado')),
  tags text[] not null default '{}',
  notes text,
  origin text,
  ai_allowed boolean not null default false,
  is_final boolean not null default false,
  used_in_publish boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  name text not null,
  item_type text not null,
  url text,
  status text not null default 'ativo' check (status in ('ativo', 'referencia_aprovada', 'referencia_proibida', 'template', 'arquivado')),
  tags text[] not null default '{}',
  notes text,
  campaign text,
  format text,
  ai_usage_rule text,
  asset_role text,
  usage_context text,
  ai_weight int not null default 5 check (ai_weight between 0 and 10),
  source_url text,
  related_campaign_id uuid references public.campaigns(id) on delete set null,
  format_fit text,
  forbidden_reason text,
  ai_allowed boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- FILAS / PUBLICAÇÃO / LOGS
-- =========================================================

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  batch_id uuid,
  job_type text not null default 'full_post_generation',
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed', 'paused', 'cancelled')),
  step text not null default 'waiting',
  attempts int not null default 0,
  max_attempts int not null default 3,
  locked_at timestamptz,
  locked_by text,
  next_attempt_at timestamptz,
  last_error text,
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.publish_queue (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  channel text not null,
  scheduled_at timestamptz,
  mode text not null default 'semi_automatico',
  status text not null default 'queued' check (status in ('queued', 'processing', 'published', 'failed', 'paused', 'cancelled')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  locked_at timestamptz,
  locked_by text,
  next_attempt_at timestamptz,
  last_error text,
  idempotency_key text unique,
  meta_response_json jsonb not null default '{}'::jsonb,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, channel, scheduled_at)
);

create table if not exists public.publish_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  queue_id uuid references public.publish_queue(id) on delete set null,
  channel text,
  status text,
  friendly_message text,
  technical_detail text,
  meta_publish_id text,
  published_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.api_connections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  provider text not null,
  status text not null default 'not_configured',
  last_checked_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, provider)
);

create table if not exists public.admin_settings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  key text not null,
  value text,
  is_sensitive boolean not null default true,
  source text not null default 'env_or_secure_store',
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, key)
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, key)
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  format text,
  structure jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_brain_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  category text not null,
  content text not null,
  active boolean not null default true,
  priority int not null default 5,
  default_content text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  content text not null,
  note text,
  version_history jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_feedbacks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  feedback_type text not null,
  feedback_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  user_id uuid references public.app_users(id) on delete set null,
  type text not null,
  module text not null,
  severity text not null default 'info' check (severity in ('debug', 'info', 'warning', 'error', 'critical')),
  status text not null,
  friendly_message text not null,
  technical_detail text,
  correlation_id text,
  request_id text,
  sanitized boolean not null default true,
  created_at timestamptz not null default now()
);

-- =========================================================
-- ÍNDICES
-- =========================================================

create index if not exists idx_app_users_auth on public.app_users(auth_user_id);
create index if not exists idx_app_users_brand_status on public.app_users(brand_id, status);
create index if not exists idx_brands_status on public.brands(status);
create index if not exists idx_monthly_plans_brand_month on public.monthly_plans(brand_id, year, month);
create index if not exists idx_post_ideas_plan_status on public.post_ideas(monthly_plan_id, status);
create index if not exists idx_posts_brand_status on public.posts(brand_id, status);
create index if not exists idx_posts_scheduled_at on public.posts(scheduled_at);
create index if not exists idx_posts_source_idea on public.posts(source_idea_id);
create index if not exists idx_post_versions_post_current on public.post_versions(post_id, is_current);
create index if not exists idx_media_assets_brand_status on public.media_assets(brand_id, status);
create index if not exists idx_library_items_brand_status on public.library_items(brand_id, status);
create index if not exists idx_generation_jobs_status_time on public.generation_jobs(status, next_attempt_at, created_at);
create index if not exists idx_publish_queue_status_time on public.publish_queue(status, scheduled_at);
create index if not exists idx_system_logs_brand_created on public.system_logs(brand_id, created_at desc);

-- =========================================================
-- TRIGGERS UPDATED_AT
-- =========================================================

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'app_users', 'brands', 'brand_profiles', 'brand_color_palette', 'brand_voice_rules',
    'brand_visual_rules', 'brand_products', 'brand_services', 'brand_references',
    'brand_assets', 'campaigns', 'monthly_plans', 'custom_campaign_themes', 'post_ideas',
    'posts', 'content_comments', 'media_assets', 'library_items', 'generation_jobs',
    'publish_queue', 'api_connections', 'admin_settings', 'settings', 'templates',
    'ai_brain_rules', 'ai_prompt_templates'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', tbl);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', tbl);
  end loop;
end $$;

-- =========================================================
-- SEED MYINC
-- =========================================================

insert into public.brands (name, public_name, slug, status)
values ('MYINC', 'MYINC Incorporadora', 'myinc', 'active')
on conflict (slug) do update set
  public_name = excluded.public_name,
  status = 'active',
  updated_at = now();

insert into public.app_users (email, full_name, role, status, brand_id)
select
  'rodrigo@myinc.local',
  'Rodrigo Carvalho',
  'admin',
  'active',
  b.id
from public.brands b
where b.slug = 'myinc'
on conflict (email) do update set
  full_name = excluded.full_name,
  role = 'admin',
  status = 'active',
  brand_id = excluded.brand_id,
  updated_at = now();

update public.brands b
set owner_id = au.id,
    updated_at = now()
from public.app_users au
where b.slug = 'myinc'
  and au.email = 'rodrigo@myinc.local'
  and b.owner_id is distinct from au.id;

insert into public.brand_profiles (
  brand_id,
  site,
  instagram,
  facebook,
  region,
  niche,
  segment,
  slogan,
  primary_audience,
  secondary_audience,
  persona,
  problems_solved,
  benefits,
  differentiators,
  objections,
  social_proof,
  faq,
  default_cta,
  brand_mantra
)
select
  b.id,
  'https://myinc.com.br',
  '@myinc',
  'MYINC',
  'Brasil',
  'Incorporadora e construtora premium',
  'Empreendimentos imobiliários de alto padrão',
  'Arquitetura, sofisticação e qualidade de vida.',
  'Famílias, investidores e compradores que buscam imóveis de alto padrão.',
  'Pessoas interessadas em arquitetura, localização estratégica, segurança e valorização patrimonial.',
  'Cliente exigente, visual, racional e sensível a confiança, acabamento, localização e reputação.',
  'Reduz insegurança na compra, transmite confiança, valoriza arquitetura e mostra diferenciais reais.',
  'Sofisticação, localização estratégica, funcionalidade, design, qualidade construtiva e proximidade.',
  'Arquitetura premium, atendimento próximo, padrão visual elegante e foco em experiência do cliente.',
  'Medo de comprar errado, dúvida sobre valorização, acabamento, entrega, localização e confiança.',
  'Comunicação institucional premium, empreendimentos, obras, renders, provas visuais e relacionamento.',
  'Responder dúvidas sobre empreendimentos, obras, diferenciais, localização, investimento e atendimento.',
  'Fale com a equipe MYINC e conheça o empreendimento ideal para você.',
  'Você é o núcleo de inteligência criativa da MYINC, uma incorporadora/construtora premium. Aja como estrategista de social media, copywriter, diretor de arte e revisor de qualidade para conteúdo imobiliário de alto padrão. Preserve sofisticação, clareza, confiança, arquitetura, funcionalidade, inovação, qualidade de vida, localização estratégica, design e proximidade com o cliente. Nunca gere conteúdo genérico, infantil, exagerado, poluído visualmente ou com promessas impossíveis.'
from public.brands b
where b.slug = 'myinc'
on conflict (brand_id) do update set
  site = excluded.site,
  instagram = excluded.instagram,
  facebook = excluded.facebook,
  region = excluded.region,
  niche = excluded.niche,
  segment = excluded.segment,
  slogan = excluded.slogan,
  primary_audience = excluded.primary_audience,
  secondary_audience = excluded.secondary_audience,
  persona = excluded.persona,
  problems_solved = excluded.problems_solved,
  benefits = excluded.benefits,
  differentiators = excluded.differentiators,
  objections = excluded.objections,
  social_proof = excluded.social_proof,
  faq = excluded.faq,
  default_cta = excluded.default_cta,
  brand_mantra = excluded.brand_mantra,
  updated_at = now();

insert into public.brand_color_palette (brand_id, token, label, hex, usage)
select b.id, v.token, v.label, v.hex, v.usage
from public.brands b
cross join (values
  ('primary', 'Laranja/cobre MYINC', '#f58220', 'CTAs, destaques e gradientes'),
  ('background_dark', 'Grafite premium', '#0d0a08', 'Fundo principal dark'),
  ('surface_dark', 'Marrom/grafite de card', '#1c1511', 'Cards e painéis'),
  ('background_light', 'Off-white', '#f7f3ed', 'Fundo light'),
  ('text_dark', 'Texto claro', '#fffaf4', 'Texto no tema escuro'),
  ('muted', 'Texto secundário', '#a79b91', 'Descrições e legendas')
) as v(token, label, hex, usage)
where b.slug = 'myinc'
on conflict (brand_id, token) do update set
  label = excluded.label,
  hex = excluded.hex,
  usage = excluded.usage,
  active = true,
  updated_at = now();

insert into public.ai_brain_rules (brand_id, name, category, content, active, priority)
select b.id, v.name, v.category, v.content, true, v.priority
from public.brands b
cross join (values
  ('Mantra MYINC', 'estrategia', 'Agir sempre como social media premium especializado em incorporadoras, construção, arquitetura e mercado imobiliário de alto padrão.', 10),
  ('Tom de voz', 'copy', 'Comunicação sofisticada, objetiva, elegante, confiante e próxima. Evitar exagero, clichê, sensacionalismo e promessas impossíveis.', 9),
  ('Direção de arte', 'visual', 'Criativos devem transmitir arquitetura premium, luz natural, composição limpa, materiais nobres, pouco texto e aparência de agência.', 9),
  ('CTA padrão', 'publicacao', 'Usar CTA claro, elegante e comercial: conheça, fale com a equipe, descubra o empreendimento ou agende uma conversa.', 8),
  ('Proibido genérico', 'negativo', 'Nunca entregar conteúdo genérico, infantil, poluído, com texto demais na arte ou imagem com aparência amadora.', 10)
) as v(name, category, content, priority)
where b.slug = 'myinc'
on conflict do nothing;

insert into public.system_logs (brand_id, type, module, severity, status, friendly_message, technical_detail)
select b.id, 'migration', 'database', 'info', 'ok', 'Schema base revisado aplicado com sucesso.', 'Migration MYINC base revisada criou/atualizou tabelas, índices, triggers e seed inicial.'
from public.brands b
where b.slug = 'myinc';

-- =========================================================
-- RLS BÁSICO
-- =========================================================

alter table public.app_users enable row level security;
alter table public.brands enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.brand_color_palette enable row level security;
alter table public.brand_voice_rules enable row level security;
alter table public.brand_visual_rules enable row level security;
alter table public.brand_products enable row level security;
alter table public.brand_services enable row level security;
alter table public.brand_references enable row level security;
alter table public.brand_forbidden_terms enable row level security;
alter table public.brand_preferred_terms enable row level security;
alter table public.brand_assets enable row level security;
alter table public.campaigns enable row level security;
alter table public.monthly_plans enable row level security;
alter table public.custom_campaign_themes enable row level security;
alter table public.post_ideas enable row level security;
alter table public.posts enable row level security;
alter table public.post_versions enable row level security;
alter table public.content_comments enable row level security;
alter table public.media_assets enable row level security;
alter table public.library_items enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.publish_queue enable row level security;
alter table public.publish_logs enable row level security;
alter table public.api_connections enable row level security;
alter table public.admin_settings enable row level security;
alter table public.settings enable row level security;
alter table public.templates enable row level security;
alter table public.ai_brain_rules enable row level security;
alter table public.ai_prompt_templates enable row level security;
alter table public.ai_feedbacks enable row level security;
alter table public.system_logs enable row level security;

-- Políticas simples e seguras. Service role ignora RLS nas Edge Functions.
-- Usuários autenticados acessam somente sua brand. Admin da brand pode escrever.

do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('brands', 'id'),
      ('brand_profiles', 'brand_id'),
      ('brand_color_palette', 'brand_id'),
      ('brand_voice_rules', 'brand_id'),
      ('brand_visual_rules', 'brand_id'),
      ('brand_products', 'brand_id'),
      ('brand_services', 'brand_id'),
      ('brand_references', 'brand_id'),
      ('brand_forbidden_terms', 'brand_id'),
      ('brand_preferred_terms', 'brand_id'),
      ('brand_assets', 'brand_id'),
      ('campaigns', 'brand_id'),
      ('monthly_plans', 'brand_id'),
      ('custom_campaign_themes', 'brand_id'),
      ('post_ideas', 'brand_id'),
      ('posts', 'brand_id'),
      ('media_assets', 'brand_id'),
      ('library_items', 'brand_id'),
      ('generation_jobs', 'brand_id'),
      ('publish_queue', 'brand_id'),
      ('publish_logs', 'brand_id'),
      ('api_connections', 'brand_id'),
      ('admin_settings', 'brand_id'),
      ('settings', 'brand_id'),
      ('templates', 'brand_id'),
      ('ai_brain_rules', 'brand_id'),
      ('ai_prompt_templates', 'brand_id'),
      ('ai_feedbacks', 'brand_id'),
      ('system_logs', 'brand_id')
    ) as t(table_name, brand_column)
  loop
    execute format('drop policy if exists %I on public.%I', rec.table_name || '_select_brand', rec.table_name);
    execute format('drop policy if exists %I on public.%I', rec.table_name || '_insert_admin', rec.table_name);
    execute format('drop policy if exists %I on public.%I', rec.table_name || '_update_admin', rec.table_name);
    execute format('drop policy if exists %I on public.%I', rec.table_name || '_delete_admin', rec.table_name);

    execute format(
      'create policy %I on public.%I for select using (%I = public.current_app_brand_id() or public.is_app_admin())',
      rec.table_name || '_select_brand', rec.table_name, rec.brand_column
    );
    execute format(
      'create policy %I on public.%I for insert with check (%I = public.current_app_brand_id() or public.is_app_admin())',
      rec.table_name || '_insert_admin', rec.table_name, rec.brand_column
    );
    execute format(
      'create policy %I on public.%I for update using (%I = public.current_app_brand_id() or public.is_app_admin()) with check (%I = public.current_app_brand_id() or public.is_app_admin())',
      rec.table_name || '_update_admin', rec.table_name, rec.brand_column, rec.brand_column
    );
    execute format(
      'create policy %I on public.%I for delete using (public.is_app_admin())',
      rec.table_name || '_delete_admin', rec.table_name
    );
  end loop;
end $$;

-- app_users tem regra própria.
drop policy if exists app_users_select_own_or_admin on public.app_users;
drop policy if exists app_users_insert_admin on public.app_users;
drop policy if exists app_users_update_admin on public.app_users;
drop policy if exists app_users_delete_admin on public.app_users;

create policy app_users_select_own_or_admin
on public.app_users
for select
using (auth_user_id = auth.uid() or brand_id = public.current_app_brand_id() or public.is_app_admin());

create policy app_users_insert_admin
on public.app_users
for insert
with check (public.is_app_admin() or auth.uid() is null);

create policy app_users_update_admin
on public.app_users
for update
using (public.is_app_admin())
with check (public.is_app_admin());

create policy app_users_delete_admin
on public.app_users
for delete
using (public.is_app_admin());

-- Tabelas dependentes sem brand_id direto.
drop policy if exists post_versions_select_brand on public.post_versions;
drop policy if exists post_versions_write_brand on public.post_versions;
create policy post_versions_select_brand
on public.post_versions
for select
using (
  exists (
    select 1 from public.posts p
    where p.id = post_versions.post_id
      and (p.brand_id = public.current_app_brand_id() or public.is_app_admin())
  )
);
create policy post_versions_write_brand
on public.post_versions
for all
using (
  exists (
    select 1 from public.posts p
    where p.id = post_versions.post_id
      and (p.brand_id = public.current_app_brand_id() or public.is_app_admin())
  )
)
with check (
  exists (
    select 1 from public.posts p
    where p.id = post_versions.post_id
      and (p.brand_id = public.current_app_brand_id() or public.is_app_admin())
  )
);

drop policy if exists content_comments_select_brand on public.content_comments;
drop policy if exists content_comments_write_brand on public.content_comments;
create policy content_comments_select_brand
on public.content_comments
for select
using (
  exists (
    select 1 from public.posts p
    where p.id = content_comments.post_id
      and (p.brand_id = public.current_app_brand_id() or public.is_app_admin())
  )
);
create policy content_comments_write_brand
on public.content_comments
for all
using (
  exists (
    select 1 from public.posts p
    where p.id = content_comments.post_id
      and (p.brand_id = public.current_app_brand_id() or public.is_app_admin())
  )
)
with check (
  exists (
    select 1 from public.posts p
    where p.id = content_comments.post_id
      and (p.brand_id = public.current_app_brand_id() or public.is_app_admin())
  )
);
