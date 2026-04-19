-- ============================================================================
-- INSERT em perfis: CS / admin de equipe podem criar perfil de cliente_gestao
-- na mesma equipe (fluxo useCsProvisionConta / import JSON).
--
-- Antes: só auth.uid() = usuario_id ou can_manage_client(target) — para INSERT
-- o cliente ainda não existe em perfis, então can_manage_client falha (órfão).
-- ============================================================================

drop policy if exists perfis_insert_provisao_equipe_cliente on public.perfis;

create policy perfis_insert_provisao_equipe_cliente on public.perfis
  for insert
  with check (
    public.is_legacy_platform_admin()
    or (
      coalesce(role, '') = 'cliente_gestao'
      and equipe_id is not null
      and exists (
        select 1
        from public.perfis me
        where me.usuario_id = auth.uid()
          and me.equipe_id is not null
          and me.equipe_id = equipe_id
          and me.role in ('cs', 'admin_equipe', 'admin')
      )
    )
  );

comment on policy perfis_insert_provisao_equipe_cliente on public.perfis is
  'Permite CS/admin/admin_equipe da mesma equipe inserir perfil cliente_gestao (provisão).';
