-- MYINC Social Media AI — reconstrução operacional 10/10.
-- Complementa a base atual com ciclo de vida completo, filas, seed MYINC, RLS e idempotência.

create extension if not exists "pgcrypto";

-- Roles e usuários
alter table if exists app_users add column if not exists last_login_at timestamptz;
alter table if exists app_users alter column role set default 'editor';

-- Marca e memória profunda
alter table if exists brand_profiles add column if not exists tone text;
alter table if exists brand_profiles add column if not exists communication_style text;
alter table if exists brand_profiles add column if not exists products text;
alter table if exists brand_profiles add column if not exists services text;
alter table if exists brand_profiles add column if not exists primary_palette text;
alter table if exists brand_profiles add column if not exists secondary_palette text;
alter table if exists brand_profiles add column if not exists forbidden_colors text;
alter table if exists brand_profiles add column if not exists brand_fonts text;
alter table if exists brand_profiles add column if not exists preferred_visual_style text;
alter table if exists brand_profiles add column if not exists forbidden_visual_style text;
alter table if exists brand_profiles add column if not exists logo_rules text;
alter table if exists brand_profiles add column if not exists composition_rules text;
alter table if exists brand_profiles add column if not exists image_text_rules text;
alter table if exists brand_profiles add column if not exists approved_references text;
alter table if exists brand_profiles add column if not exists bad_references text;
alter table if exists brand_profiles add column if not exists mantra text;

create table if not exists brand_color_palette (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  token text not null,
  label text not null,
  hex text not null,
  usage text,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (brand_id, token)
);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  name text not null,
  objective text,
  focus_product text,
  month int,
  year int,
  status text default 'active',
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table if exists monthly_plans add column if not exists plan_brief jsonb default '{}';

alter table if exists post_ideas add column if not exists converted_post_id uuid references posts(id) on delete set null;
alter table if exists post_ideas add column if not exists approved_at timestamptz;
alter table if exists post_ideas add column if not exists rejected_reason text;
alter table if exists post_ideas add column if not exists regenerate_count int default 0;
alter table if exists post_ideas add column if not exists deleted_at timestamptz;

alter table if exists posts add column if not exists source_idea_id uuid references post_ideas(id) on delete set null;
alter table if exists posts add column if not exists batch_id uuid;
alter table if exists posts add column if not exists scheduled_by uuid references app_users(id) on delete set null;
alter table if exists posts add column if not exists approved_at timestamptz;
alter table if exists posts add column if not exists published_at timestamptz;
alter table if exists posts add column if not exists meta_post_id text;
alter table if exists posts add column if not exists meta_permalink text;
alter table if exists posts add column if not exists deleted_at timestamptz;
alter table if exists posts add column if not exists status_reason text;
alter table if exists posts add column if not exists current_version_id uuid;
alter table if exists posts add column if not exists short_text text;
drop index if exists posts_source_idea_id_unique;
create unique index if not exists posts_source_idea_id_unique on posts(source_idea_id);

alter table if exists post_versions add column if not exists version_type text default 'ai_generated';
alter table if exists post_versions add column if not exists generated_by text default 'openai';
alter table if exists post_versions add column if not exists prompt_snapshot jsonb default '{}';
alter table if exists post_versions add column if not exists output_json jsonb default '{}';
alter table if exists post_versions add column if not exists is_current boolean default false;
alter table if exists post_versions add column if not exists restored_at timestamptz;

alter table if exists content_comments add column if not exists version_id uuid references post_versions(id) on delete set null;
alter table if exists content_comments add column if not exists author_name text;
alter table if exists content_comments add column if not exists resolved_at timestamptz;
alter table if exists content_comments add column if not exists resolved_by uuid references app_users(id) on delete set null;
alter table if exists content_comments add column if not exists comment_type text default 'feedback';
alter table if exists content_comments add column if not exists feedback_for_ai boolean default true;
alter table if exists content_comments add column if not exists archived_at timestamptz;

alter table if exists media_assets add column if not exists width int;
alter table if exists media_assets add column if not exists height int;
alter table if exists media_assets add column if not exists duration numeric;
alter table if exists media_assets add column if not exists file_size bigint;
alter table if exists media_assets add column if not exists storage_bucket text;
alter table if exists media_assets add column if not exists storage_path text;
alter table if exists media_assets add column if not exists is_final boolean default false;
alter table if exists media_assets add column if not exists used_in_publish boolean default false;
alter table if exists media_assets add column if not exists asset_role text;
alter table if exists media_assets add column if not exists usage_context text;
alter table if exists media_assets add column if not exists ai_weight int default 5;
alter table if exists media_assets add column if not exists source_url text;
alter table if exists media_assets add column if not exists related_campaign_id uuid references campaigns(id) on delete set null;
alter table if exists media_assets add column if not exists deleted_at timestamptz;

