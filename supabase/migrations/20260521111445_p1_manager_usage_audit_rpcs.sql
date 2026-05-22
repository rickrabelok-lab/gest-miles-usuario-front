begin;

do $$
begin
  if to_regclass('public.perfis') is null then
    raise exception 'missing_table_public_perfis';
  end if;

  if to_regclass('public.logs_acoes') is null then
    raise exception 'missing_table_public_logs_acoes';
  end if;

  if to_regclass('public.pesquisa_passagens_uso_usuario') is null then
    raise exception 'missing_table_public_pesquisa_passagens_uso_usuario';
  end if;

  if to_regclass('public.pesquisa_passagens_uso_equipe') is null then
    raise exception 'missing_table_public_pesquisa_passagens_uso_equipe';
  end if;

  if to_regprocedure('public.is_legacy_platform_admin()') is null then
    raise exception 'missing_function_public_is_legacy_platform_admin';
  end if;

  if to_regprocedure('public.can_admin_equipe(uuid)') is null then
    raise exception 'missing_function_public_can_admin_equipe';
  end if;
end;
$$;

create or replace function public.manager_increment_pesquisa_passagens_usage(
  p_equipe_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_dia date := current_date;
  v_can_use_equipe boolean := false;
begin
  if v_actor is null then
    raise exception 'manager_usage_unauthenticated' using errcode = '42501';
  end if;

  insert into public.pesquisa_passagens_uso_usuario(usuario_id, dia, contagem)
  values (v_actor, v_dia, 1)
  on conflict (usuario_id, dia)
  do update set contagem = public.pesquisa_passagens_uso_usuario.contagem + 1;

  if p_equipe_id is not null then
    select public.can_admin_equipe(p_equipe_id)
      or public.is_legacy_platform_admin()
    into v_can_use_equipe;

    if not v_can_use_equipe then
      raise exception 'manager_usage_forbidden_equipe' using errcode = '42501';
    end if;

    insert into public.pesquisa_passagens_uso_equipe(equipe_id, dia, contagem)
    values (p_equipe_id, v_dia, 1)
    on conflict (equipe_id, dia)
    do update set contagem = public.pesquisa_passagens_uso_equipe.contagem + 1;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.manager_increment_pesquisa_passagens_usage(uuid) from public, anon;
grant execute on function public.manager_increment_pesquisa_passagens_usage(uuid) to authenticated, service_role;

create or replace function public.manager_operational_log_write(
  p_tipo_acao text,
  p_entidade_afetada text,
  p_entidade_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_tipo text := nullif(trim(coalesce(p_tipo_acao, '')), '');
  v_entidade text := nullif(trim(coalesce(p_entidade_afetada, '')), '');
begin
  if v_actor is null then
    raise exception 'manager_operational_log_unauthenticated' using errcode = '42501';
  end if;

  if v_tipo is null or v_entidade is null then
    raise exception 'manager_operational_log_invalid_input' using errcode = '23514';
  end if;

  if p_details is not null and jsonb_typeof(p_details) <> 'object' then
    raise exception 'manager_operational_log_details_must_be_object' using errcode = '23514';
  end if;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (
    v_actor,
    v_tipo,
    v_entidade,
    nullif(trim(coalesce(p_entidade_id, '')), ''),
    coalesce(p_details, '{}'::jsonb)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.manager_operational_log_write(text, text, text, jsonb) from public, anon;
grant execute on function public.manager_operational_log_write(text, text, text, jsonb) to authenticated, service_role;

commit;
