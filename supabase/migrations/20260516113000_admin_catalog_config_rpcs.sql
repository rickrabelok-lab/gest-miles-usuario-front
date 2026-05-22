-- Admin catalog/config RPCs for feature flags and plans catalog writes.
-- Local migration only: apply to production only with explicit approval.

do $$
begin
  if to_regclass('public.admin_feature_flags') is null then
    raise exception 'missing dependency: public.admin_feature_flags';
  end if;

  if to_regclass('public.admin_planos_config') is null then
    raise exception 'missing dependency: public.admin_planos_config';
  end if;

  if to_regclass('public.logs_acoes') is null then
    raise exception 'missing dependency: public.logs_acoes';
  end if;

  if to_regprocedure('public.is_admin_config_manager()') is null then
    raise exception 'missing dependency: public.is_admin_config_manager()';
  end if;
end;
$$;

create or replace function public.admin_save_feature_flags(
  p_payload jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_existing_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not public.is_admin_config_manager() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  select id into v_existing_id
  from public.admin_feature_flags
  where config_key = 'default'
  for update;

  if v_existing_id is null then
    insert into public.admin_feature_flags (config_key, payload, updated_by, updated_at)
    values ('default', p_payload, v_user_id, now())
    returning id into v_existing_id;
  else
    update public.admin_feature_flags
       set payload = p_payload,
           updated_by = v_user_id,
           updated_at = now()
     where id = v_existing_id;
  end if;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (
    v_user_id,
    'admin_feature_flags.save',
    'admin_feature_flags',
    v_existing_id::text,
    jsonb_build_object('reason', v_reason)
  );

  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', v_existing_id));
end;
$$;

create or replace function public.admin_save_planos_config(
  p_payload jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_existing_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not public.is_admin_config_manager() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'array' then
    raise exception 'invalid_payload' using errcode = 'P0001';
  end if;

  select id into v_existing_id
  from public.admin_planos_config
  where config_key = 'default'
  for update;

  if v_existing_id is null then
    insert into public.admin_planos_config (config_key, payload, updated_by, updated_at)
    values ('default', p_payload, v_user_id, now())
    returning id into v_existing_id;
  else
    update public.admin_planos_config
       set payload = p_payload,
           updated_by = v_user_id,
           updated_at = now()
     where id = v_existing_id;
  end if;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (
    v_user_id,
    'admin_planos_config.save',
    'admin_planos_config',
    v_existing_id::text,
    jsonb_build_object('reason', v_reason)
  );

  return jsonb_build_object('ok', true, 'data', jsonb_build_object('id', v_existing_id));
end;
$$;

revoke execute on function public.admin_save_feature_flags(jsonb, text) from public, anon;
grant execute on function public.admin_save_feature_flags(jsonb, text) to authenticated, service_role;

revoke execute on function public.admin_save_planos_config(jsonb, text) from public, anon;
grant execute on function public.admin_save_planos_config(jsonb, text) to authenticated, service_role;
