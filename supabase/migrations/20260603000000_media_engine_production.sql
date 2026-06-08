-- MYINC Media Engine Production
-- Incremental and idempotent schema for the production media pipeline.
-- Safe to run on an existing project: it creates missing tables/columns only.

create extension if not exists pgcrypto;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid null,
  name text not null,
  public_name text null,
  status text not null default 'active',
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid null,
  email text not null unique,
  full_name text null,
  role text not null default 'user',
  brand_id uuid null references public.brands(id) on delete set null,
  status text not null default 'active',
  last_login_at timestamptz null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  site text null,
  instagram text null,
  facebook text null,
  whatsapp text null,
  commercial_email text null,
  region text null,
  niche text null,
  segment text null,
  primary_audience text null,
  secondary_audience text null,
  persona text null,
  problems_solved text null,
  benefits text null,
  differentiators text null,
  products text null,
  services text null,
  average_ticket text null,
  objections text null,
  guarantees text null,
  social_proof text null,
  cases text null,
  testimonials text null,
  faq text null,
  tone text null,
  communication_style text null,
  preferred_words text null,
  forbidden_words text null,
  usual_phrases text null,
  never_use_phrases text null,
  forbidden_promises text null,
  allowed_technical_terms text null,
  avoided_technical_terms text null,
  primary_palette text null,
  secondary_palette text null,
  forbidden_colors text null,
  brand_fonts text null,
  preferred_visual_style text null,
  forbidden_visual_style text null,
  preferred_images text null,
  avoided_images text null,
  logo_rules text null,
  composition_rules text null,
  image_text_rules text null,
  approved_references text null,
  bad_references text null,
  mantra text null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  month int null,
  year int null,
  title text null,
  objective text null,
  strategy text null,
  total_posts int null,
  status text not null default 'draft',
  prompt_used text null,
  ai_response_json jsonb null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_ideas (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  monthly_plan_id uuid null references public.monthly_plans(id) on delete cascade,
  title text not null,
  headline text null,
  short_text text null,
  cta text null,
  visual_idea text null,
  initial_prompt text null,
  prompt_seed text null,
  theme text null,
  objective text null,
  channel text null,
  format text null,
  suggested_at timestamptz null,
  scheduled_at timestamptz null,
  priority int null,
  predicted_score int null,
  status text not null default 'rascunho',
  approved_at timestamptz null,
  notes text null,
  ai_response_json jsonb null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  monthly_plan_id uuid null references public.monthly_plans(id) on delete set null,
  post_idea_id uuid null references public.post_ideas(id) on delete set null,
  source_idea_id uuid null,
  batch_id uuid null,
  current_version_id uuid null,
  title text not null,
  channel text not null default 'Instagram',
  format text null,
  scheduled_at timestamptz null,
  objective text null,
  theme text null,
  headline text null,
  short_text text null,
  caption text null,
  hashtags text[] not null default '{}',
  cta text null,
  image_prompt text null,
  negative_prompt text null,
  video_prompt text null,
  master_prompt text null,
  creative_brief text null,
  media_url text null,
  video_url text null,
  carousel_media_urls text[] not null default '{}',
  video_storyboard_urls text[] not null default '{}',
  quality_score int null,
  quality_review jsonb null,
  status text not null default 'rascunho',
  status_reason text null,
  approved_at timestamptz null,
  published_at timestamptz null,
  meta_container_id text null,
  meta_publish_id text null,
  meta_media_id text null,
  meta_post_id text null,
  meta_permalink text null,
  published_url text null,
  publish_response jsonb null,
  error_message text null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_versions (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  version_label text not null default 'v1',
  caption text null,
  media_url text null,
  output_json jsonb null,
  quality_score int null,
  is_current boolean not null default false,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_current_version_fk'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_current_version_fk
      foreign key (current_version_id) references public.post_versions(id)
      deferrable initially deferred;
  end if;
end $$;

create table if not exists public.content_comments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid null,
  author_name text null,
  comment text null,
  status text not null default 'aberto',
  feedback_for_ai boolean not null default false,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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
  source_url text null,
  public_url text null,
  mime_type text null,
  size_bytes bigint null,
  status text not null default 'ativo',
  tags text[] not null default '{}',
  notes text null,
  origin text null,
  related_campaign_id uuid null,
  campaign text null,
  format text null,
  usage_context text null,
  ai_allowed boolean not null default false,
  ai_usage_rule text null,
  metadata jsonb null,
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  media_asset_id uuid null references public.media_assets(id) on delete set null,
  name text not null,
  type text null,
  media_type text null,
  url text null,
  source_url text null,
  status text not null default 'ativo',
  tags text[] not null default '{}',
  notes text null,
  origin text null,
  related_campaign_id uuid null,
  campaign text null,
  format text null,
  usage_context text null,
  ai_allowed boolean not null default false,
  ai_usage_rule text null,
  forbidden_reason text null,
  metadata jsonb null,
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.publish_queue (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  channel text not null default 'Instagram',
  scheduled_at timestamptz null,
  mode text not null default 'semi_automatico',
  status text not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 3,
  locked_at timestamptz null,
  locked_by text null,
  next_attempt_at timestamptz null,
  last_error text null,
  idempotency_key text null unique,
  meta_response_json jsonb null,
  cancelled_at timestamptz null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.publish_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  post_id uuid null references public.posts(id) on delete set null,
  queue_id uuid null references public.publish_queue(id) on delete set null,
  channel text null,
  status text not null,
  friendly_message text null,
  technical_detail text null,
  meta_container_id text null,
  meta_publish_id text null,
  meta_media_id text null,
  published_url text null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  post_id uuid null references public.posts(id) on delete set null,
  type text null,
  provider text null,
  status text not null default 'queued',
  input_json jsonb null,
  output_json jsonb null,
  error_message text null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  user_id uuid null,
  post_id uuid null references public.posts(id) on delete set null,
  module text not null default 'system',
  type text not null default 'event',
  severity text not null default 'info',
  status text not null default 'info',
  friendly_message text not null default '',
  technical_detail text not null default '',
  archived_at timestamptz null,
  deleted_at timestamptz null,
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
  default_content text null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  note text null,
  content text not null,
  active boolean not null default true,
  version_history text[] not null default '{}',
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.avatar_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  user_id uuid null,
  display_name text not null,
  persona_notes text null,
  provider text null,
  provider_profile_id text null,
  status text not null default 'draft',
  consent_required boolean not null default true,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid null references public.brands(id) on delete cascade,
  user_id uuid null,
  avatar_profile_id uuid null references public.avatar_profiles(id) on delete cascade,
  consent_type text not null default 'avatar_media_use',
  consent_text text not null,
  granted boolean not null default false,
  granted_at timestamptz null,
  revoked_at timestamptz null,
  ip_address text null,
  user_agent text null,
  metadata jsonb null,
  archived_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_posts_brand_status on public.posts(brand_id, status);
create index if not exists idx_posts_scheduled_at on public.posts(scheduled_at);
create index if not exists idx_post_versions_post on public.post_versions(post_id, created_at desc);
create index if not exists idx_media_assets_brand on public.media_assets(brand_id, created_at desc);
create index if not exists idx_library_items_brand_ai on public.library_items(brand_id, ai_allowed, status);
create index if not exists idx_publish_queue_due on public.publish_queue(status, scheduled_at);
create index if not exists idx_system_logs_brand on public.system_logs(brand_id, created_at desc);

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
  array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime'];

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'library',
  'library',
  true,
  52428800,
  array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'application/pdf']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'application/pdf'];

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'brands',
    'app_users',
    'brand_profiles',
    'monthly_plans',
    'post_ideas',
    'posts',
    'post_versions',
    'content_comments',
    'media_assets',
    'library_items',
    'publish_queue',
    'publish_logs',
    'generation_jobs',
    'system_logs',
    'ai_brain_rules',
    'ai_prompt_templates',
    'avatar_profiles',
    'consent_records'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

-- Broad authenticated policies match the current single-tenant app behavior.
-- Service-role Edge Functions bypass RLS for privileged operations.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'brands',
    'app_users',
    'brand_profiles',
    'monthly_plans',
    'post_ideas',
    'posts',
    'post_versions',
    'content_comments',
    'media_assets',
    'library_items',
    'publish_queue',
    'publish_logs',
    'generation_jobs',
    'system_logs',
    'ai_brain_rules',
    'ai_prompt_templates',
    'avatar_profiles',
    'consent_records'
  ]
  loop
    policy_name := table_name || '_authenticated_all';
    execute format('drop policy if exists %I on public.%I', policy_name, table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      policy_name,
      table_name
    );
  end loop;
end $$;
