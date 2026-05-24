begin;

do $$
begin
  if to_regclass('public.beneficios_programa_cliente') is null then
    raise exception 'missing_table_public_beneficios_programa_cliente';
  end if;

  if to_regprocedure('public.can_manage_client(uuid)') is null then
    raise exception 'missing_function_public_can_manage_client';
  end if;
end;
$$;

create or replace function public.manager_beneficio_programa_create(
  p_cliente_id uuid,
  p_program_id text,
  p_tipo text,
  p_quantidade integer,
  p_validade date,
  p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_program_id text := nullif(trim(coalesce(p_program_id, '')), '');
  v_tipo text := nullif(trim(coalesce(p_tipo, '')), '');
  v_notas text := nullif(trim(coalesce(p_notas, '')), '');
  v_beneficio_id uuid;
begin
  if v_actor is null then
    raise exception 'manager_beneficio_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'manager_beneficio_missing_cliente_id' using errcode = '23514';
  end if;

  if not public.can_manage_client(p_cliente_id) then
    raise exception 'manager_beneficio_forbidden_cliente' using errcode = '42501';
  end if;

  if v_program_id is null or length(v_program_id) > 100 then
    raise exception 'manager_beneficio_invalid_program_id' using errcode = '23514';
  end if;

  if v_tipo is null or length(v_tipo) > 100 or v_tipo = '__custom__' then
    raise exception 'manager_beneficio_invalid_tipo' using errcode = '23514';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'manager_beneficio_invalid_quantidade' using errcode = '23514';
  end if;

  if v_notas is not null and length(v_notas) > 2000 then
    raise exception 'manager_beneficio_notas_too_long' using errcode = '23514';
  end if;

  insert into public.beneficios_programa_cliente (
    cliente_id,
    program_id,
    tipo,
    quantidade,
    validade,
    notas,
    source,
    criado_por,
    atualizado_em
  )
  values (
    p_cliente_id,
    v_program_id,
    v_tipo,
    p_quantidade,
    p_validade,
    v_notas,
    'manual',
    v_actor,
    now()
  )
  returning id into v_beneficio_id;

  return v_beneficio_id;
end;
$$;

create or replace function public.manager_beneficio_programa_update(
  p_beneficio_id uuid,
  p_tipo text default null,
  p_quantidade integer default null,
  p_validade date default null,
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_cliente_id uuid;
  v_tipo text := nullif(trim(coalesce(p_tipo, '')), '');
  v_notas text := nullif(trim(coalesce(p_notas, '')), '');
  v_updated_id uuid;
begin
  if v_actor is null then
    raise exception 'manager_beneficio_unauthenticated' using errcode = '42501';
  end if;

  if p_beneficio_id is null then
    raise exception 'manager_beneficio_missing_id' using errcode = '23514';
  end if;

  select cliente_id
    into v_cliente_id
  from public.beneficios_programa_cliente
  where id = p_beneficio_id;

  if v_cliente_id is null then
    raise exception 'manager_beneficio_not_found' using errcode = 'P0002';
  end if;

  if not public.can_manage_client(v_cliente_id) then
    raise exception 'manager_beneficio_forbidden_cliente' using errcode = '42501';
  end if;

  if p_tipo is not null and (v_tipo is null or length(v_tipo) > 100 or v_tipo = '__custom__') then
    raise exception 'manager_beneficio_invalid_tipo' using errcode = '23514';
  end if;

  if p_quantidade is not null and p_quantidade <= 0 then
    raise exception 'manager_beneficio_invalid_quantidade' using errcode = '23514';
  end if;

  if v_notas is not null and length(v_notas) > 2000 then
    raise exception 'manager_beneficio_notas_too_long' using errcode = '23514';
  end if;

  update public.beneficios_programa_cliente
  set
    tipo = coalesce(v_tipo, tipo),
    quantidade = coalesce(p_quantidade, quantidade),
    validade = p_validade,
    notas = v_notas,
    atualizado_em = now()
  where id = p_beneficio_id
  returning id into v_updated_id;

  return jsonb_build_object('ok', true, 'id', v_updated_id);
end;
$$;

create or replace function public.manager_beneficio_programa_delete(
  p_beneficio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_cliente_id uuid;
  v_deleted_id uuid;
begin
  if v_actor is null then
    raise exception 'manager_beneficio_unauthenticated' using errcode = '42501';
  end if;

  if p_beneficio_id is null then
    raise exception 'manager_beneficio_missing_id' using errcode = '23514';
  end if;

  select cliente_id
    into v_cliente_id
  from public.beneficios_programa_cliente
  where id = p_beneficio_id;

  if v_cliente_id is null then
    raise exception 'manager_beneficio_not_found' using errcode = 'P0002';
  end if;

  if not public.can_manage_client(v_cliente_id) then
    raise exception 'manager_beneficio_forbidden_cliente' using errcode = '42501';
  end if;

  delete from public.beneficios_programa_cliente
  where id = p_beneficio_id
  returning id into v_deleted_id;

  return jsonb_build_object('ok', true, 'id', v_deleted_id);
end;
$$;

revoke all on function public.manager_beneficio_programa_create(uuid, text, text, integer, date, text) from public, anon;
revoke all on function public.manager_beneficio_programa_update(uuid, text, integer, date, text) from public, anon;
revoke all on function public.manager_beneficio_programa_delete(uuid) from public, anon;

grant execute on function public.manager_beneficio_programa_create(uuid, text, text, integer, date, text) to authenticated, service_role;
grant execute on function public.manager_beneficio_programa_update(uuid, text, integer, date, text) to authenticated, service_role;
grant execute on function public.manager_beneficio_programa_delete(uuid) to authenticated, service_role;

revoke insert, update, delete on public.beneficios_programa_cliente from authenticated;

commit;
