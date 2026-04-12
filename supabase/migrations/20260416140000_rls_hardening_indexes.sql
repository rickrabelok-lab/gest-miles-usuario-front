-- =============================================================================
-- Prompt 4 — RLS hardening, tenant isolation gaps, composite indexes
--
-- Fixes:
--   1) organizacoes_cliente: ENABLE RLS + policies (CRITICAL — was wide open)
--   2) insights_cliente: add team admin SELECT/UPDATE visibility
--   3) perfis: safety-net ENABLE RLS (idempotent)
--   4) Composite indexes for real query patterns
--   5) Drop redundant single-column indexes covered by composites
-- =============================================================================

-- =========================================================================
-- 1) organizacoes_cliente — was created WITHOUT RLS
-- =========================================================================

alter table public.organizacoes_cliente enable row level security;

-- SELECT: legacy platform admin, team admin of the org's creator equipe,
--         or the creator themselves
drop policy if exists organizacoes_cliente_select on public.organizacoes_cliente;
create policy organizacoes_cliente_select on public.organizacoes_cliente
  for select
  to authenticated
  using (
    public.is_legacy_platform_admin()
    or created_by = auth.uid()
    or exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role = 'admin'
        and p.equipe_id is not null
        and p.equipe_id = (
          select p2.equipe_id
          from public.perfis p2
          where p2.usuario_id = organizacoes_cliente.created_by
          limit 1
        )
    )
    or exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.organizacao_id = organizacoes_cliente.id
    )
  );

-- INSERT: legacy admin, team admin, or authenticated users creating their own org
drop policy if exists organizacoes_cliente_insert on public.organizacoes_cliente;
create policy organizacoes_cliente_insert on public.organizacoes_cliente
  for insert
  to authenticated
  with check (
    public.is_legacy_platform_admin()
    or created_by = auth.uid()
  );

-- UPDATE: legacy admin or the creator
drop policy if exists organizacoes_cliente_update on public.organizacoes_cliente;
create policy organizacoes_cliente_update on public.organizacoes_cliente
  for update
  to authenticated
  using (
    public.is_legacy_platform_admin()
    or created_by = auth.uid()
  )
  with check (
    public.is_legacy_platform_admin()
    or created_by = auth.uid()
  );

-- DELETE: legacy admin only (orgs should not be casually deleted)
drop policy if exists organizacoes_cliente_delete on public.organizacoes_cliente;
create policy organizacoes_cliente_delete on public.organizacoes_cliente
  for delete
  to authenticated
  using (
    public.is_legacy_platform_admin()
  );

-- =========================================================================
-- 2) insights_cliente — team admin gap (could not see insights of their team)
-- =========================================================================

drop policy if exists insights_cliente_select on public.insights_cliente;
create policy insights_cliente_select on public.insights_cliente
  for select
  using (
    public.is_legacy_platform_admin()
    or (gestor_id = auth.uid())
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or (equipe_id is not null and public.rls_team_admin_matches_equipe(equipe_id))
  );

drop policy if exists insights_cliente_update on public.insights_cliente;
create policy insights_cliente_update on public.insights_cliente
  for update
  using (
    public.is_legacy_platform_admin()
    or (gestor_id = auth.uid())
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or (equipe_id is not null and public.rls_team_admin_matches_equipe(equipe_id))
  )
  with check (
    public.is_legacy_platform_admin()
    or (gestor_id = auth.uid())
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or (equipe_id is not null and public.rls_team_admin_matches_equipe(equipe_id))
  );

-- =========================================================================
-- 3) perfis — safety net: ENABLE RLS idempotent
--    (May already be enabled outside migrations; this is a guardrail.)
-- =========================================================================

alter table public.perfis enable row level security;

-- =========================================================================
-- 4) Composite indexes for real query patterns
-- =========================================================================

-- demandas_cliente: common listing filtered by client + status + date
create index if not exists idx_demandas_cliente_cliente_status_created
  on public.demandas_cliente (cliente_id, status, created_at desc);

-- perfis: team + role lookups (e.g. find all gestores in a team)
create index if not exists idx_perfis_equipe_role
  on public.perfis (equipe_id, role);

-- emissoes: listing by client + date (common in gestor dashboard)
create index if not exists idx_emissoes_cliente_data
  on public.emissoes (cliente_id, data_emissao desc);

-- logs_acoes: listing by user + date (common in log screens)
create index if not exists idx_logs_acoes_user_timestamp
  on public.logs_acoes (user_id, timestamp desc);

-- =========================================================================
-- 5) Drop redundant single-column indexes covered by composites
-- =========================================================================

-- idx_audit_logs_equipe_id is a prefix of idx_audit_logs_equipe_created
drop index if exists idx_audit_logs_equipe_id;

-- idx_audit_logs_user_id is a prefix of idx_audit_logs_user_created
drop index if exists idx_audit_logs_user_id;

-- idx_nps_convites_cliente is a prefix of idx_nps_convites_pending
drop index if exists idx_nps_convites_cliente;
