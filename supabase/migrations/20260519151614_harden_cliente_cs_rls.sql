alter table public.cliente_cs enable row level security;

drop policy if exists cliente_cs_select_admin_or_self on public.cliente_cs;
drop policy if exists cliente_cs_insert_admin_panel on public.cliente_cs;
drop policy if exists cliente_cs_update_admin_panel on public.cliente_cs;
drop policy if exists cliente_cs_delete_admin_panel on public.cliente_cs;

create policy cliente_cs_select_scoped
on public.cliente_cs
for select
to authenticated
using (
  cliente_id = auth.uid()
  or cs_id = auth.uid()
  or public.is_admin_security_viewer()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis cliente on cliente.usuario_id = public.cliente_cs.cliente_id
    left join public.equipe_cs ec on ec.cs_id = public.cliente_cs.cs_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and (
        cliente.equipe_id = actor.equipe_id
        or ec.equipe_id = actor.equipe_id
      )
  )
);

create policy cliente_cs_insert_scoped
on public.cliente_cs
for insert
to authenticated
with check (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis cliente on cliente.usuario_id = public.cliente_cs.cliente_id
    join public.perfis cs on cs.usuario_id = public.cliente_cs.cs_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and cliente.equipe_id = actor.equipe_id
      and lower(trim(coalesce(cliente.role::text, ''))) in ('cliente', 'cliente_gestao')
      and cs.equipe_id = actor.equipe_id
      and lower(trim(coalesce(cs.role::text, ''))) = 'cs'
  )
);

create policy cliente_cs_update_scoped
on public.cliente_cs
for update
to authenticated
using (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis cliente on cliente.usuario_id = public.cliente_cs.cliente_id
    join public.perfis cs on cs.usuario_id = public.cliente_cs.cs_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and cliente.equipe_id = actor.equipe_id
      and lower(trim(coalesce(cliente.role::text, ''))) in ('cliente', 'cliente_gestao')
      and cs.equipe_id = actor.equipe_id
      and lower(trim(coalesce(cs.role::text, ''))) = 'cs'
  )
)
with check (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis cliente on cliente.usuario_id = public.cliente_cs.cliente_id
    join public.perfis cs on cs.usuario_id = public.cliente_cs.cs_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and cliente.equipe_id = actor.equipe_id
      and lower(trim(coalesce(cliente.role::text, ''))) in ('cliente', 'cliente_gestao')
      and cs.equipe_id = actor.equipe_id
      and lower(trim(coalesce(cs.role::text, ''))) = 'cs'
  )
);

create policy cliente_cs_delete_scoped
on public.cliente_cs
for delete
to authenticated
using (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis cliente on cliente.usuario_id = public.cliente_cs.cliente_id
    join public.perfis cs on cs.usuario_id = public.cliente_cs.cs_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and cliente.equipe_id = actor.equipe_id
      and lower(trim(coalesce(cliente.role::text, ''))) in ('cliente', 'cliente_gestao')
      and cs.equipe_id = actor.equipe_id
      and lower(trim(coalesce(cs.role::text, ''))) = 'cs'
  )
);
