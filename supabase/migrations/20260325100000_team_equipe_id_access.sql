-- Team-based access: equipes.admin_id, perfis.equipe_id, role cliente_gestao.
-- Backward compatible: users with NULL equipe_id keep legacy RLS paths (cs_gestores, is_admin, etc.).
-- New rules apply when equipe_id / team constraints are in use.

-- ---------------------------------------------------------------------------
-- 1) Schema: equipes.admin_id, perfis.equipe_id, role cliente_gestao
-- ---------------------------------------------------------------------------

alter table if exists public.equipes
  add column if not exists admin_id uuid references auth.users (id) on delete set null;

create index if not exists idx_equipes_admin_id on public.equipes (admin_id);

alter table if exists public.perfis
  add column if not exists equipe_id uuid references public.equipes (id) on delete set null;

create index if not exists idx_perfis_equipe_id on public.perfis (equipe_id);

do $$
declare
  c name;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'perfis'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%role%'
  loop
    execute format('alter table public.perfis drop constraint %I', c);
  end loop;
end $$;

alter table public.perfis
  add constraint perfis_role_check
  check (role in ('admin', 'cs', 'gestor', 'cliente', 'cliente_gestao'));

-- ---------------------------------------------------------------------------
-- 2) Helpers: legacy platform admin vs team-scoped users
-- ---------------------------------------------------------------------------

create or replace function public.perfis_equipe_id(uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.equipe_id from public.perfis p where p.usuario_id = uid limit 1;
$$;

create or replace function public.current_equipe_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.perfis_equipe_id(auth.uid());
$$;

-- Full cross-tenant power (only if admin with no team assignment)
create or replace function public.is_legacy_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role = 'admin' and p.equipe_id is null
      from public.perfis p
      where p.usuario_id = auth.uid()
      limit 1
    ),
    false
  );
$$;

-- Any row in perfis with role admin (including team admins)
create or replace function public.is_any_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'admin' from public.perfis p where p.usuario_id = auth.uid() limit 1),
    false
  );
$$;

-- Same equipe (both non-null and equal)
create or replace function public.same_equipe(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.perfis_equipe_id(user_a) is not null
    and public.perfis_equipe_id(user_b) is not null
    and public.perfis_equipe_id(user_a) = public.perfis_equipe_id(user_b),
    false
  );
$$;

-- Team admin sees another user's perfil if both belong to the same non-null equipe
create or replace function public.team_admin_sees_perfil(target_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.perfis me
      join public.perfis them on them.equipe_id is not distinct from me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role = 'admin'
        and me.equipe_id is not null
        and them.usuario_id = target_usuario_id
        and them.equipe_id is not null
    ),
    false
  );
$$;

-- Team admin may access another user's data when both share equipe_id
create or replace function public.team_admin_sees_user(target_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.team_admin_sees_perfil(target_usuario_id);
$$;

-- ---------------------------------------------------------------------------
-- 3) cliente_gestores: validate team + cliente_gestao when gestor has equipe
-- ---------------------------------------------------------------------------

create or replace function public.enforce_cliente_gestores_team_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  g_equipe uuid;
  c_equipe uuid;
  c_role text;
begin
  select p.equipe_id into g_equipe from public.perfis p where p.usuario_id = new.gestor_id limit 1;
  select p.equipe_id, p.role into c_equipe, c_role from public.perfis p where p.usuario_id = new.cliente_id limit 1;

  if g_equipe is not null then
    if c_role is distinct from 'cliente_gestao' then
      raise exception 'cliente_gestores: cliente deve ter role cliente_gestao quando o gestor pertence a uma equipe (equipe_id definido).';
    end if;
    if c_equipe is distinct from g_equipe then
      raise exception 'cliente_gestores: cliente e gestor devem ter o mesmo equipe_id.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cliente_gestores_team_rules on public.cliente_gestores;
create trigger trg_cliente_gestores_team_rules
  before insert or update on public.cliente_gestores
  for each row
  execute procedure public.enforce_cliente_gestores_team_rules();

-- ---------------------------------------------------------------------------
-- 4) CS / admin helpers (team via perfis.equipe_id + legacy cs_gestores / equipes)
-- ---------------------------------------------------------------------------

