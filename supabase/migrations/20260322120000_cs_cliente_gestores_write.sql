-- CS: vincular cliente existente (auth.users) a um gestor da equipe (cs_gestores).
-- INSERT/DELETE em cliente_gestores quando can_cs_manage_gestor(gestor_id).

drop policy if exists cliente_gestores_insert_cs on public.cliente_gestores;
create policy cliente_gestores_insert_cs on public.cliente_gestores
  for insert
  with check (public.can_cs_manage_gestor(gestor_id));

drop policy if exists cliente_gestores_delete_cs on public.cliente_gestores;
create policy cliente_gestores_delete_cs on public.cliente_gestores
  for delete
  using (public.can_cs_manage_gestor(gestor_id));
