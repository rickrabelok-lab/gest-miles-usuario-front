alter table public.perfis
  add column if not exists admin_level text;

alter table public.perfis
  drop constraint if exists perfis_admin_level_check;

alter table public.perfis
  add constraint perfis_admin_level_check
  check (admin_level is null or admin_level in ('geral', 'master'));

comment on column public.perfis.admin_level is
  'Nivel administrativo quando perfis.role = admin. Valores previstos: geral, master. Mantem admin_geral/admin_master legado durante rollout.';

update public.perfis
set admin_level = case
  when lower(trim(coalesce(role, ''))) = 'admin_master' then 'master'
  when lower(trim(coalesce(role, ''))) = 'admin_geral' then 'geral'
  else admin_level
end
where lower(trim(coalesce(role, ''))) in ('admin_master', 'admin_geral')
  and admin_level is null;
