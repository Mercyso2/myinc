-- v1.1.0-production-core CORRIGIDO v2
-- Autenticação, app_users, RLS, Storage e bootstrap admin Rodrigo.
--
-- Correção do erro atual:
-- O banco ainda tinha brands.owner_id apontando para public.users.
-- Por isso, ao atualizar owner_id com um ID de public.app_users, dava:
-- "violates foreign key constraint brands_owner_id_fkey".
--
-- Esta versão corrige a ORDEM:
-- 1. Garante app_users.
-- 2. Copia users -> app_users quando necessário.
-- 3. Adiciona colunas/FKs de app_users.
-- 4. DERRUBA e RECRIA brands_owner_id_fkey apontando para app_users ANTES de atualizar owner_id.
-- 5. Só depois faz bootstrap MYINC/Rodrigo.
-- 6. Habilita RLS, policies e storage.

create extension if not exists "pgcrypto";

-- =========================================================
-- 1. GARANTIR public.app_users COM SEGURANÇA
-- =========================================================

do $$
begin
  if to_regclass('public.app_users') is null
     and to_regclass('public.users') is not null then

    alter table public.users rename to app_users;
    raise notice 'public.users renomeada para public.app_users.';

  elsif to_regclass('public.app_users') is not null then

    raise notice 'public.app_users já existe. Rename ignorado.';

  else

    create table public.app_users (
      id uuid primary key default gen_random_uuid(),
      email text unique not null,
      full_name text,
      role text default 'admin',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    raise notice 'public.app_users criada do zero.';

  end if;
end $$;

-- Se public.users e public.app_users existirem ao mesmo tempo,
-- copia dados preservando IDs quando ainda não existirem em app_users.
do $$
begin
  if to_regclass('public.users') is not null
     and to_regclass('public.app_users') is not null then

    insert into public.app_users (
      id,
      email,
      full_name,
      role,
      created_at,
      updated_at
    )
    select
      u.id,
      u.email,
      u.full_name,
      coalesce(u.role, 'admin'),
      coalesce(u.created_at, now()),
      coalesce(u.updated_at, now())
    from public.users u
    where u.email is not null
      and not exists (
        select 1
        from public.app_users au
        where au.id = u.id
           or au.email = u.email
      )
    on conflict do nothing;

    raise notice 'Dados de public.users copiados para public.app_users quando necessário.';

  end if;
end $$;

-- =========================================================
-- 2. COLUNAS NECESSÁRIAS EM app_users
-- =========================================================

alter table public.app_users
  add column if not exists auth_user_id uuid;

alter table public.app_users
  add column if not exists brand_id uuid;

alter table public.app_users
  add column if not exists status text not null default 'active';

alter table public.app_users
  add column if not exists last_login_at timestamptz;

alter table public.app_users
  alter column role set default 'admin';

-- Foreign keys seguras de app_users.
alter table public.app_users
  drop constraint if exists app_users_auth_user_id_fkey;

alter table public.app_users
  add constraint app_users_auth_user_id_fkey
  foreign key (auth_user_id)
  references auth.users(id)
  on delete cascade;

alter table public.app_users
  drop constraint if exists app_users_brand_id_fkey;

alter table public.app_users
  add constraint app_users_brand_id_fkey
  foreign key (brand_id)
  references public.brands(id)
  on delete set null;

create unique index if not exists app_users_auth_user_id_key
  on public.app_users(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists app_users_email_key
  on public.app_users(email);

-- =========================================================
-- 3. CORRIGIR FKs ANTIGAS QUE APONTAVAM PARA public.users
--    IMPORTANTE: isso vem ANTES do update de brands.owner_id.
-- =========================================================

do $$
begin
  -- brands.owner_id -> app_users.id
  if to_regclass('public.brands') is not null then
    alter table public.brands
      drop constraint if exists brands_owner_id_fkey;

    -- Se algum owner_id não existir em app_users, limpa para não quebrar a nova FK.
    update public.brands b
    set owner_id = null
    where b.owner_id is not null
      and not exists (
        select 1
        from public.app_users au
        where au.id = b.owner_id
      );

    alter table public.brands
      add constraint brands_owner_id_fkey
      foreign key (owner_id)
      references public.app_users(id)
      on delete set null;
  end if;

  -- content_comments.user_id -> app_users.id
  if to_regclass('public.content_comments') is not null then
    alter table public.content_comments
      drop constraint if exists content_comments_user_id_fkey;

    update public.content_comments c
    set user_id = null
    where c.user_id is not null
      and not exists (
        select 1
        from public.app_users au
        where au.id = c.user_id
      );

    alter table public.content_comments
      add constraint content_comments_user_id_fkey
      foreign key (user_id)
      references public.app_users(id)
      on delete set null;
  end if;

  -- system_logs.user_id -> app_users.id
  if to_regclass('public.system_logs') is not null then
    alter table public.system_logs
      drop constraint if exists system_logs_user_id_fkey;

    update public.system_logs l
    set user_id = null
    where l.user_id is not null
      and not exists (
        select 1
        from public.app_users au
        where au.id = l.user_id
      );

    alter table public.system_logs
      add constraint system_logs_user_id_fkey
      foreign key (user_id)
      references public.app_users(id)
      on delete set null;
  end if;
end $$;

-- =========================================================
-- 4. BOOTSTRAP DA MARCA MYINC E ADMIN RODRIGO
-- =========================================================

insert into public.brands (
  name,
  public_name,
  status
)
select
  'MYINC',
  'MYINC Incorporadora',
  'active'
where not exists (
  select 1
  from public.brands
  where name = 'MYINC'
);

insert into public.app_users (
  email,
  full_name,
  role,
  status,
  brand_id
)
select
  'rodrigo@myinc.local',
  'Rodrigo',
  'admin',
  'active',
  b.id
from public.brands b
where b.name = 'MYINC'
order by b.created_at asc
limit 1
on conflict (email) do update set
  role = 'admin',
  status = 'active',
  full_name = excluded.full_name,
  brand_id = coalesce(public.app_users.brand_id, excluded.brand_id),
  updated_at = now();

-- Agora a FK de brands.owner_id já aponta para app_users, então este update não quebra.
update public.brands b
set owner_id = au.id,
    updated_at = now()
from public.app_users au
where b.name = 'MYINC'
  and au.email = 'rodrigo@myinc.local'
  and b.owner_id is distinct from au.id;

-- =========================================================
-- 5. FUNÇÕES DE AUTH / RLS
-- =========================================================

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select au.id
  from public.app_users au
  where au.auth_user_id = auth.uid()
    and au.status = 'active'
  limit 1
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
  limit 1
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
  limit 1
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_app_user_role(), 'viewer') = 'admin'
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
as $$
  select public.is_admin()
$$;

-- =========================================================
-- 6. HABILITAR RLS SOMENTE EM TABELAS EXISTENTES
-- =========================================================

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'app_users',
    'brands',
    'brand_profiles',
    'brand_voice_rules',
    'brand_visual_rules',
    'brand_products',
    'brand_services',
    'brand_references',
    'brand_forbidden_terms',
    'brand_preferred_terms',
    'brand_assets',
    'monthly_plans',
    'custom_campaign_themes',
    'post_ideas',
    'posts',
    'post_versions',
    'content_comments',
    'media_assets',
    'library_items',
    'publish_queue',
    'publish_logs',
    'api_connections',
    'admin_settings',
    'settings',
    'templates',
    'ai_brain_rules',
    'ai_prompt_templates',
    'ai_feedbacks',
    'system_logs'
  ] loop
    if to_regclass('public.' || tbl) is not null then
      execute format('alter table public.%I enable row level security', tbl);
    end if;
  end loop;
