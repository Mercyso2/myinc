alter table if exists public.posts
  add column if not exists quality_review jsonb null;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end $$;
