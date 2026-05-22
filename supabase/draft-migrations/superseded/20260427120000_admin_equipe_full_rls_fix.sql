-- ============================================================================
-- Migration: admin_equipe full RLS access fix
-- Date: 2026-04-27
--
-- Fixes:
-- 1. is_admin() now returns true for admin_equipe
-- 2. rls_team_admin_matches_equipe() now includes admin_equipe
-- 3. audit_logs: admin_equipe can see team logs
-- 4. insights_cliente: admin_equipe can see team insights
-- 5. logs_acoes: admin_equipe can see team logs
-- ============================================================================

-- 1. Update is_admin() to include admin_equipe
CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT coalesce(public.current_user_role() IN ('admin', 'admin_equipe'), false);
$$;

-- 2. Update rls_team_admin_matches_equipe() to include admin_equipe
CREATE OR REPLACE FUNCTION public.rls_team_admin_matches_equipe(target_equipe uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path = 'public'
AS $$
DECLARE
  ok boolean;
BEGIN
  IF target_equipe IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.perfis me
    WHERE me.usuario_id = auth.uid()
      AND me.role IN ('admin', 'admin_equipe')
      AND me.equipe_id IS NOT NULL
      AND me.equipe_id = target_equipe
  ) INTO ok;

  RETURN coalesce(ok, false);
END;
$$;

-- 3. audit_logs: add admin_equipe access
DROP POLICY IF EXISTS audit_logs_select_team_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_team_admin ON public.audit_logs
  FOR SELECT USING (
    equipe_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM perfis p
      WHERE p.usuario_id = auth.uid()
        AND p.role IN ('admin', 'admin_equipe')
        AND p.equipe_id IS NOT NULL
        AND p.equipe_id = audit_logs.equipe_id
    )
  );

-- 4. insights_cliente: admin_equipe access via can_manage_client
DROP POLICY IF EXISTS insights_cliente_select_admin_equipe ON public.insights_cliente;
CREATE POLICY insights_cliente_select_admin_equipe ON public.insights_cliente
  FOR SELECT USING (
    can_manage_client(cliente_id)
  );

DROP POLICY IF EXISTS insights_cliente_update_admin_equipe ON public.insights_cliente;
CREATE POLICY insights_cliente_update_admin_equipe ON public.insights_cliente
  FOR UPDATE USING (
    can_manage_client(cliente_id)
  ) WITH CHECK (
    can_manage_client(cliente_id)
  );

-- 5. logs_acoes: admin_equipe access
DROP POLICY IF EXISTS logs_acoes_select_admin_equipe ON public.logs_acoes;
CREATE POLICY logs_acoes_select_admin_equipe ON public.logs_acoes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM perfis me
      WHERE me.usuario_id = auth.uid()
        AND me.role IN ('admin', 'admin_equipe')
        AND me.equipe_id IS NOT NULL
        AND (
          -- user belongs to same team as admin
          EXISTS (
            SELECT 1 FROM perfis t
            WHERE t.usuario_id = logs_acoes.user_id
              AND t.equipe_id = me.equipe_id
          )
          -- or user is a client managed by a gestor in the same team
          OR EXISTS (
            SELECT 1
            FROM cliente_gestores cg
            JOIN perfis g ON g.usuario_id = cg.gestor_id
            WHERE cg.cliente_id = logs_acoes.user_id
              AND g.equipe_id = me.equipe_id
          )
        )
    )
  );

-- 6. Ensure emissoes INSERT policy allows admin_equipe (without usuario_responsavel = auth.uid() check)
DROP POLICY IF EXISTS emissoes_insert_admin_equipe ON public.emissoes;
CREATE POLICY emissoes_insert_admin_equipe ON public.emissoes
  FOR INSERT WITH CHECK (
    can_manage_client(cliente_id)
  );

-- 7. Ensure emissoes UPDATE policy for admin_equipe
DROP POLICY IF EXISTS emissoes_update_admin_equipe ON public.emissoes;
CREATE POLICY emissoes_update_admin_equipe ON public.emissoes
  FOR UPDATE USING (
    can_manage_client(cliente_id)
  ) WITH CHECK (
    can_manage_client(cliente_id)
  );

-- 8. timeline_eventos: insert policy for gestors/admin/cs
DROP POLICY IF EXISTS timeline_eventos_insert_manager ON public.timeline_eventos;
CREATE POLICY timeline_eventos_insert_manager ON public.timeline_eventos
  FOR INSERT WITH CHECK (
    can_manage_client(cliente_id)
  );

-- 9. timeline_eventos: update policy
DROP POLICY IF EXISTS timeline_eventos_update_manager ON public.timeline_eventos;
CREATE POLICY timeline_eventos_update_manager ON public.timeline_eventos
  FOR UPDATE USING (
    can_manage_client(cliente_id)
  ) WITH CHECK (
    can_manage_client(cliente_id)
  );

-- Done
