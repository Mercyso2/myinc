-- MYINC Social Media AI — Media Engine Production Upgrade
-- Geração real de imagem/vídeo, carrossel persistente, revisão de qualidade e publicação Meta sem falso positivo.

alter table if exists public.posts add column if not exists carousel_media_urls text[] not null default '{}';
alter table if exists public.posts add column if not exists video_url text;
alter table if exists public.posts add column if not exists video_poster_url text;
alter table if exists public.posts add column if not exists video_storyboard_urls text[] not null default '{}';
alter table if exists public.posts add column if not exists video_job_id text;
alter table if exists public.posts add column if not exists video_status text;
alter table if exists public.posts add column if not exists video_progress int not null default 0;
alter table if exists public.posts add column if not exists quality_review jsonb default '{}'::jsonb;
alter table if exists public.posts add column if not exists media_generation_meta jsonb default '{}'::jsonb;

alter table if exists public.media_assets add column if not exists generation_model text;
alter table if exists public.media_assets add column if not exists generation_prompt text;
alter table if exists public.media_assets add column if not exists validation_json jsonb default '{}'::jsonb;

alter table if exists public.generation_jobs add column if not exists media_function text;
alter table if exists public.generation_jobs add column if not exists provider_job_id text;
alter table if exists public.generation_jobs add column if not exists progress int not null default 0;

create index if not exists idx_posts_video_job_id on public.posts(video_job_id) where video_job_id is not null;
create index if not exists idx_posts_video_status on public.posts(video_status) where video_status is not null;
create index if not exists idx_media_assets_post_final on public.media_assets(post_id, is_final, used_in_publish);

-- Corrige check de status para permitir simulação local quando a mesma base for usada em homologação.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'posts_status_check'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts drop constraint posts_status_check;
  end if;
  alter table public.posts add constraint posts_status_check check (
    status in ('rascunho', 'tema_aprovado', 'em_producao', 'aguardando_revisao', 'ajuste_solicitado', 'aprovado', 'agendado', 'publicando', 'publicado', 'erro', 'pausado', 'arquivado', 'simulado')
  );
end $$;
