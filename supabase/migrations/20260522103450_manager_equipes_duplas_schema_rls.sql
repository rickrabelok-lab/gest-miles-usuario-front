begin;

do $$
begin
  if to_regclass('public.equipes') is null then
    raise exception 'missing_table_public_equipes';
  end if;

  if to_regprocedure('public.is_legacy_platform_admin()') is null then
    raise exception 'missing_function_public_is_legacy_platform_admin';
  end if;

  if to_regprocedure('public.can_admin_equipe(uuid)') is null then
    raise exception 'missing_function_public_can_admin_equipe';
  end if;

  if to_regprocedure('public.equipe_usuario_eh_membro_ativo(uuid, uuid)') is null then
    raise exception 'missing_function_public_equipe_usuario_eh_membro_ativo';
  end if;
end;
$$;

create table if not exists public.equipes_duplas (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  ordem smallint not null default 1,
  nome text not null,
  gestor_nacional_id uuid not null references auth.users (id) on delete restrict,
  gestor_internacional_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (equipe_id, ordem),
  unique (equipe_id, gestor_nacional_id, gestor_internacional_id),
  check (gestor_nacional_id <> gestor_internacional_id)
);

create index if not exists equipes_duplas_equipe_id_idx
  on public.equipes_duplas (equipe_id);

create index if not exists equipes_duplas_gestor_nacional_id_idx
  on public.equipes_duplas (gestor_nacional_id);

create index if not exists equipes_duplas_gestor_internacional_id_idx
  on public.equipes_duplas (gestor_internacional_id);

alter table public.equipes_duplas enable row level security;

drop policy if exists equipes_duplas_select_authenticated on public.equipes_duplas;
drop policy if exists equipes_duplas_select_scoped on public.equipes_duplas;
create policy equipes_duplas_select_scoped
  on public.equipes_duplas
  for select
  to authenticated
  using (
    public.is_legacy_platform_admin()
    or public.equipe_usuario_eh_membro_ativo(equipe_id, auth.uid())
    or auth.uid() in (gestor_nacional_id, gestor_internacional_id)
  );

drop policy if exists equipes_duplas_insert_admin on public.equipes_duplas;
create policy equipes_duplas_insert_admin
  on public.equipes_duplas
  for insert
  to authenticated
  with check (
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(equipe_id)
  );

drop policy if exists equipes_duplas_update_admin on public.equipes_duplas;
create policy equipes_duplas_update_admin
  on public.equipes_duplas
  for update
  to authenticated
  using (
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(equipe_id)
  )
  with check (
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(equipe_id)
  );

drop policy if exists equipes_duplas_delete_admin on public.equipes_duplas;
create policy equipes_duplas_delete_admin
  on public.equipes_duplas
  for delete
  to authenticated
  using (
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(equipe_id)
  );

revoke all on table public.equipes_duplas from public, anon;
grant select on table public.equipes_duplas to authenticated;
grant all on table public.equipes_duplas to service_role;

comment on table public.equipes_duplas is
  'Duplas operacionais nacional/internacional por equipe. Leitura restrita por RLS ao escopo da equipe, dupla ou admin.';

commit;
