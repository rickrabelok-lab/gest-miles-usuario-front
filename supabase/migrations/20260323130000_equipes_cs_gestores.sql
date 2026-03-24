-- Equipes nomeadas: vários CS podem compartilhar os mesmos gestores; equipes diferentes têm conjuntos distintos.
-- Convive com o modelo legado public.cs_gestores (cs_id, gestor_id) — um CS pode usar só uma das formas ou ambas.
--
-- equipes → equipe_cs (quem é CS da equipe) + equipe_gestores (quais gestores a equipe supervisiona)
-- Função public.cs_can_access_gestor unifica: admin | cs_gestores | equipe_*.

create table if not exists public.equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.equipe_cs (
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  cs_id uuid not null references auth.users(id) on delete cascade,
  primary key (equipe_id, cs_id)
);

create table if not exists public.equipe_gestores (
  equipe_id uuid not null references public.equipes(id) on delete cascade,
  gestor_id uuid not null references auth.users(id) on delete cascade,
  primary key (equipe_id, gestor_id)
);

create index if not exists idx_equipe_cs_cs_id on public.equipe_cs(cs_id);
create index if not exists idx_equipe_gestores_gestor_id on public.equipe_gestores(gestor_id);

alter table public.equipes enable row level security;
alter table public.equipe_cs enable row level security;
alter table public.equipe_gestores enable row level security;

drop policy if exists equipes_select_members on public.equipes;
create policy equipes_select_members on public.equipes
  for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.equipe_cs ec
      where ec.equipe_id = equipes.id
        and ec.cs_id = auth.uid()
    )
  );

drop policy if exists equipes_write_admin on public.equipes;
create policy equipes_write_admin on public.equipes
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists equipe_cs_select_self on public.equipe_cs;
create policy equipe_cs_select_self on public.equipe_cs
  for select
  using (public.is_admin() or cs_id = auth.uid());

drop policy if exists equipe_cs_write_admin on public.equipe_cs;
create policy equipe_cs_write_admin on public.equipe_cs
  for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists equipe_gestores_select_cs on public.equipe_gestores;
create policy equipe_gestores_select_cs on public.equipe_gestores
  for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.equipe_cs ec
      where ec.equipe_id = equipe_gestores.equipe_id
        and ec.cs_id = auth.uid()
    )
  );

drop policy if exists equipe_gestores_write_admin on public.equipe_gestores;
create policy equipe_gestores_write_admin on public.equipe_gestores
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Acesso a um gestor: legado cs_gestores OU equipe (vários CS na mesma equipe enxergam os mesmos gestores).
create or replace function public.cs_can_access_gestor(target_gestor_id uuid)
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
      from public.cs_gestores cg
      where cg.cs_id = auth.uid()
        and cg.gestor_id = target_gestor_id
    )
    or exists (
      select 1
      from public.equipe_cs ec
      inner join public.equipe_gestores eg on eg.equipe_id = ec.equipe_id
      where ec.cs_id = auth.uid()
        and eg.gestor_id = target_gestor_id
    ),
    false
  );
$$;

grant execute on function public.cs_can_access_gestor(uuid) to authenticated;

create or replace function public.can_cs_manage_gestor(target_gestor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.cs_can_access_gestor(target_gestor_id);
$$;

-- plpgsql: ramos com gestor_clientes só se a tabela existir (projetos legados).
create or replace function public.can_cs_view_client(target_cliente_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return true;
  end if;

  if exists (
    select 1
    from public.cs_gestores cg
    inner join public.cliente_gestores cg2 on cg2.gestor_id = cg.gestor_id
    where cg.cs_id = auth.uid()
      and cg2.cliente_id = target_cliente_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.equipe_cs ec
    inner join public.equipe_gestores eg on eg.equipe_id = ec.equipe_id
    inner join public.cliente_gestores cg2 on cg2.gestor_id = eg.gestor_id
    where ec.cs_id = auth.uid()
      and cg2.cliente_id = target_cliente_id
  ) then
    return true;
  end if;

  if to_regclass('public.gestor_clientes') is not null then
    if exists (
      select 1
      from public.cs_gestores cg
      inner join public.gestor_clientes gc on gc.gestor_id = cg.gestor_id
      where cg.cs_id = auth.uid()
        and gc.cliente_id = target_cliente_id
    ) then
      return true;
    end if;
    if exists (
      select 1
      from public.equipe_cs ec
      inner join public.equipe_gestores eg on eg.equipe_id = ec.equipe_id
      inner join public.gestor_clientes gc on gc.gestor_id = eg.gestor_id
      where ec.cs_id = auth.uid()
        and gc.cliente_id = target_cliente_id
    ) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

-- cliente_gestores (CS): usar função unificada
drop policy if exists cliente_gestores_select_cs_team on public.cliente_gestores;
create policy cliente_gestores_select_cs_team on public.cliente_gestores
  for select
  using (public.cs_can_access_gestor(gestor_id));

do $m$
begin
  if to_regclass('public.gestor_clientes') is not null then
    execute 'drop policy if exists gestor_clientes_select_cs_team on public.gestor_clientes';
    execute 'create policy gestor_clientes_select_cs_team on public.gestor_clientes
      for select
      using (public.cs_can_access_gestor(gestor_id))';
  end if;
end $m$;

grant execute on function public.can_cs_view_client(uuid) to authenticated;

-- logs_acoes: CS vê ações de gestores que pode supervisionar (legado + equipe)
drop policy if exists logs_acoes_select_cs_supervision on public.logs_acoes;
create policy logs_acoes_select_cs_supervision on public.logs_acoes
  for select
  using (public.cs_can_access_gestor(logs_acoes.user_id));
