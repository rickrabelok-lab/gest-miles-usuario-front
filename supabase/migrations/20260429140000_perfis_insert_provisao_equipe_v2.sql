-- ============================================================================
-- v2: amplia quem pode INSERT em perfis (cliente_gestao) na equipe.
--
-- Motivos de falha na v1:
-- - perfis.role = 'admin_master' (UI mapeia para admin) não estava na lista;
-- - CS listado só em public.equipe_cs sem role cs no perfil;
-- - INSERT com equipe_id NULL (sessão sem equipe_id) — corrigir no app com fallback.
-- ============================================================================

drop policy if exists perfis_insert_provisao_equipe_cliente on public.perfis;

create policy perfis_insert_provisao_equipe_cliente on public.perfis
  for insert
  with check (
    public.is_legacy_platform_admin()
    or (
      coalesce(role, '') = 'cliente_gestao'
      and equipe_id is not null
      and (
        exists (
          select 1
          from public.perfis me
          where me.usuario_id = auth.uid()
            and me.equipe_id is not null
            and me.equipe_id = equipe_id
            and me.role in ('cs', 'admin_equipe', 'admin', 'admin_master')
        )
        or exists (
          select 1
          from public.equipe_cs ec
          where ec.equipe_id = equipe_id
            and ec.cs_id = auth.uid()
        )
      )
    )
  );

comment on policy perfis_insert_provisao_equipe_cliente on public.perfis is
  'v2: CS via perfis.role ou equipe_cs; admin/admin_equipe/admin_master na mesma equipe.';