end $$;

-- =========================================================
-- 7. POLICIES DE app_users
-- =========================================================

drop policy if exists "admin full app_users" on public.app_users;
drop policy if exists "self read app_users" on public.app_users;
drop policy if exists app_users_select_own_or_admin on public.app_users;
drop policy if exists app_users_insert_admin on public.app_users;
drop policy if exists app_users_update_admin on public.app_users;
drop policy if exists app_users_delete_admin on public.app_users;

create policy app_users_select_own_or_admin
on public.app_users
for select
using (
  auth_user_id = auth.uid()
  or brand_id = public.current_app_brand_id()
  or public.is_admin()
);

create policy app_users_insert_admin
on public.app_users
for insert
with check (
  public.is_admin()
  or auth.uid() is null
);

create policy app_users_update_admin
on public.app_users
for update
using (public.is_admin())
with check (public.is_admin());

create policy app_users_delete_admin
on public.app_users
for delete
using (public.is_admin());

-- =========================================================
-- 8. POLICIES DE brands
-- =========================================================

drop policy if exists "admin full brands" on public.brands;
drop policy if exists "owner brand read" on public.brands;
drop policy if exists brands_select_member on public.brands;
drop policy if exists brands_insert_admin on public.brands;
drop policy if exists brands_update_admin on public.brands;
drop policy if exists brands_delete_admin on public.brands;

