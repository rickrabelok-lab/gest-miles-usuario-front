-- Alinha UPDATE de `perfis` com o escopo de leitura para CS: `perfis_select_team_scoped` já usa
-- `can_cs_view_client(usuario_id)`, mas o UPDATE só tinha `cs_can_access_gestor(usuario_id)` (UUID de
-- **gestor** supervisionado, não de cliente). Sem isto, o painel /cs conseguia ler perfis do cliente
-- mas falhava ao gravar `configuracao_tema` (ex.: plano de ação em lote).

drop policy if exists perfis_update_own_or_gestor_or_admin on public.perfis;

create policy perfis_update_own_or_gestor_or_admin on public.perfis
  for update
  using (
    auth.uid() = usuario_id
    or public.is_legacy_platform_admin()
    or public.team_admin_sees_perfil(usuario_id)
    or public.can_manage_client(usuario_id)
    or public.cs_can_access_gestor(usuario_id)
    or public.can_cs_view_client(usuario_id)
  )
  with check (
    auth.uid() = usuario_id
    or public.is_legacy_platform_admin()
    or public.team_admin_sees_perfil(usuario_id)
    or public.can_manage_client(usuario_id)
    or public.cs_can_access_gestor(usuario_id)
    or public.can_cs_view_client(usuario_id)
  );