create or replace function public.cs_can_access_gestor(target_gestor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.perfis pcs
      join public.perfis pg on pg.equipe_id is not distinct from pcs.equipe_id and pg.role = 'gestor'
      where pcs.usuario_id = auth.uid()
        and pcs.role = 'cs'
        and pcs.equipe_id is not null
        and pg.usuario_id = target_gestor_id
    )
    or exists (
      select 1
      from public.cs_gestores cg
      where cg.cs_id = auth.uid()
        and cg.gestor_id = target_gestor_id
    )
    or exists (
      select 1
      from public.equipe_cs ec
      join public.equipe_gestores eg on eg.equipe_id = ec.equipe_id
      where ec.cs_id = auth.uid()
        and eg.gestor_id = target_gestor_id
    ),
    false
  );
$$;

create or replace function public.can_cs_manage_gestor(target_gestor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs_can_access_gestor(target_gestor_id);
$$;

create or replace function public.can_cs_view_client(target_cliente_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_legacy_platform_admin() then
    return true;
  end if;

  if public.team_admin_sees_user(target_cliente_id) then
    return true;
  end if;

  if exists (
    select 1
    from public.perfis pcs
    join public.perfis pgest on pgest.equipe_id is not distinct from pcs.equipe_id and pgest.role = 'gestor'
    join public.cliente_gestores cg2 on cg2.gestor_id = pgest.usuario_id
    where pcs.usuario_id = auth.uid()
      and pcs.role = 'cs'
      and pcs.equipe_id is not null
      and cg2.cliente_id = target_cliente_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.cs_gestores cg
    join public.cliente_gestores cg2 on cg2.gestor_id = cg.gestor_id
    where cg.cs_id = auth.uid()
      and cg2.cliente_id = target_cliente_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.equipe_cs ec
    join public.equipe_gestores eg on eg.equipe_id = ec.equipe_id
    join public.cliente_gestores cg2 on cg2.gestor_id = eg.gestor_id
    where ec.cs_id = auth.uid()
      and cg2.cliente_id = target_cliente_id
  ) then
    return true;
  end if;

  if to_regclass('public.gestor_clientes') is not null then
    if exists (
      select 1
      from public.cs_gestores cg
      join public.gestor_clientes gc on gc.gestor_id = cg.gestor_id
      where cg.cs_id = auth.uid()
        and gc.cliente_id = target_cliente_id
    ) then
      return true;
    end if;
    if exists (
      select 1
      from public.equipe_cs ec
      join public.equipe_gestores eg on eg.equipe_id = ec.equipe_id
      join public.gestor_clientes gc on gc.gestor_id = eg.gestor_id
      where ec.cs_id = auth.uid()
        and gc.cliente_id = target_cliente_id
    ) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

grant execute on function public.perfis_equipe_id(uuid) to authenticated;
grant execute on function public.current_equipe_id() to authenticated;
grant execute on function public.is_legacy_platform_admin() to authenticated;
grant execute on function public.is_any_admin() to authenticated;
grant execute on function public.same_equipe(uuid, uuid) to authenticated;
grant execute on function public.team_admin_sees_perfil(uuid) to authenticated;
grant execute on function public.team_admin_sees_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) perfis: replace open SELECT with team-aware policy
-- ---------------------------------------------------------------------------

drop policy if exists perfis_select_public on public.perfis;

create policy perfis_select_team_scoped on public.perfis
  for select
  using (
    auth.uid() = usuario_id
    or public.is_legacy_platform_admin()
    or public.team_admin_sees_perfil(usuario_id)
    or public.can_manage_client(usuario_id)
    or public.cs_can_access_gestor(usuario_id)
    or public.can_cs_view_client(usuario_id)
  );

drop policy if exists perfis_update_own_or_gestor_or_admin on public.perfis;
create policy perfis_update_own_or_gestor_or_admin on public.perfis
  for update
  using (
    auth.uid() = usuario_id
    or public.is_legacy_platform_admin()
    or public.team_admin_sees_perfil(usuario_id)
    or public.can_manage_client(usuario_id)
    or public.cs_can_access_gestor(usuario_id)
  )
  with check (
    auth.uid() = usuario_id
    or public.is_legacy_platform_admin()
    or public.team_admin_sees_perfil(usuario_id)
    or public.can_manage_client(usuario_id)
    or public.cs_can_access_gestor(usuario_id)
  );

-- ---------------------------------------------------------------------------
-- 6) equipes / equipe_cs / equipe_gestores: team admin + legacy admin
-- ---------------------------------------------------------------------------

