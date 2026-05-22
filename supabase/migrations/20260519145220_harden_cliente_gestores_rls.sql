begin;

alter table public.cliente_gestores enable row level security;

drop policy if exists cliente_gestores_select on public.cliente_gestores;
drop policy if exists cliente_gestores_select_admin_equipe on public.cliente_gestores;
drop policy if exists cliente_gestores_select_cs_team on public.cliente_gestores;
drop policy if exists cliente_gestores_insert on public.cliente_gestores;
drop policy if exists cliente_gestores_insert_cs on public.cliente_gestores;
drop policy if exists cliente_gestores_insert_staff on public.cliente_gestores;
drop policy if exists cliente_gestores_update on public.cliente_gestores;
drop policy if exists cliente_gestores_delete on public.cliente_gestores;
drop policy if exists cliente_gestores_delete_admin_equipe on public.cliente_gestores;

create policy cliente_gestores_select_scoped
on public.cliente_gestores
for select
to authenticated
using (
  cliente_id = auth.uid()
  or gestor_id = auth.uid()
  or public.cs_can_access_gestor(gestor_id)
  or exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role, ''))) in ('admin_master', 'admin_geral')
  )
  or exists (
    select 1
    from public.perfis actor
    join public.equipe_gestores eg on eg.gestor_id = public.cliente_gestores.gestor_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and actor.equipe_id = eg.equipe_id
  )
);

create policy cliente_gestores_insert_scoped
on public.cliente_gestores
for insert
to authenticated
with check (
  exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and (
        lower(trim(coalesce(actor.role, ''))) = 'admin_master'
        or (lower(trim(coalesce(actor.role, ''))) = 'admin' and actor.equipe_id is null)
      )
  )
  or (
    gestor_id = auth.uid()
    and exists (
      select 1
      from public.perfis cliente
      where cliente.usuario_id = public.cliente_gestores.cliente_id
        and lower(trim(coalesce(cliente.role, ''))) in ('cliente', 'cliente_gestao')
    )
  )
  or (
    public.cs_can_access_gestor(gestor_id)
    and exists (
      select 1
      from public.perfis cliente
      where cliente.usuario_id = public.cliente_gestores.cliente_id
        and lower(trim(coalesce(cliente.role, ''))) in ('cliente', 'cliente_gestao')
    )
  )
  or exists (
    select 1
    from public.perfis actor
    join public.equipe_gestores eg on eg.gestor_id = public.cliente_gestores.gestor_id
    left join public.perfis cliente on cliente.usuario_id = public.cliente_gestores.cliente_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and actor.equipe_id = eg.equipe_id
      and lower(trim(coalesce(cliente.role, ''))) in ('cliente', 'cliente_gestao')
      and (cliente.equipe_id is null or cliente.equipe_id = actor.equipe_id)
  )
);

create policy cliente_gestores_update_scoped
on public.cliente_gestores
for update
to authenticated
using (
  exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and (
        lower(trim(coalesce(actor.role, ''))) = 'admin_master'
        or (lower(trim(coalesce(actor.role, ''))) = 'admin' and actor.equipe_id is null)
      )
  )
)
with check (
  exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and (
        lower(trim(coalesce(actor.role, ''))) = 'admin_master'
        or (lower(trim(coalesce(actor.role, ''))) = 'admin' and actor.equipe_id is null)
      )
  )
);

create policy cliente_gestores_delete_scoped
on public.cliente_gestores
for delete
to authenticated
using (
  gestor_id = auth.uid()
  or public.cs_can_access_gestor(gestor_id)
  or exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and (
        lower(trim(coalesce(actor.role, ''))) = 'admin_master'
        or (lower(trim(coalesce(actor.role, ''))) = 'admin' and actor.equipe_id is null)
      )
  )
  or exists (
    select 1
    from public.perfis actor
    join public.equipe_gestores eg on eg.gestor_id = public.cliente_gestores.gestor_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and actor.equipe_id = eg.equipe_id
  )
);

commit;
