-- RLS em public.gestor_clientes (tabela legada) alinhada a public.cliente_gestores:
-- a UI grava linhas com gestor_id = gestor nacional/internacional, nao auth.uid() (operador admin_equipe/cs).
-- Politicas antigas: insert com check (gestor_id = auth.uid() or is_admin()) -> violava staff.

drop policy if exists gestor_clientes_insert_staff on public.gestor_clientes;

create policy gestor_clientes_insert_staff
  on public.gestor_clientes
  as permissive
  for insert
  to public
  with check (
    exists (
      select 1
      from public.perfis me
      where me.usuario_id = auth.uid()
        and me.role = any (array['admin_master', 'admin_geral', 'admin_equipe', 'cs', 'admin'])
    )
  );

-- Upsert: ON CONFLICT exige politica de UPDATE; a antiga restringe a is_admin() em plataforma.
drop policy if exists gestor_clientes_update_staff on public.gestor_clientes;

create policy gestor_clientes_update_staff
  on public.gestor_clientes
  as permissive
  for update
  to public
  using (
    exists (
      select 1
      from public.perfis me
      where me.usuario_id = auth.uid()
        and me.role = any (array['admin_master', 'admin_geral', 'admin_equipe', 'cs', 'admin'])
    )
  )
  with check (
    exists (
      select 1
      from public.perfis me
      where me.usuario_id = auth.uid()
        and me.role = any (array['admin_master', 'admin_geral', 'admin_equipe', 'cs', 'admin'])
    )
  );

-- Deletar vinculo legado (gestor_id nao e o operador) no mesmo fluxo do ClientProfile.
drop policy if exists gestor_clientes_delete_staff on public.gestor_clientes;

create policy gestor_clientes_delete_staff
  on public.gestor_clientes
  as permissive
  for delete
  to public
  using (
    exists (
      select 1
      from public.perfis me
      where me.usuario_id = auth.uid()
        and me.role = any (array['admin_master', 'admin_geral', 'admin_equipe', 'cs', 'admin'])
    )
  );

comment on policy gestor_clientes_insert_staff on public.gestor_clientes is
  'Staff operacional grava vinculo legado na mesma linha que public.cliente_gestores (ClientProfile, equipes).';
comment on policy gestor_clientes_update_staff on public.gestor_clientes is
  'Permite upsert PostgREST quando a linha ja existia; operadores como admin_equipe.';
comment on policy gestor_clientes_delete_staff on public.gestor_clientes is
  'Remove vinculo legado quando o operador ajusta nac/intl no perfil.';
