begin;

create or replace function public.gestor_vincular_cliente_self(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_inserted integer := 0;
begin
  if v_actor is null then
    raise exception 'gestor_cliente_link_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'gestor_cliente_link_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))) into v_role
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_role not in ('gestor', 'admin', 'admin_master', 'admin_geral', 'admin_equipe', 'cs') then
    raise exception 'gestor_cliente_link_forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_cliente_id) then
    raise exception 'gestor_cliente_link_cliente_missing' using errcode = '23503';
  end if;

  insert into public.cliente_gestores(cliente_id, gestor_id)
  values (p_cliente_id, v_actor)
  on conflict (cliente_id, gestor_id) do nothing;

  get diagnostics v_inserted = row_count;
  return jsonb_build_object('ok', true, 'linked', v_inserted);
end;
$$;

create or replace function public.gestor_desvincular_cliente_self(p_cliente_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_deleted integer := 0;
begin
  if v_actor is null then
    raise exception 'gestor_cliente_unlink_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'gestor_cliente_unlink_invalid_input' using errcode = '23514';
  end if;

  delete from public.cliente_gestores
  where cliente_id = p_cliente_id
    and gestor_id = v_actor;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.gestor_vincular_cliente_self(uuid) from public, anon;
revoke all on function public.gestor_desvincular_cliente_self(uuid) from public, anon;
grant execute on function public.gestor_vincular_cliente_self(uuid) to authenticated, service_role;
grant execute on function public.gestor_desvincular_cliente_self(uuid) to authenticated, service_role;

commit;
