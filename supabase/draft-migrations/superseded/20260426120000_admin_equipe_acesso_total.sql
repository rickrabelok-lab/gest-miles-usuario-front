-- ============================================================
-- ACESSO TOTAL PARA admin_equipe – COLE TUDO NO SQL EDITOR
-- ============================================================
-- Este script corrige de uma vez só:
--   1. can_manage_client  → inclui admin_equipe via perfis.equipe_id e via gestor da equipa
--   2. team_admin_sees_perfil → lê perfis de toda a equipa
--   3. can_admin_equipe        → políticas de reuniões etc.
--   4. Políticas diretas em programas_cliente / emissoes → sem depender da função,
--      para contornar possível cache do Postgres.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Função can_manage_client
-- ------------------------------------------------------------
create or replace function public.can_manage_client(target_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- Próprio utilizador
    auth.uid() = target_cliente_id

    -- Plataforma (admin global legado)
    or public.is_legacy_platform_admin()

    -- Gestor direto (cliente_gestores)
    or exists (
      select 1
      from public.cliente_gestores cg
      where cg.gestor_id = auth.uid()
        and cg.cliente_id = target_cliente_id
    )

    -- Gestor direto legado (gestor_clientes)
    or exists (
      select 1
      from public.gestor_clientes gc
      where gc.gestor_id = auth.uid()
        and gc.cliente_id = target_cliente_id
    )

    -- admin / admin_equipe: cliente na mesma equipe (perfis.equipe_id)
    or exists (
      select 1
      from public.perfis me
      join public.perfis c on c.equipe_id = me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and c.usuario_id = target_cliente_id
        and c.equipe_id is not null
    )

    -- admin / admin_equipe: cliente acompanhado por gestor da mesma equipe (perfis.equipe_id)
    or exists (
      select 1
      from public.cliente_gestores cg
      join public.perfis g  on g.usuario_id  = cg.gestor_id
      join public.perfis me on me.usuario_id = auth.uid()
      where cg.cliente_id = target_cliente_id
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and g.equipe_id = me.equipe_id
    )

    -- admin / admin_equipe: cliente acompanhado por gestor em equipe_gestores
    or exists (
      select 1
      from public.cliente_gestores cg
      inner join public.equipe_gestores eg on eg.gestor_id = cg.gestor_id
      join public.perfis me on me.usuario_id = auth.uid()
      where cg.cliente_id = target_cliente_id
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and eg.equipe_id = me.equipe_id
    )

    -- admin_equipe via equipe_admin + equipe_clientes
    or exists (
      select 1
      from public.equipe_clientes ec
      inner join public.equipe_admin ea
        on ea.equipe_id = ec.equipe_id
        and ea.ativo = true
      where ec.cliente_id = target_cliente_id
        and ec.ativo = true
        and (
          ea.admin_equipe_id_1 = auth.uid()
          or ea.admin_equipe_id_2 = auth.uid()
          or ea.admin_equipe_id_3 = auth.uid()
        )
    )

    -- CS supervisionado
    or public.can_cs_view_client(target_cliente_id),

    false
  );
$$;

comment on function public.can_manage_client(uuid) is
  'Gestor, CS, admin ou admin_equipe (mesma equipa via perfis, equipe_gestores ou equipe_admin+equipe_clientes).';

-- ------------------------------------------------------------
-- 2. Funções de visibilidade de perfis
-- ------------------------------------------------------------
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
      join public.perfis them on them.equipe_id = me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and them.usuario_id = target_usuario_id
        and them.equipe_id is not null
    ),
    false
  );
$$;

create or replace function public.team_admin_sees_user(target_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.team_admin_sees_perfil(target_usuario_id);
$$;

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
        and p.role in ('admin', 'admin_equipe')
        and p.equipe_id is not null
        and p.equipe_id = target_equipe_id
    ),
    false
  );
$$;

-- ------------------------------------------------------------
-- 3. Políticas diretas em programas_cliente (sem depender da função)
-- ------------------------------------------------------------
drop policy if exists programas_cliente_select_admin_equipe on public.programas_cliente;
create policy programas_cliente_select_admin_equipe
  on public.programas_cliente
  for select
  using (
    exists (
      select 1
      from public.perfis me
      join public.perfis c on c.equipe_id = me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and c.usuario_id = programas_cliente.cliente_id
        and c.equipe_id is not null
    )
    or exists (
      select 1
      from public.cliente_gestores cg
      join public.perfis g  on g.usuario_id  = cg.gestor_id
      join public.perfis me on me.usuario_id = auth.uid()
      where cg.cliente_id = programas_cliente.cliente_id
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and g.equipe_id = me.equipe_id
    )
  );

drop policy if exists programas_cliente_all_admin_equipe on public.programas_cliente;
create policy programas_cliente_all_admin_equipe
  on public.programas_cliente
  for all
  using (
    exists (
      select 1
      from public.perfis me
      join public.perfis c on c.equipe_id = me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and c.usuario_id = programas_cliente.cliente_id
        and c.equipe_id is not null
    )
    or exists (
      select 1
      from public.cliente_gestores cg
      join public.perfis g  on g.usuario_id  = cg.gestor_id
      join public.perfis me on me.usuario_id = auth.uid()
      where cg.cliente_id = programas_cliente.cliente_id
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and g.equipe_id = me.equipe_id
    )
  )
  with check (
    exists (
      select 1
      from public.perfis me
      join public.perfis c on c.equipe_id = me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and c.usuario_id = programas_cliente.cliente_id
        and c.equipe_id is not null
    )
    or exists (
      select 1
      from public.cliente_gestores cg
      join public.perfis g  on g.usuario_id  = cg.gestor_id
      join public.perfis me on me.usuario_id = auth.uid()
      where cg.cliente_id = programas_cliente.cliente_id
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and g.equipe_id = me.equipe_id
    )
  );

-- ------------------------------------------------------------
-- 4. Políticas diretas em emissoes para admin_equipe
-- ------------------------------------------------------------
drop policy if exists emissoes_select_admin_equipe on public.emissoes;
create policy emissoes_select_admin_equipe
  on public.emissoes
  for select
  using (
    exists (
      select 1
      from public.perfis me
      join public.perfis c on c.equipe_id = me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and c.usuario_id = emissoes.cliente_id
        and c.equipe_id is not null
    )
    or exists (
      select 1
      from public.cliente_gestores cg
      join public.perfis g  on g.usuario_id  = cg.gestor_id
      join public.perfis me on me.usuario_id = auth.uid()
      where cg.cliente_id = emissoes.cliente_id
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and g.equipe_id = me.equipe_id
    )
  );

-- ------------------------------------------------------------
-- 5. Diagnóstico rápido (não altera nada; verifique os resultados)
-- ------------------------------------------------------------
-- Descomente para ver quais linhas de programas_cliente o seu utilizador vê:
-- select id, cliente_id, program_id, program_name, saldo
--   from public.programas_cliente
--   limit 20;