alter table if exists library_items add column if not exists ai_allowed boolean default false;
alter table if exists library_items add column if not exists asset_role text;
alter table if exists library_items add column if not exists usage_context text;
alter table if exists library_items add column if not exists ai_weight int default 5;
alter table if exists library_items add column if not exists source_url text;
alter table if exists library_items add column if not exists related_campaign_id uuid references campaigns(id) on delete set null;
alter table if exists library_items add column if not exists forbidden_reason text;
alter table if exists library_items add column if not exists deleted_at timestamptz;

create table if not exists generation_jobs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  post_id uuid references posts(id) on delete cascade,
  batch_id uuid,
  job_type text not null default 'full_post',
  status text not null default 'queued',
  step text default 'queued',
  attempts int not null default 0,
  locked_at timestamptz,
  locked_by text,
  next_attempt_at timestamptz default now(),
  last_error text,
  input_json jsonb default '{}',
  output_json jsonb default '{}',
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(post_id, job_type, status)
);

alter table if exists publish_queue add column if not exists locked_at timestamptz;
alter table if exists publish_queue add column if not exists locked_by text;
alter table if exists publish_queue add column if not exists next_attempt_at timestamptz default now();
alter table if exists publish_queue add column if not exists meta_response_json jsonb default '{}';
alter table if exists publish_queue add column if not exists idempotency_key text;
alter table if exists publish_queue add column if not exists cancelled_at timestamptz;
alter table if exists publish_queue add column if not exists archived_at timestamptz;
alter table if exists publish_queue add column if not exists brand_id uuid references brands(id) on delete cascade;
update publish_queue q
set brand_id = p.brand_id
from posts p
where q.post_id = p.id
  and q.brand_id is null;

alter table if exists publish_logs add column if not exists brand_id uuid references brands(id) on delete set null;
update publish_logs l
set brand_id = p.brand_id
from posts p
where l.post_id = p.id
  and l.brand_id is null;

drop index if exists publish_queue_idempotency_unique;
create unique index if not exists publish_queue_idempotency_unique on publish_queue(idempotency_key);

alter table if exists system_logs add column if not exists severity text default 'info';
alter table if exists system_logs add column if not exists correlation_id text;
alter table if exists system_logs add column if not exists request_id text;
alter table if exists system_logs add column if not exists sanitized boolean default true;

-- RPC leve para dashboard sem carregar tudo.
create or replace function public.dashboard_summary(p_brand_id uuid)
returns jsonb language plpgsql security definer as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'posts_total', count(*),
    'posts_planejados', count(*) filter (where status in ('rascunho','tema_aprovado','em_producao')),
    'posts_revisao', count(*) filter (where status in ('aguardando_revisao','ajuste_solicitado')),
    'posts_aprovados', count(*) filter (where status = 'aprovado'),
    'posts_agendados', count(*) filter (where status = 'agendado'),
    'posts_publicados', count(*) filter (where status = 'publicado'),
    'posts_erros', count(*) filter (where status = 'erro'),
    'posts_arquivados', count(*) filter (where archived_at is not null or status = 'arquivado')
  ) into result
  from posts
  where brand_id = p_brand_id and deleted_at is null;
  return coalesce(result, '{}'::jsonb);
end;
$$;

