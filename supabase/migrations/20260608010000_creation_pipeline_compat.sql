do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'brand_profiles',
    'ai_brain_rules',
    'ai_prompt_templates',
    'library_items',
    'media_assets',
    'posts',
    'post_versions',
    'post_ideas'
  ]
  loop
    execute format('alter table if exists public.%I add column if not exists archived_at timestamptz null', table_name);
    execute format('alter table if exists public.%I add column if not exists deleted_at timestamptz null', table_name);
    execute format('alter table if exists public.%I add column if not exists updated_at timestamptz null default now()', table_name);
  end loop;
end $$;

alter table if exists public.brand_profiles
  add column if not exists forbidden_phrases text null,
  add column if not exists never_use_phrases text null;

alter table if exists public.posts
  add column if not exists video_job_id text null,
  add column if not exists video_status text null,
  add column if not exists video_progress int null,
  add column if not exists video_poster_url text null,
  add column if not exists video_url text null,
  add column if not exists video_storyboard_urls text[] not null default '{}',
  add column if not exists carousel_media_urls text[] not null default '{}';

alter table if exists public.library_items
  add column if not exists preview_url text null,
  add column if not exists storage_bucket text null,
  add column if not exists storage_path text null;
