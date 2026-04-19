-- logs_acoes: admin_equipe (e admin com equipa) deve ver ações de toda a equipa.
-- A política anterior só cobria perfis.equipe_id igual; muitos gestores só estão em
-- equipe_gestores, CS só em equipe_cs, e admins da equipa podem estar só em equipe_admin.

DROP POLICY IF EXISTS logs_acoes_select_admin_equipe ON public.logs_acoes;

CREATE POLICY logs_acoes_select_admin_equipe ON public.logs_acoes
  FOR SELECT
  USING (
    (
      EXISTS (
        SELECT 1
        FROM public.perfis me
        WHERE me.usuario_id = auth.uid()
          AND me.role IN ('admin', 'admin_equipe')
          AND me.equipe_id IS NOT NULL
          AND (
            EXISTS (
              SELECT 1
              FROM public.perfis t
              WHERE t.usuario_id = logs_acoes.user_id
                AND t.equipe_id IS NOT DISTINCT FROM me.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.cliente_gestores cg
              JOIN public.perfis g ON g.usuario_id = cg.gestor_id
              WHERE cg.cliente_id = logs_acoes.user_id
                AND g.equipe_id IS NOT DISTINCT FROM me.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.equipe_gestores eg
              WHERE eg.gestor_id = logs_acoes.user_id
                AND eg.equipe_id = me.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.equipe_cs ec
              WHERE ec.cs_id = logs_acoes.user_id
                AND ec.equipe_id = me.equipe_id
            )
          )
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.equipe_admin ea
        WHERE ea.ativo = true
          AND (
            ea.admin_equipe_id_1 = auth.uid()
            OR ea.admin_equipe_id_2 = auth.uid()
            OR ea.admin_equipe_id_3 = auth.uid()
          )
          AND (
            EXISTS (
              SELECT 1
              FROM public.perfis t
              WHERE t.usuario_id = logs_acoes.user_id
                AND t.equipe_id IS NOT DISTINCT FROM ea.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.cliente_gestores cg
              JOIN public.perfis g ON g.usuario_id = cg.gestor_id
              WHERE cg.cliente_id = logs_acoes.user_id
                AND g.equipe_id IS NOT DISTINCT FROM ea.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.equipe_gestores eg
              WHERE eg.gestor_id = logs_acoes.user_id
                AND eg.equipe_id = ea.equipe_id
            )
            OR EXISTS (
              SELECT 1
              FROM public.equipe_cs ec
              WHERE ec.cs_id = logs_acoes.user_id
                AND ec.equipe_id = ea.equipe_id
            )
          )
      )
    )
  );
