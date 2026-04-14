-- Admin da equipe (equipe_admin.admin_equipe_id_*) precisa do mesmo acesso que a policy
-- manual `programas-cliente-select-admin-equipe.sql`: clientes em equipe_clientes.
-- Sem isto, RLS em programas_cliente (e outras tabelas multi-tenant) bloqueia leitura/escrita
-- para quem não está em cliente_gestores.

create or replace function public.can_manage_client(target_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() = target_cliente_id
    or public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.cliente_gestores cg
      where cg.gestor_id = auth.uid()
        and cg.cliente_id = target_cliente_id
    )
    or exists (
      select 1
      from public.perfis me
      join public.perfis c on c.equipe_id is not distinct from me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and c.usuario_id = target_cliente_id
        and c.equipe_id is not null
    )
    or exists (
      select 1
      from public.equipe_clientes ec
      inner join public.equipe_admin ea
        on ea.equipe_id = ec.equipe_id
        and ea.ativo = true
      where ec.cliente_id = target_cliente_id
        and ec.ativo = true
        and (
          ea.admin_equipe_id_1 = auth.uid()
          or ea.admin_equipe_id_2 = auth.uid()
          or ea.admin_equipe_id_3 = auth.uid()
        )
    ),
    false
  );
$$;

comment on function public.can_manage_client(uuid) is
  'Gestor, admin ou admin_equipe na mesma equipe (perfis), ou equipe_admin+equipe_clientes.';