drop policy if exists equipes_select_members on public.equipes;
create policy equipes_select_members on public.equipes
  for select
  using (
    public.is_legacy_platform_admin()
    or admin_id = auth.uid()
    or exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.equipe_id is not null
        and p.equipe_id = equipes.id
    )
    or exists (
      select 1
      from public.equipe_cs ec
      where ec.equipe_id = equipes.id
        and ec.cs_id = auth.uid()
    )
  );

drop policy if exists equipes_write_admin on public.equipes;
create policy equipes_write_scoped on public.equipes
  for all
  using (
    public.is_legacy_platform_admin()
    or (
      exists (
        select 1
        from public.perfis p
        where p.usuario_id = auth.uid()
          and p.role = 'admin'
          and p.equipe_id = equipes.id
      )
    )
  )
  with check (
    public.is_legacy_platform_admin()
    or (
      exists (
        select 1
        from public.perfis p
        where p.usuario_id = auth.uid()
          and p.role = 'admin'
          and p.equipe_id = equipes.id
      )
    )
  );

drop policy if exists equipe_cs_select_self on public.equipe_cs;
create policy equipe_cs_select_self on public.equipe_cs
  for select
  using (
    public.is_legacy_platform_admin()
    or cs_id = auth.uid()
    or exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role = 'admin'
        and p.equipe_id = equipe_cs.equipe_id
    )
  );

drop policy if exists equipe_cs_write_admin on public.equipe_cs;
create policy equipe_cs_write_scoped on public.equipe_cs
  for all
  using (
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role = 'admin'
        and p.equipe_id = equipe_cs.equipe_id
    )
  )
  with check (
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role = 'admin'
        and p.equipe_id = equipe_cs.equipe_id
    )
  );

drop policy if exists equipe_gestores_select_cs on public.equipe_gestores;
create policy equipe_gestores_select_scoped on public.equipe_gestores
  for select
  using (
    public.is_legacy_platform_admin()
    or public.cs_can_access_gestor(gestor_id)
    or exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role = 'admin'
        and p.equipe_id = equipe_gestores.equipe_id
    )
    or gestor_id = auth.uid()
  );

drop policy if exists equipe_gestores_write_admin on public.equipe_gestores;
create policy equipe_gestores_write_scoped on public.equipe_gestores
  for all
  using (
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role = 'admin'
        and p.equipe_id = equipe_gestores.equipe_id
    )
  )
  with check (
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role = 'admin'
        and p.equipe_id = equipe_gestores.equipe_id
    )
  );

-- ---------------------------------------------------------------------------
-- 7) cs_gestores: restrict team admin; legacy admin unchanged pattern via is_admin in other files —
--    keep insert/update/delete for legacy platform admin OR team admin of gestor's equipe
-- ---------------------------------------------------------------------------

drop policy if exists cs_gestores_select on public.cs_gestores;
create policy cs_gestores_select on public.cs_gestores
  for select
  using (
    cs_id = auth.uid()
    or public.is_legacy_platform_admin()
    or public.cs_can_access_gestor(gestor_id)
    or exists (
      select 1
      from public.perfis pg
      join public.perfis pa on pa.equipe_id is not distinct from pg.equipe_id
      where pg.usuario_id = gestor_id
        and pg.equipe_id is not null
        and pa.usuario_id = auth.uid()
        and pa.role = 'admin'
        and pa.equipe_id is not null
    )
  );

drop policy if exists cs_gestores_insert on public.cs_gestores;
create policy cs_gestores_insert on public.cs_gestores
  for insert
  with check (
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.perfis pg
      join public.perfis pa on pa.equipe_id is not distinct from pg.equipe_id
      where pg.usuario_id = gestor_id
        and pg.equipe_id is not null
        and pa.usuario_id = auth.uid()
        and pa.role = 'admin'
        and pa.equipe_id is not null
    )
  );

drop policy if exists cs_gestores_update on public.cs_gestores;
create policy cs_gestores_update on public.cs_gestores
  for update
  using (
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.perfis pg
      join public.perfis pa on pa.equipe_id is not distinct from pg.equipe_id
      where pg.usuario_id = gestor_id
        and pg.equipe_id is not null
        and pa.usuario_id = auth.uid()
        and pa.role = 'admin'
        and pa.equipe_id is not null
    )
  )
  with check (
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.perfis pg
      join public.perfis pa on pa.equipe_id is not distinct from pg.equipe_id
      where pg.usuario_id = gestor_id
        and pg.equipe_id is not null
        and pa.usuario_id = auth.uid()
        and pa.role = 'admin'
        and pa.equipe_id is not null
    )
  );

