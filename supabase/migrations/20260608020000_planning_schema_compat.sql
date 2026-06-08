alter table if exists public.monthly_plans
  add column if not exists title text null,
  add column if not exists strategy text null,
  add column if not exists prompt_used text null,
  add column if not exists ai_response_json jsonb null,
  add column if not exists deleted_at timestamptz null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'monthly_plans'
      and column_name = 'name'
  ) then
    execute 'update public.monthly_plans set title = coalesce(title, name) where title is null';
  end if;
end $$;

alter table if exists public.post_ideas
  add column if not exists title text null,
  add column if not exists priority int null,
  add column if not exists prompt_seed text null,
  add column if not exists ai_response_json jsonb null;

update public.post_ideas
set title = coalesce(title, headline, theme, 'Ideia MYINC')
where title is null;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end $$;
