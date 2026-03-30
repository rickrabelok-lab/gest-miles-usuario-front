-- Cole no Supabase SQL Editor se ainda não aplicou a migration 20260322120000_cs_cliente_gestores_write.sql
-- Permite ao role CS inserir/remover vínculos cliente_gestores para gestores da equipe (cs_gestores).

drop policy if exists cliente_gestores_insert_cs on public.cliente_gestores;
create policy cliente_gestores_insert_cs on public.cliente_gestores
  for insert
  with check (public.can_cs_manage_gestor(gestor_id));

drop policy if exists cliente_gestores_delete_cs on public.cliente_gestores;
create policy cliente_gestores_delete_cs on public.cliente_gestores
  for delete
  using (public.can_cs_manage_gestor(gestor_id));
