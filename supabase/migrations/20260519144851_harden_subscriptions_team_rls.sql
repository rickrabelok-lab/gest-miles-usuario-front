begin;

alter table public.subscriptions enable row level security;

drop policy if exists subscriptions_select_admin on public.subscriptions;
drop policy if exists subscriptions_insert_admin on public.subscriptions;
drop policy if exists subscriptions_update_admin on public.subscriptions;
drop policy if exists subscriptions_delete_admin on public.subscriptions;

create policy subscriptions_select_admin
on public.subscriptions
for select
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
          and actor.equipe_id is not null
          and public.subscriptions.equipe_id = actor.equipe_id
        )
      )
  )
);

create policy subscriptions_insert_admin
on public.subscriptions
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
          and actor.equipe_id is not null
          and public.subscriptions.equipe_id = actor.equipe_id
        )
      )
  )
);

create policy subscriptions_update_admin
on public.subscriptions
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
          and actor.equipe_id is not null
          and public.subscriptions.equipe_id = actor.equipe_id
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
          and actor.equipe_id is not null
          and public.subscriptions.equipe_id = actor.equipe_id
        )
      )
  )
);

create policy subscriptions_delete_admin
on public.subscriptions
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
