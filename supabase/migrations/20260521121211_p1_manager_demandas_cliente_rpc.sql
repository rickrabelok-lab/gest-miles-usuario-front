begin;

do $$
begin
  if to_regclass('public.demandas_cliente') is null then
    raise exception 'missing_table_public_demandas_cliente';
  end if;

  if to_regprocedure('public.can_manage_client(uuid)') is null then
    raise exception 'missing_function_public_can_manage_client';
  end if;
end;
$$;

create or replace function public.manager_demanda_cliente_save(
  p_id bigint default null,
  p_cliente_id uuid default null,
  p_tipo text default null,
  p_status text default 'pendente',
  p_payload jsonb default '{}'::jsonb,
  p_target_gestor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_cliente_id uuid;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_id bigint;
begin
  if v_actor is null then
    raise exception 'manager_demanda_unauthenticated' using errcode = '42501';
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'manager_demanda_payload_must_be_object' using errcode = '23514';
  end if;

  if p_id is not null then
    select cliente_id
    into v_cliente_id
    from public.demandas_cliente
    where id = p_id;

    if v_cliente_id is null then
      raise exception 'manager_demanda_row_not_found' using errcode = 'P0002';
    end if;

    if not public.can_manage_client(v_cliente_id) then
      raise exception 'manager_demanda_forbidden' using errcode = '42501';
    end if;

    update public.demandas_cliente
    set
      tipo = coalesce(nullif(p_tipo, ''), tipo),
      status = coalesce(nullif(p_status, ''), status),
      payload = v_payload,
      target_gestor_id = coalesce(p_target_gestor_id, target_gestor_id),
      updated_at = now()
    where id = p_id
    returning id into v_id;

    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  if p_cliente_id is null then
    raise exception 'manager_demanda_missing_cliente_id' using errcode = '23514';
  end if;

  if not public.can_manage_client(p_cliente_id) then
    raise exception 'manager_demanda_forbidden' using errcode = '42501';
  end if;

  insert into public.demandas_cliente(
    cliente_id,
    tipo,
    status,
    payload,
    target_gestor_id
  )
  values (
    p_cliente_id,
    coalesce(nullif(p_tipo, ''), 'outros'),
    coalesce(nullif(p_status, ''), 'pendente'),
    v_payload,
    p_target_gestor_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.manager_demanda_cliente_save(bigint, uuid, text, text, jsonb, uuid) from public, anon;
grant execute on function public.manager_demanda_cliente_save(bigint, uuid, text, text, jsonb, uuid) to authenticated, service_role;

commit;