drop policy if exists cs_gestores_delete on public.cs_gestores;
create policy cs_gestores_delete on public.cs_gestores
  for delete
  using (
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.perfis pg
      join public.perfis pa on pa.equipe_id is not distinct from pg.equipe_id
      where pg.usuario_id = gestor_id
        and pg.equipe_id is not null
        and pa.usuario_id = auth.uid()
        and pa.role = 'admin'
        and pa.equipe_id is not null
    )
  );

-- ---------------------------------------------------------------------------
-- 8) cliente_gestores SELECT: gestor sees own links; CS team; legacy; team admin sees team links
-- ---------------------------------------------------------------------------

drop policy if exists cliente_gestores_select on public.cliente_gestores;
drop policy if exists cliente_gestores_select_cs_team on public.cliente_gestores;

create policy cliente_gestores_select_scoped on public.cliente_gestores
  for select
  using (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or cliente_id = auth.uid()
    or public.cs_can_access_gestor(gestor_id)
    or exists (
      select 1
      from public.perfis pg
      join public.perfis pa on pa.equipe_id is not distinct from pg.equipe_id
      where pg.usuario_id = gestor_id
        and pg.equipe_id is not null
        and pa.usuario_id = auth.uid()
        and pa.role = 'admin'
        and pa.equipe_id is not null
    )
  );

-- Gestor / legacy admin insert-update-delete (unchanged pattern + team admin)
drop policy if exists cliente_gestores_insert on public.cliente_gestores;
create policy cliente_gestores_insert on public.cliente_gestores
  for insert
  with check (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_cs_manage_gestor(gestor_id)
    or exists (
      select 1
      from public.perfis pg
      join public.perfis pa on pa.equipe_id is not distinct from pg.equipe_id
      where pg.usuario_id = gestor_id
        and pg.equipe_id is not null
        and pa.usuario_id = auth.uid()
        and pa.role = 'admin'
        and pa.equipe_id is not null
    )
  );

drop policy if exists cliente_gestores_update on public.cliente_gestores;
create policy cliente_gestores_update on public.cliente_gestores
  for update
  using (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_cs_manage_gestor(gestor_id)
    or exists (
      select 1
      from public.perfis pg
      join public.perfis pa on pa.equipe_id is not distinct from pg.equipe_id
      where pg.usuario_id = gestor_id
        and pg.equipe_id is not null
        and pa.usuario_id = auth.uid()
        and pa.role = 'admin'
        and pa.equipe_id is not null
    )
  )
  with check (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_cs_manage_gestor(gestor_id)
    or exists (
      select 1
      from public.perfis pg
      join public.perfis pa on pa.equipe_id is not distinct from pg.equipe_id
      where pg.usuario_id = gestor_id
        and pg.equipe_id is not null
        and pa.usuario_id = auth.uid()
        and pa.role = 'admin'
        and pa.equipe_id is not null
    )
  );

drop policy if exists cliente_gestores_delete on public.cliente_gestores;
create policy cliente_gestores_delete on public.cliente_gestores
  for delete
  using (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_cs_manage_gestor(gestor_id)
    or exists (
      select 1
      from public.perfis pg
      join public.perfis pa on pa.equipe_id is not distinct from pg.equipe_id
      where pg.usuario_id = gestor_id
        and pg.equipe_id is not null
        and pa.usuario_id = auth.uid()
        and pa.role = 'admin'
        and pa.equipe_id is not null
    )
  );

drop policy if exists cliente_gestores_insert_cs on public.cliente_gestores;
create policy cliente_gestores_insert_cs on public.cliente_gestores
  for insert
  with check (public.can_cs_manage_gestor(gestor_id));

drop policy if exists cliente_gestores_delete_cs on public.cliente_gestores;
create policy cliente_gestores_delete_cs on public.cliente_gestores
  for delete
  using (public.can_cs_manage_gestor(gestor_id));

-- ---------------------------------------------------------------------------
-- 9) logs_acoes: CS supervision uses cs_can_access_gestor (already updated)
-- ---------------------------------------------------------------------------

drop policy if exists logs_acoes_select_cs_supervision on public.logs_acoes;
create policy logs_acoes_select_cs_supervision on public.logs_acoes
  for select
  using (public.cs_can_access_gestor(logs_acoes.user_id));