create policy brands_select_member
on public.brands
for select
using (
  id = public.current_app_brand_id()
  or owner_id = public.current_app_user_id()
  or public.is_admin()
);

create policy brands_insert_admin
on public.brands
for insert
with check (public.is_admin());

create policy brands_update_admin
on public.brands
for update
using (public.is_admin())
with check (public.is_admin());

create policy brands_delete_admin
on public.brands
for delete
using (public.is_admin());

-- =========================================================
-- 9. POLICIES GENÉRICAS PARA TABELAS COM brand_id
-- =========================================================

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'brand_profiles',
    'brand_voice_rules',
    'brand_visual_rules',
    'brand_products',
    'brand_services',
    'brand_references',
    'brand_forbidden_terms',
    'brand_preferred_terms',
    'brand_assets',
    'monthly_plans',
    'custom_campaign_themes',
    'post_ideas',
    'posts',
    'media_assets',
    'library_items',
    'api_connections',
    'admin_settings',
    'settings',
    'templates',
    'ai_brain_rules',
    'ai_prompt_templates',
    'ai_feedbacks',
    'system_logs'
  ] loop
    if to_regclass('public.' || tbl) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = tbl
           and column_name = 'brand_id'
       ) then

      execute format('drop policy if exists %I on public.%I', tbl || '_select_member', tbl);
      execute format('drop policy if exists %I on public.%I', tbl || '_insert_member', tbl);
      execute format('drop policy if exists %I on public.%I', tbl || '_update_member', tbl);
      execute format('drop policy if exists %I on public.%I', tbl || '_delete_admin', tbl);

      execute format(
        'create policy %I on public.%I for select using (brand_id = public.current_app_brand_id() or public.is_admin())',
        tbl || '_select_member',
        tbl
      );

      execute format(
        'create policy %I on public.%I for insert with check (brand_id = public.current_app_brand_id() or public.is_admin())',
        tbl || '_insert_member',
        tbl
      );

      execute format(
        'create policy %I on public.%I for update using (brand_id = public.current_app_brand_id() or public.is_admin()) with check (brand_id = public.current_app_brand_id() or public.is_admin())',
        tbl || '_update_member',
        tbl
      );

      execute format(
        'create policy %I on public.%I for delete using (public.is_admin())',
        tbl || '_delete_admin',
        tbl
      );
    end if;
  end loop;
end $$;

-- =========================================================
-- 10. POLICIES PARA post_versions SEM brand_id DIRETO
-- =========================================================

do $$
begin
  if to_regclass('public.post_versions') is not null
     and to_regclass('public.posts') is not null then

    drop policy if exists post_versions_select_member on public.post_versions;
    drop policy if exists post_versions_write_member on public.post_versions;

    create policy post_versions_select_member
    on public.post_versions
    for select
    using (
      exists (
        select 1
        from public.posts p
        where p.id = post_versions.post_id
          and (
            p.brand_id = public.current_app_brand_id()
            or public.is_admin()
          )
      )
    );

    create policy post_versions_write_member
    on public.post_versions
    for all
    using (
      exists (
        select 1
        from public.posts p
        where p.id = post_versions.post_id
          and (
            p.brand_id = public.current_app_brand_id()
            or public.is_admin()
          )
      )
    )
    with check (
      exists (
        select 1
        from public.posts p
        where p.id = post_versions.post_id
          and (
            p.brand_id = public.current_app_brand_id()
            or public.is_admin()
          )
      )
    );

  end if;
end $$;

-- =========================================================
-- 11. POLICIES PARA content_comments SEM brand_id DIRETO
-- =========================================================

