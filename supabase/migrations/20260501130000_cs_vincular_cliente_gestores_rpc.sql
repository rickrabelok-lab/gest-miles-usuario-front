-- RPC SECURITY DEFINER para vincular um cliente a um ou mais gestores.
-- Resolve caso em que o operador tem papel correto (admin_equipe/cs/admin/etc.)
-- mas o INSERT direto em public.cliente_gestores via supabase-js cai em RLS.
-- Padrao identico ao de outras operacoes de CS (cs_provisionar_cliente_gestao,
-- cs_import_aplicar_cliente_perfil). Valida o papel do chamador dentro da funcao.

create or replace function public.cs_vincular_cliente_gestores(
  p_cliente_id uuid,
  p_gestor_ids uuid[]
)
returns table(linked integer, skipped integer, total integer)
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_role text;
  v_total integer;
  v_linked integer := 0;
  v_skipped integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sessao invalida.' using errcode = '28000';
  end if;

  v_role := (
    select p.role
      from public.perfis p
     where p.usuario_id = auth.uid()
     limit 1
  );

  if v_role is null or v_role not in ('admin_master','admin_geral','admin_equipe','cs','admin') then
    raise exception 'Seu papel (%) nao pode vincular clientes a gestores.', coalesce(v_role, 'desconhecido')
      using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'cliente_id obrigatorio.' using errcode = '22023';
  end if;
  if p_gestor_ids is null or array_length(p_gestor_ids, 1) is null then
    raise exception 'Informe ao menos um gestor.' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_cliente_id) then
    raise exception 'Cliente nao encontrado em auth.users.' using errcode = '23503';
  end if;

  v_total := array_length(p_gestor_ids, 1);

  insert into public.cliente_gestores (cliente_id, gestor_id)
  select p_cliente_id, d.gid
    from (
      select distinct gid
        from unnest(p_gestor_ids) as gid
       where gid is not null
    ) d
   where exists (select 1 from auth.users u where u.id = d.gid)
  on conflict (cliente_id, gestor_id) do nothing;

  get diagnostics v_linked = row_count;

  v_skipped := v_total - v_linked;

  return query select v_linked, v_skipped, v_total;
end
$func$;

revoke all on function public.cs_vincular_cliente_gestores(uuid, uuid[]) from public;
grant execute on function public.cs_vincular_cliente_gestores(uuid, uuid[]) to authenticated;

comment on function public.cs_vincular_cliente_gestores(uuid, uuid[]) is
  'Vincula um cliente a um ou mais gestores em cliente_gestores. Valida papel do operador (admin_master/admin_geral/admin_equipe/cs/admin). SECURITY DEFINER para bypassar RLS de cliente_gestores.';
