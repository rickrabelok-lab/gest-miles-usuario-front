-- Permite que o gestor atualize (e crie, se necessário) o perfil dos clientes que ele gerencia.
-- Necessário para salvar o Plano de Ação do cliente e para o gestor visualizar na aba "Plano de Ação".

drop policy if exists perfis_update_own_or_admin on public.perfis;
create policy perfis_update_own_or_gestor_or_admin on public.perfis
  for update
  using (
    auth.uid() = usuario_id
    or public.is_admin()
    or public.can_manage_client(usuario_id)
  )
  with check (
    auth.uid() = usuario_id
    or public.is_admin()
    or public.can_manage_client(usuario_id)
  );

-- Permite que o gestor crie perfil para cliente que ainda não tem (ex: primeiro save do plano de ação).
drop policy if exists perfis_insert_own on public.perfis;
create policy perfis_insert_own_or_gestor on public.perfis
  for insert
  with check (
    auth.uid() = usuario_id
    or public.can_manage_client(usuario_id)
  );