do $$
begin
  if to_regclass('public.content_comments') is not null
     and to_regclass('public.posts') is not null then

    drop policy if exists content_comments_select_member on public.content_comments;
    drop policy if exists content_comments_write_member on public.content_comments;

    create policy content_comments_select_member
    on public.content_comments
    for select
    using (
      exists (
        select 1
        from public.posts p
        where p.id = content_comments.post_id
          and (
            p.brand_id = public.current_app_brand_id()
            or public.is_admin()
          )
      )
    );

    create policy content_comments_write_member
    on public.content_comments
    for all
    using (
      exists (
        select 1
        from public.posts p
        where p.id = content_comments.post_id
          and (
            p.brand_id = public.current_app_brand_id()
            or public.is_admin()
          )
      )
    )
    with check (
      exists (
        select 1
        from public.posts p
        where p.id = content_comments.post_id
          and (
            p.brand_id = public.current_app_brand_id()
            or public.is_admin()
          )
      )
    );

  end if;
end $$;

-- =========================================================
-- 12. STORAGE BUCKETS
-- =========================================================

insert into storage.buckets (id, name, public)
values
  ('brand-assets', 'brand-assets', false),
  ('creative-media', 'creative-media', true),
  ('library', 'library', false)
on conflict (id) do update set
  public = excluded.public;

-- Limpa policies antigas de storage.
drop policy if exists "authenticated can read brand assets" on storage.objects;
drop policy if exists "authenticated can upload brand assets" on storage.objects;
drop policy if exists "authenticated can update brand assets" on storage.objects;
drop policy if exists "authenticated can delete brand assets" on storage.objects;

drop policy if exists "public can read creative media" on storage.objects;
drop policy if exists "authenticated can upload creative media" on storage.objects;
drop policy if exists "authenticated can update creative media" on storage.objects;
drop policy if exists "authenticated can delete creative media" on storage.objects;

drop policy if exists "authenticated can read library" on storage.objects;
drop policy if exists "authenticated can upload library" on storage.objects;
drop policy if exists "authenticated can update library" on storage.objects;
drop policy if exists "authenticated can delete library" on storage.objects;

create policy "authenticated can read brand assets"
on storage.objects
for select
using (
  bucket_id = 'brand-assets'
  and auth.uid() is not null
);

create policy "authenticated can upload brand assets"
on storage.objects
for insert
with check (
  bucket_id = 'brand-assets'
  and auth.uid() is not null
);

create policy "authenticated can update brand assets"
on storage.objects
for update
using (
  bucket_id = 'brand-assets'
  and auth.uid() is not null
)
with check (
  bucket_id = 'brand-assets'
  and auth.uid() is not null
);

create policy "authenticated can delete brand assets"
on storage.objects
for delete
using (
  bucket_id = 'brand-assets'
  and public.is_admin()
);

create policy "public can read creative media"
on storage.objects
for select
using (
  bucket_id = 'creative-media'
);

create policy "authenticated can upload creative media"
on storage.objects
for insert
with check (
  bucket_id = 'creative-media'
  and auth.uid() is not null
);

create policy "authenticated can update creative media"
on storage.objects
for update
using (
  bucket_id = 'creative-media'
  and auth.uid() is not null
)
with check (
  bucket_id = 'creative-media'
  and auth.uid() is not null
);

create policy "authenticated can delete creative media"
on storage.objects
for delete
using (
  bucket_id = 'creative-media'
  and public.is_admin()
);

create policy "authenticated can read library"
on storage.objects
for select
using (
  bucket_id = 'library'
  and auth.uid() is not null
);

create policy "authenticated can upload library"
on storage.objects
for insert
with check (
  bucket_id = 'library'
  and auth.uid() is not null
);

create policy "authenticated can update library"
on storage.objects
for update
using (
  bucket_id = 'library'
  and auth.uid() is not null
)
with check (
  bucket_id = 'library'
  and auth.uid() is not null
);

create policy "authenticated can delete library"
on storage.objects
for delete
using (
  bucket_id = 'library'
  and public.is_admin()
);

-- =========================================================
-- 13. LOG DA MIGRATION
-- =========================================================

insert into public.system_logs (
  brand_id,
  user_id,
  type,
  module,
  status,
  friendly_message,
  technical_detail
)
select
  b.id,
  au.id,
  'migration',
  'database',
  'ok',
  'Migration production_auth_rls_storage aplicada com sucesso.',
  'Migration corrigida v2: brands_owner_id_fkey recriada antes de atualizar owner_id.'
from public.brands b
left join public.app_users au
  on au.email = 'rodrigo@myinc.local'
where b.name = 'MYINC'
order by b.created_at asc
limit 1;
