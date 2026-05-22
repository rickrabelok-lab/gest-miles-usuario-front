begin;

do $$
begin
  if to_regprocedure('public.is_legacy_platform_admin()') is null then
    raise exception 'missing_function_public_is_legacy_platform_admin';
  end if;

  if to_regprocedure('public.can_admin_equipe(uuid)') is null then
    raise exception 'missing_function_public_can_admin_equipe';
  end if;

  if to_regclass('public.balcao_entradas') is null then
    raise exception 'missing_table_public_balcao_entradas';
  end if;

  if to_regclass('public.balcao_consumos') is null then
    raise exception 'missing_table_public_balcao_consumos';
  end if;
end;
$$;

create or replace function public.manager_balcao_entrada_create(
  p_equipe_id uuid,
  p_cliente_id uuid,
  p_programa_id text,
  p_programa_nome text,
  p_quantidade_original integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'manager_balcao_unauthenticated' using errcode = '42501';
  end if;

  if p_equipe_id is null or p_cliente_id is null then
    raise exception 'manager_balcao_missing_scope' using errcode = '23514';
  end if;

  if coalesce(p_quantidade_original, 0) < 0 then
    raise exception 'manager_balcao_invalid_quantidade' using errcode = '23514';
  end if;

  if not (public.is_legacy_platform_admin() or public.can_admin_equipe(p_equipe_id)) then
    raise exception 'manager_balcao_forbidden_equipe' using errcode = '42501';
  end if;

  insert into public.balcao_entradas(
    equipe_id,
    cliente_id,
    programa_id,
    programa_nome,
    quantidade_original,
    quantidade_disponivel,
    status,
    criado_por
  )
  values (
    p_equipe_id,
    p_cliente_id,
    coalesce(p_programa_id, ''),
    coalesce(p_programa_nome, ''),
    coalesce(p_quantidade_original, 0),
    coalesce(p_quantidade_original, 0),
    case when coalesce(p_quantidade_original, 0) <= 0 then 'zerado' else 'ativo' end,
    v_actor
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.manager_balcao_entrada_create(uuid, uuid, text, text, integer) from public, anon;
grant execute on function public.manager_balcao_entrada_create(uuid, uuid, text, text, integer) to authenticated, service_role;

create or replace function public.manager_balcao_entrada_update(
  p_id uuid,
  p_quantidade_disponivel integer default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_equipe_id uuid;
  v_status text;
begin
  if v_actor is null then
    raise exception 'manager_balcao_unauthenticated' using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'manager_balcao_missing_id' using errcode = '23514';
  end if;

  if p_quantidade_disponivel is not null and p_quantidade_disponivel < 0 then
    raise exception 'manager_balcao_invalid_quantidade' using errcode = '23514';
  end if;

  select equipe_id
  into v_equipe_id
  from public.balcao_entradas
  where id = p_id;

  if v_equipe_id is null then
    raise exception 'manager_balcao_row_not_found' using errcode = 'P0002';
  end if;

  if not (public.is_legacy_platform_admin() or public.can_admin_equipe(v_equipe_id)) then
    raise exception 'manager_balcao_forbidden_equipe' using errcode = '42501';
  end if;

  v_status := case
    when p_status in ('ativo', 'zerado', 'arquivado') then p_status
    when p_quantidade_disponivel <= 0 then 'zerado'
    else 'ativo'
  end;

  update public.balcao_entradas
  set
    quantidade_disponivel = coalesce(p_quantidade_disponivel, quantidade_disponivel),
    status = v_status,
    atualizado_em = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

revoke all on function public.manager_balcao_entrada_update(uuid, integer, text) from public, anon;
grant execute on function public.manager_balcao_entrada_update(uuid, integer, text) to authenticated, service_role;

create or replace function public.manager_balcao_consumo_create(
  p_entrada_id uuid,
  p_emissao_id uuid,
  p_quantidade_consumida integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_equipe_id uuid;
  v_quantidade_atual integer;
  v_novo_saldo integer;
  v_consumo_id uuid;
begin
  if v_actor is null then
    raise exception 'manager_balcao_unauthenticated' using errcode = '42501';
  end if;

  if p_entrada_id is null then
    raise exception 'manager_balcao_missing_entrada_id' using errcode = '23514';
  end if;

  if coalesce(p_quantidade_consumida, 0) <= 0 then
    raise exception 'manager_balcao_invalid_consumo' using errcode = '23514';
  end if;

  select equipe_id, quantidade_disponivel
  into v_equipe_id, v_quantidade_atual
  from public.balcao_entradas
  where id = p_entrada_id
  for update;

  if v_equipe_id is null then
    raise exception 'manager_balcao_row_not_found' using errcode = 'P0002';
  end if;

  if not (public.is_legacy_platform_admin() or public.can_admin_equipe(v_equipe_id)) then
    raise exception 'manager_balcao_forbidden_equipe' using errcode = '42501';
  end if;

  v_novo_saldo := greatest(0, v_quantidade_atual - p_quantidade_consumida);

  insert into public.balcao_consumos(
    entrada_id,
    emissao_id,
    quantidade_consumida,
    consumido_por
  )
  values (
    p_entrada_id,
    p_emissao_id,
    p_quantidade_consumida,
    v_actor
  )
  returning id into v_consumo_id;

  update public.balcao_entradas
  set
    quantidade_disponivel = v_novo_saldo,
    status = case when v_novo_saldo <= 0 then 'zerado' else 'ativo' end,
    atualizado_em = now()
  where id = p_entrada_id;

  return jsonb_build_object('ok', true, 'id', v_consumo_id, 'quantidade_disponivel', v_novo_saldo);
end;
$$;

revoke all on function public.manager_balcao_consumo_create(uuid, uuid, integer) from public, anon;
grant execute on function public.manager_balcao_consumo_create(uuid, uuid, integer) to authenticated, service_role;

commit;