-- RLS complementar. Policies admin + membro de marca para tabelas operacionais.
do $$
declare t text;
begin
  foreach t in array array[
    'brand_color_palette','campaigns','brand_voice_rules','brand_visual_rules','brand_assets','brand_forbidden_terms','brand_preferred_terms',
    'custom_campaign_themes','post_versions','content_comments','publish_logs','api_connections','admin_settings','settings','templates','ai_brain_rules','ai_prompt_templates','ai_feedbacks','generation_jobs'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
exception when undefined_table then null;
end $$;

create or replace function public.current_app_brand_id()
returns uuid language sql stable as $$
  select brand_id from public.app_users where auth_user_id = auth.uid() limit 1
$$;

-- Policies idempotentes via drop/create seguro.
-- Só cria política por brand_id quando a tabela existe E tem a coluna brand_id.
-- Isso corrige o erro: column "brand_id" does not exist.
do $$
declare
  t text;
  has_brand_id boolean;
begin
  foreach t in array array[
    'brand_color_palette',
    'campaigns',
    'brand_voice_rules',
    'brand_visual_rules',
    'brand_assets',
    'brand_forbidden_terms',
    'brand_preferred_terms',
    'custom_campaign_themes',
    'monthly_plans',
    'post_ideas',
    'posts',
    'media_assets',
    'library_items',
    'publish_queue',
    'publish_logs',
    'api_connections',
    'settings',
    'templates',
    'ai_brain_rules',
    'ai_prompt_templates',
    'ai_feedbacks',
    'generation_jobs'
  ] loop
    if to_regclass('public.' || t) is not null then
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = t
          and column_name = 'brand_id'
      ) into has_brand_id;

      execute format('drop policy if exists "admin full %s" on public.%I', t, t);
      execute format('create policy "admin full %s" on public.%I for all using (is_admin()) with check (is_admin())', t, t);

      execute format('drop policy if exists "brand member read %s" on public.%I', t, t);
      execute format('drop policy if exists "brand member write %s" on public.%I', t, t);
      execute format('drop policy if exists "brand member update %s" on public.%I', t, t);

      if has_brand_id then
        execute format(
          'create policy "brand member read %s" on public.%I for select using (brand_id = current_app_brand_id() or is_admin())',
          t,
          t
        );

        execute format(
          'create policy "brand member write %s" on public.%I for insert with check (brand_id = current_app_brand_id() or is_admin())',
          t,
          t
        );

        execute format(
          'create policy "brand member update %s" on public.%I for update using (brand_id = current_app_brand_id() or is_admin()) with check (brand_id = current_app_brand_id() or is_admin())',
          t,
          t
        );
      else
        raise notice 'Tabela public.% não tem brand_id; políticas de membro por marca ignoradas.', t;
      end if;
    end if;
  end loop;
end $$;

-- Storage buckets oficiais.
insert into storage.buckets (id, name, public)
values ('brand-assets', 'brand-assets', false), ('creative-media', 'creative-media', true), ('library', 'library', true)
on conflict (id) do update set public = excluded.public;

-- Seed oficial MYINC.
do $$
declare
  v_brand_id uuid;
