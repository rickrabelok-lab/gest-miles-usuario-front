begin;

alter table public.equipe_gestores enable row level security;
alter table public.equipe_cs enable row level security;
alter table public.cs_gestores enable row level security;

drop policy if exists equipe_gestores_select on public.equipe_gestores;
drop policy if exists equipe_gestores_select_cs on public.equipe_gestores;
drop policy if exists equipe_gestores_write on public.equipe_gestores;
drop policy if exists equipe_gestores_write_admin on public.equipe_gestores;

drop policy if exists equipe_cs_select on public.equipe_cs;
drop policy if exists equipe_cs_select_self on public.equipe_cs;
drop policy if exists equipe_cs_write on public.equipe_cs;
drop policy if exists equipe_cs_write_admin on public.equipe_cs;

drop policy if exists cs_gestores_select on public.cs_gestores;
drop policy if exists cs_gestores_insert on public.cs_gestores;
drop policy if exists cs_gestores_insert_cs_own on public.cs_gestores;
drop policy if exists cs_gestores_update on public.cs_gestores;
drop policy if exists cs_gestores_delete on public.cs_gestores;

create policy equipe_gestores_select_scoped
on public.equipe_gestores
for select
to authenticated
using (
  gestor_id = auth.uid()
  or public.equipe_usuario_eh_membro_ativo(equipe_id, auth.uid())
  or exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role, ''))) in ('admin_master', 'admin_geral')
  )
  or exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role, ''))) = 'admin'
      and (actor.equipe_id is null or actor.equipe_id = public.equipe_gestores.equipe_id)
  )
);

create policy equipe_gestores_insert_scoped
on public.equipe_gestores
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
        or (
          lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
          and actor.equipe_id = public.equipe_gestores.equipe_id
        )
      )
  )
);

create policy equipe_gestores_update_scoped
on public.equipe_gestores
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
        or (
          lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
          and actor.equipe_id = public.equipe_gestores.equipe_id
        )
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
        or (
          lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
          and actor.equipe_id = public.equipe_gestores.equipe_id
        )
      )
  )
);

create policy equipe_gestores_delete_scoped
on public.equipe_gestores
for delete
to authenticated
using (
  exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and (
        lower(trim(coalesce(actor.role, ''))) = 'admin_master'
        or (lower(trim(coalesce(actor.role, ''))) = 'admin' and actor.equipe_id is null)
        or (
          lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
          and actor.equipe_id = public.equipe_gestores.equipe_id
        )
      )
  )
);

create policy equipe_cs_select_scoped
on public.equipe_cs
for select
to authenticated
using (
  cs_id = auth.uid()
  or public.equipe_usuario_eh_membro_ativo(equipe_id, auth.uid())
  or exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role, ''))) in ('admin_master', 'admin_geral')
  )
  or exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role, ''))) = 'admin'
      and (actor.equipe_id is null or actor.equipe_id = public.equipe_cs.equipe_id)
  )
);

create policy equipe_cs_insert_scoped
on public.equipe_cs
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
        or (
          lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
          and actor.equipe_id = public.equipe_cs.equipe_id
        )
      )
  )
);

create policy equipe_cs_update_scoped
on public.equipe_cs
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
        or (
          lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
          and actor.equipe_id = public.equipe_cs.equipe_id
        )
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
        or (
          lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
          and actor.equipe_id = public.equipe_cs.equipe_id
        )
      )
  )
);

create policy equipe_cs_delete_scoped
on public.equipe_cs
for delete
to authenticated
using (
  exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and (
        lower(trim(coalesce(actor.role, ''))) = 'admin_master'
        or (lower(trim(coalesce(actor.role, ''))) = 'admin' and actor.equipe_id is null)
        or (
          lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
          and actor.equipe_id = public.equipe_cs.equipe_id
        )
      )
  )
);

create policy cs_gestores_select_scoped
on public.cs_gestores
for select
to authenticated
using (
  cs_id = auth.uid()
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
    join public.equipe_gestores eg on eg.gestor_id = public.cs_gestores.gestor_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and actor.equipe_id = eg.equipe_id
  )
);

create policy cs_gestores_insert_scoped
on public.cs_gestores
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
);

create policy cs_gestores_update_scoped
on public.cs_gestores
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

create policy cs_gestores_delete_scoped
on public.cs_gestores
for delete
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
);

commit;
