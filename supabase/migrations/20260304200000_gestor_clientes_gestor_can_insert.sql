-- Allow gestors to link clients to themselves (vincular cliente).
-- Drop admin-only insert and add policy: gestor can insert when gestor_id = auth.uid().

drop policy if exists gestor_clientes_insert_admin_only on public.gestor_clientes;

create policy gestor_clientes_insert_own_or_admin on public.gestor_clientes
  for insert
  with check (gestor_id = auth.uid() or public.is_admin());
