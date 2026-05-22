begin;

do $$
begin
  if to_regclass('public.contratos_cliente') is null then
    raise exception 'missing_table_public_contratos_cliente';
  end if;

  if to_regprocedure('public.is_legacy_platform_admin()') is null then
    raise exception 'missing_function_public_is_legacy_platform_admin';
  end if;

  if to_regprocedure('public.can_admin_equipe(uuid)') is null then
    raise exception 'missing_function_public_can_admin_equipe';
  end if;
end;
$$;

create or replace function public.manager_contrato_cliente_save(
  p_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_equipe_id uuid := nullif(v_payload->>'equipe_id', '')::uuid;
  v_cliente_id uuid := nullif(v_payload->>'cliente_id', '')::uuid;
  v_created_by uuid;
  v_existing_equipe_id uuid;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'manager_contrato_unauthenticated' using errcode = '42501';
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'manager_contrato_payload_must_be_object' using errcode = '23514';
  end if;

  if p_id is not null then
    select created_by, equipe_id
    into v_created_by, v_existing_equipe_id
    from public.contratos_cliente
    where id = p_id;

    if v_created_by is null then
      raise exception 'manager_contrato_row_not_found' using errcode = 'P0002';
    end if;

    if not (
      v_created_by = v_actor
      or public.is_legacy_platform_admin()
      or (v_existing_equipe_id is not null and public.can_admin_equipe(v_existing_equipe_id))
    ) then
      raise exception 'manager_contrato_forbidden' using errcode = '42501';
    end if;

    update public.contratos_cliente
    set
      cliente_id = coalesce(v_cliente_id, cliente_id),
      cliente_nome = coalesce(nullif(v_payload->>'cliente_nome', ''), cliente_nome),
      cliente_email = case when v_payload ? 'cliente_email' then nullif(v_payload->>'cliente_email', '') else cliente_email end,
      data_inicio = coalesce(nullif(v_payload->>'data_inicio', '')::date, data_inicio),
      data_vencimento = coalesce(nullif(v_payload->>'data_vencimento', '')::date, data_vencimento),
      valor = coalesce(nullif(v_payload->>'valor', '')::numeric, valor),
      status_cliente = coalesce(nullif(v_payload->>'status_cliente', ''), status_cliente),
      status_pagamento = coalesce(nullif(v_payload->>'status_pagamento', ''), status_pagamento),
      renovacao_confirmada = coalesce(nullif(v_payload->>'renovacao_confirmada', '')::boolean, renovacao_confirmada),
      documento_path = case when v_payload ? 'documento_path' then nullif(v_payload->>'documento_path', '') else documento_path end,
      motivo_inativacao = case when v_payload ? 'motivo_inativacao' then nullif(v_payload->>'motivo_inativacao', '') else motivo_inativacao end,
      data_inativacao = case when v_payload ? 'data_inativacao' then nullif(v_payload->>'data_inativacao', '')::date else data_inativacao end,
      renovado_por_meses = case when v_payload ? 'renovado_por_meses' then nullif(v_payload->>'renovado_por_meses', '')::integer else renovado_por_meses end
    where id = p_id
    returning id into v_id;

    return jsonb_build_object('ok', true, 'id', v_id);
  end if;

  v_created_by := coalesce(nullif(v_payload->>'created_by', '')::uuid, v_actor);

  if not (
    v_created_by = v_actor
    or public.is_legacy_platform_admin()
    or (v_equipe_id is not null and public.can_admin_equipe(v_equipe_id))
  ) then
    raise exception 'manager_contrato_forbidden' using errcode = '42501';
  end if;

  if v_cliente_id is not null and exists (
    select 1
    from public.contratos_cliente c
    where c.cliente_id = v_cliente_id
      and c.status_cliente <> 'inativo'
      and (
        (v_equipe_id is null and c.equipe_id is null and c.created_by = v_created_by)
        or (v_equipe_id is not null and c.equipe_id = v_equipe_id)
      )
  ) then
    raise exception 'manager_contrato_cliente_already_has_active_contract' using errcode = '23505';
  end if;

  insert into public.contratos_cliente(
    cliente_id,
    cliente_nome,
    cliente_email,
    data_inicio,
    data_vencimento,
    valor,
    status_cliente,
    status_pagamento,
    renovacao_confirmada,
    documento_path,
    created_by,
    equipe_id
  )
  values (
    v_cliente_id,
    coalesce(nullif(v_payload->>'cliente_nome', ''), ''),
    nullif(v_payload->>'cliente_email', ''),
    nullif(v_payload->>'data_inicio', '')::date,
    nullif(v_payload->>'data_vencimento', '')::date,
    coalesce(nullif(v_payload->>'valor', '')::numeric, 0),
    coalesce(nullif(v_payload->>'status_cliente', ''), 'pendente'),
    coalesce(nullif(v_payload->>'status_pagamento', ''), 'pendente'),
    coalesce(nullif(v_payload->>'renovacao_confirmada', '')::boolean, false),
    nullif(v_payload->>'documento_path', ''),
    v_created_by,
    v_equipe_id
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.manager_contrato_cliente_save(uuid, jsonb) from public, anon;
grant execute on function public.manager_contrato_cliente_save(uuid, jsonb) to authenticated, service_role;

commit;
