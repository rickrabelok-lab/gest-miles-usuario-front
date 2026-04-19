-- Liberar INSERT/SELECT em cliente_gestores para admin_equipe / admin_geral / admin_master
-- (alem dos ja existentes cs / admin). Necessario para a UI "Adicionar Clientes" conseguir
-- vincular um cliente a um par nacional+internacional quando o operador eh admin_equipe.

-- Policy INSERT: amplia para roles operacionais alem de cs/admin
drop policy if exists cliente_gestores_insert_cs on public.cliente_gestores;

create policy cliente_gestores_insert_staff
  on public.cliente_gestores
  as permissive
  for insert
  to public
  with check (
    exists (
      select 1
      from public.perfis me
      where me.usuario_id = auth.uid()
        and me.role = any (array['admin_master','admin_geral','admin_equipe','cs','admin'])
    )
  );

-- Policy SELECT para que admin_master/admin_geral/admin_equipe consigam ver
-- vinculos existentes (upsert com .select() precisa de SELECT apos INSERT).
-- Admin_equipe so enxerga vinculos cujos gestores estao na mesma equipe dele.
drop policy if exists cliente_gestores_select_admin_equipe on public.cliente_gestores;
create policy cliente_gestores_select_admin_equipe
  on public.cliente_gestores
  as permissive
  for select
  to public
  using (
    exists (
      select 1
      from public.perfis me
      where me.usuario_id = auth.uid()
        and me.role in ('admin_master','admin_geral')
    )
    or exists (
      select 1
      from public.perfis me
      join public.equipe_gestores eg on eg.gestor_id = cliente_gestores.gestor_id
      where me.usuario_id = auth.uid()
        and me.role = 'admin_equipe'
        and me.equipe_id is not null
        and me.equipe_id = eg.equipe_id
    )
  );

-- Tambem amplia DELETE/UPDATE para admin_equipe, alinhado ao mesmo escopo.
drop policy if exists cliente_gestores_delete_admin_equipe on public.cliente_gestores;
create policy cliente_gestores_delete_admin_equipe
  on public.cliente_gestores
  as permissive
  for delete
  to public
  using (
    exists (
      select 1
      from public.perfis me
      where me.usuario_id = auth.uid()
        and me.role in ('admin_master','admin_geral')
    )
    or exists (
      select 1
      from public.perfis me
      join public.equipe_gestores eg on eg.gestor_id = cliente_gestores.gestor_id
      where me.usuario_id = auth.uid()
        and me.role = 'admin_equipe'
        and me.equipe_id is not null
        and me.equipe_id = eg.equipe_id
    )
  );

comment on policy cliente_gestores_insert_staff on public.cliente_gestores is
  'Staff (admin_master, admin_geral, admin_equipe, cs, admin) pode criar vinculos cliente <-> gestor na UI de gestao da equipe.';
comment on policy cliente_gestores_select_admin_equipe on public.cliente_gestores is
  'Admin_master/admin_geral enxergam todos vinculos; admin_equipe enxerga apenas os vinculos de gestores da sua equipe.';
comment on policy cliente_gestores_delete_admin_equipe on public.cliente_gestores is
  'Permite remover vinculo dentro do mesmo escopo da policy de SELECT correspondente.';
