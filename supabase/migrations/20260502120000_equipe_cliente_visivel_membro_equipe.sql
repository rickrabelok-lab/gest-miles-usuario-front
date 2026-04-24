-- CS / gestor / admin da operação: ler linhas em public.equipe_clientes da própria equipa.
-- Antes, equipe_cliente_visivel_por_usuario só passava (além de admin) se o utilizador já
-- figurasse nessa linha (cs_id, snapshot_admin, gestor_nacional/internacional) — o que
-- bloqueava CS em equipe_cs que ainda não estava preenchido em equipe_clientes, escondendo
-- gestor nacional / internacional no CRM (coluna "Gestores") e listas de carteira.
--
-- alinhado a: equipe_gestores_select, equipe_cs_select (qualquer membro ativo vê a equipa).

create or replace function public.equipe_cliente_visivel_por_usuario(p_equipe_id uuid, p_cliente_id uuid, p_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_usuario_id = p_cliente_id
    or public.equipe_usuario_eh_admin(p_equipe_id, p_usuario_id)
    or public.equipe_usuario_eh_membro_ativo(p_equipe_id, p_usuario_id)
    or exists (
      select 1
      from public.equipe_clientes ec
      where ec.equipe_id = p_equipe_id
        and ec.cliente_id = p_cliente_id
        and ec.ativo = true
        and (
          ec.cs_id = p_usuario_id
          or ec.cs_id_2 = p_usuario_id
          or ec.snapshot_admin_1_id = p_usuario_id
          or ec.snapshot_admin_2_id = p_usuario_id
          or ec.snapshot_admin_3_id = p_usuario_id
          or ec.gestor_nacional_id = p_usuario_id
          or ec.gestor_internacional_id = p_usuario_id
        )
    ),
    false
  );
$$;

comment on function public.equipe_cliente_visivel_por_usuario(uuid, uuid, uuid) is
  'Vê equipe_clientes: cliente, admin da equipa, membro ativo (admin/gestor/equipe_cs) ou listado na linha.';
