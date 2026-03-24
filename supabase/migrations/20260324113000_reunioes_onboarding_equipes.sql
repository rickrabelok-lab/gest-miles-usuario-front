-- Agenda de reuniões de onboarding por equipe (CS/gestores/admin).
-- Objetivo:
-- 1) CS agenda reunião para equipe específica;
-- 2) participantes (gestor/cs/admin) recebem notificação in-app;
-- 3) leitura restrita a quem participa ou pertence à equipe da reunião.

create table if not exists public.reunioes_onboarding (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  cliente_id uuid null references auth.users(id) on delete set null,
  titulo text not null,
  descricao text null,
  starts_at timestamptz not null,
  ends_at timestamptz null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_reunioes_onboarding_equipe_id on public.reunioes_onboarding(equipe_id);
create index if not exists idx_reunioes_onboarding_cliente_id on public.reunioes_onboarding(cliente_id);
create index if not exists idx_reunioes_onboarding_starts_at on public.reunioes_onboarding(starts_at);

create table if not exists public.reunioes_onboarding_participantes (
  reuniao_id uuid not null references public.reunioes_onboarding(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reuniao_id, usuario_id)
);

create index if not exists idx_reunioes_participantes_usuario_id
  on public.reunioes_onboarding_participantes(usuario_id);

create or replace function public.can_access_equipe(target_equipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_admin()
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

grant execute on function public.can_access_equipe(uuid) to authenticated;

alter table public.reunioes_onboarding enable row level security;
alter table public.reunioes_onboarding_participantes enable row level security;

drop policy if exists reunioes_onboarding_select on public.reunioes_onboarding;
create policy reunioes_onboarding_select on public.reunioes_onboarding
  for select
  using (
    public.is_admin()
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
    public.is_admin()
    or (
      created_by = auth.uid()
      and public.can_access_equipe(equipe_id)
    )
  );

drop policy if exists reunioes_onboarding_update on public.reunioes_onboarding;
create policy reunioes_onboarding_update on public.reunioes_onboarding
  for update
  using (
    public.is_admin()
    or created_by = auth.uid()
    or public.can_access_equipe(equipe_id)
  )
  with check (
    public.is_admin()
    or created_by = auth.uid()
    or public.can_access_equipe(equipe_id)
  );

drop policy if exists reunioes_onboarding_delete on public.reunioes_onboarding;
create policy reunioes_onboarding_delete on public.reunioes_onboarding
  for delete
  using (
    public.is_admin()
    or created_by = auth.uid()
    or public.can_access_equipe(equipe_id)
  );

drop policy if exists reunioes_participantes_select on public.reunioes_onboarding_participantes;
create policy reunioes_participantes_select on public.reunioes_onboarding_participantes
  for select
  using (
    public.is_admin()
    or usuario_id = auth.uid()
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
    public.is_admin()
    or exists (
      select 1
      from public.reunioes_onboarding r
      where r.id = reunioes_onboarding_participantes.reuniao_id
        and (
          r.created_by = auth.uid()
          or public.can_access_equipe(r.equipe_id)
        )
    )
  );

drop policy if exists reunioes_participantes_delete on public.reunioes_onboarding_participantes;
create policy reunioes_participantes_delete on public.reunioes_onboarding_participantes
  for delete
  using (
    public.is_admin()
    or exists (
      select 1
      from public.reunioes_onboarding r
      where r.id = reunioes_onboarding_participantes.reuniao_id
        and (
          r.created_by = auth.uid()
          or public.can_access_equipe(r.equipe_id)
        )
    )
  );
