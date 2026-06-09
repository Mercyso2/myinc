alter table if exists public.post_versions
  add column if not exists brand_id uuid null references public.brands(id) on delete cascade,
  add column if not exists output_json jsonb null,
  add column if not exists archived_at timestamptz null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists updated_at timestamptz null default now();

update public.post_versions pv
set brand_id = p.brand_id
from public.posts p
where pv.post_id = p.id
  and pv.brand_id is null;

do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end $$;
