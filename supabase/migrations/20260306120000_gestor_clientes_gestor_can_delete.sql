-- Permite que o gestor remova (desvincule) clientes que ele mesmo vinculou.
drop policy if exists gestor_clientes_delete_admin_only on public.gestor_clientes;
create policy gestor_clientes_delete_own_or_admin on public.gestor_clientes
  for delete
  using (gestor_id = auth.uid() or public.is_admin());
