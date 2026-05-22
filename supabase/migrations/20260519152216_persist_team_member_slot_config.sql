create table if not exists public.gestor_funcoes (
  gestor_id uuid primary key references public.perfis(usuario_id) on delete cascade,
  funcao text not null check (funcao in ('nacional', 'internacional')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.equipe_gestor_slots (
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  gestor_id uuid not null references public.perfis(usuario_id) on delete cascade,
  slot integer not null check (slot > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (equipe_id, gestor_id)
);

create table if not exists public.equipe_cs_slot_assignments (
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  slot integer not null check (slot > 0),
  cs_id uuid not null references public.perfis(usuario_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (equipe_id, slot, cs_id)
);

create index if not exists equipe_gestor_slots_gestor_id_idx
  on public.equipe_gestor_slots(gestor_id);

create index if not exists equipe_cs_slot_assignments_cs_id_idx
  on public.equipe_cs_slot_assignments(cs_id);

alter table public.gestor_funcoes enable row level security;
alter table public.equipe_gestor_slots enable row level security;
alter table public.equipe_cs_slot_assignments enable row level security;

drop policy if exists gestor_funcoes_select_scoped on public.gestor_funcoes;
drop policy if exists gestor_funcoes_insert_scoped on public.gestor_funcoes;
drop policy if exists gestor_funcoes_update_scoped on public.gestor_funcoes;
drop policy if exists gestor_funcoes_delete_scoped on public.gestor_funcoes;
drop policy if exists equipe_gestor_slots_select_scoped on public.equipe_gestor_slots;
drop policy if exists equipe_gestor_slots_insert_scoped on public.equipe_gestor_slots;
drop policy if exists equipe_gestor_slots_update_scoped on public.equipe_gestor_slots;
drop policy if exists equipe_gestor_slots_delete_scoped on public.equipe_gestor_slots;
drop policy if exists equipe_cs_slot_assignments_select_scoped on public.equipe_cs_slot_assignments;
drop policy if exists equipe_cs_slot_assignments_insert_scoped on public.equipe_cs_slot_assignments;
drop policy if exists equipe_cs_slot_assignments_update_scoped on public.equipe_cs_slot_assignments;
drop policy if exists equipe_cs_slot_assignments_delete_scoped on public.equipe_cs_slot_assignments;

create policy gestor_funcoes_select_scoped
on public.gestor_funcoes
for select
to authenticated
using (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis gestor on gestor.usuario_id = public.gestor_funcoes.gestor_id
    left join public.equipe_gestores eg on eg.gestor_id = public.gestor_funcoes.gestor_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and (
        gestor.equipe_id = actor.equipe_id
        or eg.equipe_id = actor.equipe_id
      )
  )
);

create policy gestor_funcoes_insert_scoped
on public.gestor_funcoes
for insert
to authenticated
with check (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis gestor on gestor.usuario_id = public.gestor_funcoes.gestor_id
    left join public.equipe_gestores eg on eg.gestor_id = public.gestor_funcoes.gestor_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and lower(trim(coalesce(gestor.role::text, ''))) = 'gestor'
      and (
        gestor.equipe_id = actor.equipe_id
        or eg.equipe_id = actor.equipe_id
      )
  )
);

create policy gestor_funcoes_update_scoped
on public.gestor_funcoes
for update
to authenticated
using (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis gestor on gestor.usuario_id = public.gestor_funcoes.gestor_id
    left join public.equipe_gestores eg on eg.gestor_id = public.gestor_funcoes.gestor_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and lower(trim(coalesce(gestor.role::text, ''))) = 'gestor'
      and (
        gestor.equipe_id = actor.equipe_id
        or eg.equipe_id = actor.equipe_id
      )
  )
)
with check (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis gestor on gestor.usuario_id = public.gestor_funcoes.gestor_id
    left join public.equipe_gestores eg on eg.gestor_id = public.gestor_funcoes.gestor_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and lower(trim(coalesce(gestor.role::text, ''))) = 'gestor'
      and (
        gestor.equipe_id = actor.equipe_id
        or eg.equipe_id = actor.equipe_id
      )
  )
);