-- ---------------------------------------------------------------------------
-- 10) can_manage_client: team admin + legacy admin split (gestão na equipe)
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_client(target_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() = target_cliente_id
    or public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.cliente_gestores cg
      where cg.gestor_id = auth.uid()
        and cg.cliente_id = target_cliente_id
    )
    or exists (
      select 1
      from public.perfis me
      join public.perfis c on c.equipe_id is not distinct from me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role = 'admin'
        and me.equipe_id is not null
        and c.usuario_id = target_cliente_id
        and c.equipe_id is not null
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 11) is_admin() = apenas admin global (equipe_id nulo); evita vazamento cross-team
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_legacy_platform_admin();
$$;

-- ---------------------------------------------------------------------------
-- 12) Reuniões: admin de equipe + legacy admin (substitui is_admin() nas policies)
-- ---------------------------------------------------------------------------

create or replace function public.can_admin_equipe(target_equipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role = 'admin'
        and p.equipe_id is not null
        and p.equipe_id = target_equipe_id
    ),
    false
  );
$$;

create or replace function public.can_access_equipe(target_equipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.equipe_id is not null
        and p.equipe_id = target_equipe_id
    )
    or exists (
      select 1
      from public.equipe_cs ec
      where ec.equipe_id = target_equipe_id
        and ec.cs_id = auth.uid()
    )
    or exists (
      select 1
      from public.equipe_gestores eg
      where eg.equipe_id = target_equipe_id
        and eg.gestor_id = auth.uid()
    ),
    false
  );
$$;

grant execute on function public.can_admin_equipe(uuid) to authenticated;

drop policy if exists reunioes_onboarding_select on public.reunioes_onboarding;
create policy reunioes_onboarding_select on public.reunioes_onboarding
  for select
  using (
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(equipe_id)
    or created_by = auth.uid()
    or public.can_access_equipe(equipe_id)
    or exists (
      select 1
      from public.reunioes_onboarding_participantes rp
      where rp.reuniao_id = reunioes_onboarding.id
        and rp.usuario_id = auth.uid()
    )
  );

drop policy if exists reunioes_onboarding_insert on public.reunioes_onboarding;
create policy reunioes_onboarding_insert on public.reunioes_onboarding
  for insert
  with check (
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(equipe_id)
    or (
      created_by = auth.uid()
      and public.can_access_equipe(equipe_id)
    )
  );

drop policy if exists reunioes_onboarding_update on public.reunioes_onboarding;
create policy reunioes_onboarding_update on public.reunioes_onboarding
  for update
  using (
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(equipe_id)
    or created_by = auth.uid()
    or public.can_access_equipe(equipe_id)
  )
  with check (
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(equipe_id)
    or created_by = auth.uid()
    or public.can_access_equipe(equipe_id)
  );

drop policy if exists reunioes_onboarding_delete on public.reunioes_onboarding;
create policy reunioes_onboarding_delete on public.reunioes_onboarding
  for delete
  using (
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(equipe_id)
    or created_by = auth.uid()
    or public.can_access_equipe(equipe_id)
  );

drop policy if exists reunioes_participantes_select on public.reunioes_onboarding_participantes;
create policy reunioes_participantes_select on public.reunioes_onboarding_participantes
  for select
  using (
    public.is_legacy_platform_admin()
    or usuario_id = auth.uid()
    or exists (
      select 1
      from public.reunioes_onboarding r
      where r.id = reunioes_onboarding_participantes.reuniao_id
        and public.can_admin_equipe(r.equipe_id)
    )
    or exists (
      select 1
      from public.reunioes_onboarding r
      where r.id = reunioes_onboarding_participantes.reuniao_id
        and public.can_access_equipe(r.equipe_id)
    )
  );

drop policy if exists reunioes_participantes_insert on public.reunioes_onboarding_participantes;
create policy reunioes_participantes_insert on public.reunioes_onboarding_participantes
  for insert
  with check (
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.reunioes_onboarding r
      where r.id = reunioes_onboarding_participantes.reuniao_id
        and (
          public.can_admin_equipe(r.equipe_id)
          or r.created_by = auth.uid()
          or public.can_access_equipe(r.equipe_id)
        )
    )
  );

drop policy if exists reunioes_participantes_delete on public.reunioes_onboarding_participantes;
create policy reunioes_participantes_delete on public.reunioes_onboarding_participantes
  for delete
  using (
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.reunioes_onboarding r
      where r.id = reunioes_onboarding_participantes.reuniao_id
        and (
          public.can_admin_equipe(r.equipe_id)
          or r.created_by = auth.uid()
          or public.can_access_equipe(r.equipe_id)
        )
    )
  );