begin
  insert into brands (name, public_name, status)
  values ('MYINC', 'MYINC Incorporadora', 'active')
  on conflict do nothing;

  select id into v_brand_id from brands where name = 'MYINC' order by created_at asc limit 1;

  insert into brand_profiles (
    brand_id, site, instagram, facebook, whatsapp, region, niche, segment, primary_audience, secondary_audience,
    persona, problems_solved, benefits, differentiators, products, services, objections, guarantees, social_proof,
    tone, communication_style, primary_palette, secondary_palette, brand_fonts, preferred_visual_style,
    forbidden_visual_style, logo_rules, composition_rules, image_text_rules, approved_references, bad_references, mantra
  ) values (
    v_brand_id, 'https://myinc.com.br', '@myinc', 'MYINC', '', 'Londrina e região',
    'Incorporadora e construtora premium', 'Empreendimentos imobiliários de alto padrão',
    'Famílias, investidores e compradores exigentes que buscam imóvel de alto padrão, segurança, localização estratégica e valorização patrimonial.',
    'Arquitetos, corretores parceiros, investidores e comunidade local.',
    'Cliente criterioso, visual, ocupado, que valoriza confiança, projeto bem resolvido, atendimento humano e prova de qualidade.',
    'Falta de segurança na decisão imobiliária, dificuldade de comparar qualidade, medo de promessa vazia e excesso de ofertas genéricas.',
    'Arquitetura funcional, qualidade construtiva, sofisticação, localização, design, atendimento próximo e visão de longo prazo.',
    'Alto padrão, inovação, proximidade, clareza comercial, estética premium, execução confiável e atenção aos detalhes.',
    'Empreendimentos residenciais e comerciais premium, apartamentos, casas e lançamentos imobiliários.',
    'Incorporação, construção, desenvolvimento imobiliário, atendimento comercial e relacionamento com cliente.',
    'Preço, prazo, confiança na entrega, localização, liquidez e comparação com concorrentes.',
    'Comunicação transparente, dados reais, acompanhamento, equipe especializada e histórico de execução.',
    'Obras, entregas, materiais, equipe, atendimento, depoimentos e presença digital.',
    'Premium, humano, claro, sofisticado, objetivo e confiável. Sem exagero, sem pressão agressiva.',
    'Comunicação de agência premium especializada em incorporadoras, com copy curta, elegante e orientada à ação.',
    '#0F0F10, #F5F1EA, #C96F38, #A9798B', '#FFFFFF, #2B2B2D, #E7D8CE, #8A5A44', 'Montserrat',
    'Arquitetura contemporânea, luz natural, concreto, madeira, vidro, tons neutros, composição limpa e sensação premium.',
    'Design poluído, lettering distorcido, excesso de texto, render genérico, foto amadora, cores neon e estética infantil.',
    'Usar logo branca em fundo escuro e versão escura em fundo claro; preservar respiro e não distorcer proporção.',
    'Pouco texto na arte, foco em imagem forte, hierarquia clara, margem generosa e contraste sofisticado.',
    'Texto mínimo, legível, nunca depender de texto longo dentro da imagem.',
    'Referências de arquitetura, obras reais, materiais nobres, lifestyle residencial e imagens aprovadas da biblioteca.',
    'Promessa de valorização garantida, fotos genéricas irreais, excesso de filtros, visual de panfleto e copy apelativa.',
    'Você é o núcleo criativo da MYINC, incorporadora/construtora premium. Aja como estrategista, copywriter, diretor de arte e revisor especializado em conteúdo imobiliário de alto padrão.'
  )
  on conflict do nothing;

  insert into brand_color_palette (brand_id, token, label, hex, usage) values
    (v_brand_id, 'background_dark', 'Grafite premium', '#0F0F10', 'Fundo dark/sidebar'),
    (v_brand_id, 'background_light', 'Off-white MYINC', '#F5F1EA', 'Fundo claro premium'),
    (v_brand_id, 'primary', 'Cobre/laranja MYINC', '#C96F38', 'CTA e destaques'),
    (v_brand_id, 'accent', 'Rosé institucional', '#A9798B', 'Detalhes de marca')
  on conflict (brand_id, token) do update set hex = excluded.hex, label = excluded.label, usage = excluded.usage;

  insert into ai_brain_rules (brand_id, name, category, content, active, priority, default_content) values
    (v_brand_id, 'Mantra MYINC incorporadora premium', 'estratégia', 'Todo conteúdo deve soar como agência premium especializada em incorporadoras: sofisticado, claro, confiável e útil.', true, 1, 'Todo conteúdo deve soar como agência premium especializada em incorporadoras.'),
    (v_brand_id, 'Copy objetiva e comercial sem exagero', 'copy', 'Use frases curtas, benefício concreto, CTA claro e linguagem humana. Evite promessas impossíveis e urgência apelativa.', true, 2, 'Copy objetiva e comercial sem exagero.'),
    (v_brand_id, 'Direção de arte premium', 'visual', 'Priorize arquitetura contemporânea, luz natural, materiais nobres, pouco texto na arte, respiro e composição limpa.', true, 3, 'Direção de arte premium.'),
    (v_brand_id, 'Instagram imobiliário 2026', 'Instagram', 'Feed 4:5 com imagem forte, stories com CTA rápido, carrossel educativo e reels com hook nos 3 primeiros segundos.', true, 4, 'Instagram imobiliário 2026.'),
    (v_brand_id, 'Critério anti-genérico', 'qualidade', 'Reprove qualquer saída que poderia servir para qualquer empresa. O conteúdo precisa mencionar contexto imobiliário, confiança, projeto, localização, obra ou lifestyle.', true, 5, 'Critério anti-genérico.')
  on conflict do nothing;

  insert into ai_prompt_templates (brand_id, name, content, note, active) values
    (v_brand_id, 'Feed premium 1080x1350', 'Gerar post 4:5 com headline curta, legenda objetiva, CTA e prompt visual premium para incorporadora.', 'Template de feed vertical.', true),
    (v_brand_id, 'Story 1080x1920', 'Gerar sequência de até 3 stories com gancho, benefício e chamada para WhatsApp/Instagram.', 'Template de story.', true),
    (v_brand_id, 'Reels imobiliário', 'Gerar roteiro de reels com hook nos 3 primeiros segundos, cenas, narração, texto de tela e CTA.', 'Template de reels.', true),
    (v_brand_id, 'Carrossel educativo', 'Gerar páginas de carrossel com hook, desenvolvimento, prova e CTA final.', 'Template de carrossel.', true)
  on conflict do nothing;
end $$;

create index if not exists idx_posts_brand_status_updated on posts(brand_id, status, updated_at desc);
create index if not exists idx_posts_brand_scheduled on posts(brand_id, scheduled_at);
create index if not exists idx_post_ideas_brand_status on post_ideas(brand_id, status);
create index if not exists idx_generation_jobs_status_time on generation_jobs(status, next_attempt_at, created_at);
create index if not exists idx_publish_queue_status_time_v2 on publish_queue(status, next_attempt_at, scheduled_at);