create policy gestor_funcoes_delete_scoped
on public.gestor_funcoes
for delete
to authenticated
using (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis gestor on gestor.usuario_id = public.gestor_funcoes.gestor_id
    left join public.equipe_gestores eg on eg.gestor_id = public.gestor_funcoes.gestor_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id is not null
      and lower(trim(coalesce(gestor.role::text, ''))) = 'gestor'
      and (
        gestor.equipe_id = actor.equipe_id
        or eg.equipe_id = actor.equipe_id
      )
  )
);

create policy equipe_gestor_slots_select_scoped
on public.equipe_gestor_slots
for select
to authenticated
using (
  public.is_admin_global_or_master()
  or public.equipe_usuario_eh_membro_ativo(equipe_id, auth.uid())
);

create policy equipe_gestor_slots_insert_scoped
on public.equipe_gestor_slots
for insert
to authenticated
with check (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis gestor on gestor.usuario_id = public.equipe_gestor_slots.gestor_id
    left join public.equipe_gestores eg
      on eg.equipe_id = public.equipe_gestor_slots.equipe_id
     and eg.gestor_id = public.equipe_gestor_slots.gestor_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id = public.equipe_gestor_slots.equipe_id
      and lower(trim(coalesce(gestor.role::text, ''))) = 'gestor'
      and (
        gestor.equipe_id = public.equipe_gestor_slots.equipe_id
        or eg.gestor_id is not null
      )
  )
);

create policy equipe_gestor_slots_update_scoped
on public.equipe_gestor_slots
for update
to authenticated
using (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id = public.equipe_gestor_slots.equipe_id
  )
)
with check (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis gestor on gestor.usuario_id = public.equipe_gestor_slots.gestor_id
    left join public.equipe_gestores eg
      on eg.equipe_id = public.equipe_gestor_slots.equipe_id
     and eg.gestor_id = public.equipe_gestor_slots.gestor_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id = public.equipe_gestor_slots.equipe_id
      and lower(trim(coalesce(gestor.role::text, ''))) = 'gestor'
      and (
        gestor.equipe_id = public.equipe_gestor_slots.equipe_id
        or eg.gestor_id is not null
      )
  )
);

create policy equipe_gestor_slots_delete_scoped
on public.equipe_gestor_slots
for delete
to authenticated
using (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id = public.equipe_gestor_slots.equipe_id
  )
);

create policy equipe_cs_slot_assignments_select_scoped
on public.equipe_cs_slot_assignments
for select
to authenticated
using (
  public.is_admin_global_or_master()
  or public.equipe_usuario_eh_membro_ativo(equipe_id, auth.uid())
);

create policy equipe_cs_slot_assignments_insert_scoped
on public.equipe_cs_slot_assignments
for insert
to authenticated
with check (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis cs on cs.usuario_id = public.equipe_cs_slot_assignments.cs_id
    left join public.equipe_cs ec
      on ec.equipe_id = public.equipe_cs_slot_assignments.equipe_id
     and ec.cs_id = public.equipe_cs_slot_assignments.cs_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id = public.equipe_cs_slot_assignments.equipe_id
      and lower(trim(coalesce(cs.role::text, ''))) = 'cs'
      and (
        cs.equipe_id = public.equipe_cs_slot_assignments.equipe_id
        or ec.cs_id is not null
      )
  )
);

create policy equipe_cs_slot_assignments_update_scoped
on public.equipe_cs_slot_assignments
for update
to authenticated
using (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id = public.equipe_cs_slot_assignments.equipe_id
  )
)
with check (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    join public.perfis cs on cs.usuario_id = public.equipe_cs_slot_assignments.cs_id
    left join public.equipe_cs ec
      on ec.equipe_id = public.equipe_cs_slot_assignments.equipe_id
     and ec.cs_id = public.equipe_cs_slot_assignments.cs_id
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id = public.equipe_cs_slot_assignments.equipe_id
      and lower(trim(coalesce(cs.role::text, ''))) = 'cs'
      and (
        cs.equipe_id = public.equipe_cs_slot_assignments.equipe_id
        or ec.cs_id is not null
      )
  )
);

create policy equipe_cs_slot_assignments_delete_scoped
on public.equipe_cs_slot_assignments
for delete
to authenticated
using (
  public.is_admin_global_or_master()
  or exists (
    select 1
    from public.perfis actor
    where actor.usuario_id = auth.uid()
      and lower(trim(coalesce(actor.role::text, ''))) in ('admin', 'admin_equipe')
      and actor.equipe_id = public.equipe_cs_slot_assignments.equipe_id
  )
);
