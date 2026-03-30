-- Permite que um gestor (ou CS) veja todos os vínculos cliente↔gestor para clientes que já pode gerenciar/ver,
-- para exibir co-gestores responsáveis pelo mesmo cliente.

drop policy if exists cliente_gestores_select_co_managers on public.cliente_gestores;
create policy cliente_gestores_select_co_managers on public.cliente_gestores
  for select
  using (public.can_manage_client(cliente_id));

drop policy if exists cliente_gestores_select_cs_links on public.cliente_gestores;
create policy cliente_gestores_select_cs_links on public.cliente_gestores
  for select
  using (public.can_cs_view_client(cliente_id));

drop policy if exists gestor_clientes_select_co_managers on public.gestor_clientes;
create policy gestor_clientes_select_co_managers on public.gestor_clientes
  for select
  using (public.can_manage_client(cliente_id));

drop policy if exists gestor_clientes_select_cs_links on public.gestor_clientes;
create policy gestor_clientes_select_cs_links on public.gestor_clientes
  for select
  using (public.can_cs_view_client(cliente_id));
