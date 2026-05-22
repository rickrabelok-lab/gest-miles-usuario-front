-- B2 admin security RPCs expected by admin-app.
-- Local migration only: do not apply without explicit production approval.

do $$
begin
  if to_regclass('public.perfis') is null then
    raise exception 'missing dependency: public.perfis';
  end if;

  if to_regclass('public.logs_acoes') is null then
    raise exception 'missing dependency: public.logs_acoes';
  end if;

  if to_regclass('public.admin_security_settings') is null then
    raise exception 'missing dependency: public.admin_security_settings';
  end if;

  if to_regclass('public.admin_email_lockouts') is null then
    raise exception 'missing dependency: public.admin_email_lockouts';
  end if;

  if to_regclass('public.admin_session_activity') is null then
    raise exception 'missing dependency: public.admin_session_activity';
  end if;

  if to_regclass('public.admin_security_config') is null then
    raise exception 'missing dependency: public.admin_security_config';
  end if;

  if to_regprocedure('public.is_admin_global_or_master()') is null then
    raise exception 'missing dependency: public.is_admin_global_or_master()';
  end if;

  if to_regprocedure('public.is_admin_security_viewer()') is null then
    raise exception 'missing dependency: public.is_admin_security_viewer()';
  end if;

  if to_regprocedure('public.is_admin_security_config_manager()') is null then
    raise exception 'missing dependency: public.is_admin_security_config_manager()';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_security_settings'
      and column_name in ('id', 'max_failed_attempts', 'lockout_minutes', 'failure_window_minutes', 'updated_at')
    group by table_schema, table_name
    having count(*) = 5
  ) then
    raise exception 'missing expected columns on public.admin_security_settings';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_email_lockouts'
      and column_name in ('email_norm', 'locked_until', 'updated_at')
    group by table_schema, table_name
    having count(*) = 3
  ) then
    raise exception 'missing expected columns on public.admin_email_lockouts';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_session_activity'
      and column_name in ('usuario_id', 'email', 'ip', 'device', 'last_seen_at')
    group by table_schema, table_name
    having count(*) = 5
  ) then
    raise exception 'missing expected columns on public.admin_session_activity';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_security_config'
      and column_name in ('config_key', 'payload', 'updated_by', 'updated_at')
    group by table_schema, table_name
    having count(*) = 4
  ) then
    raise exception 'missing expected columns on public.admin_security_config';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'logs_acoes'
      and column_name in ('user_id', 'tipo_acao', 'entidade_afetada', 'entidade_id', 'details')
    group by table_schema, table_name
    having count(*) = 5
  ) then
    raise exception 'missing expected columns on public.logs_acoes';
  end if;
end;
$$;

create or replace function public.admin_security_update_settings(
  p_max_failed_attempts integer,
  p_lockout_minutes integer,
  p_failure_window_minutes integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_old public.admin_security_settings%rowtype;
  v_new public.admin_security_settings%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_created boolean := false;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not public.is_admin_global_or_master() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_max_failed_attempts is null
    or p_lockout_minutes is null
    or p_failure_window_minutes is null
    or p_max_failed_attempts < 1
    or p_max_failed_attempts > 50
    or p_lockout_minutes < 1
    or p_lockout_minutes > 1440
    or p_failure_window_minutes < 1
    or p_failure_window_minutes > 240
  then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  select * into v_old from public.admin_security_settings where id = 1 for update;
  if not found then
    insert into public.admin_security_settings (id, max_failed_attempts, lockout_minutes, failure_window_minutes, updated_at)
    values (1, p_max_failed_attempts, p_lockout_minutes, p_failure_window_minutes, now())
    returning * into v_new;
    v_created := true;
  else
    update public.admin_security_settings
       set max_failed_attempts = p_max_failed_attempts,
           lockout_minutes = p_lockout_minutes,
           failure_window_minutes = p_failure_window_minutes,
           updated_at = now()
     where id = 1
     returning * into v_new;
  end if;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (
    v_user_id,
    'admin_security_settings.update',
    'admin_security_settings',
    '1',
    jsonb_build_object(
      'created_singleton', v_created,
      'reason', v_reason,
      'old', case when v_created then null else jsonb_build_object(
        'max_failed_attempts', v_old.max_failed_attempts,
        'lockout_minutes', v_old.lockout_minutes,
        'failure_window_minutes', v_old.failure_window_minutes,
        'updated_at', v_old.updated_at
      ) end,
      'new', jsonb_build_object(
        'max_failed_attempts', v_new.max_failed_attempts,
        'lockout_minutes', v_new.lockout_minutes,
        'failure_window_minutes', v_new.failure_window_minutes,
        'updated_at', v_new.updated_at
      )
    )
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'settings', to_jsonb(v_new)
    )
  );
end;
$$;

create or replace function public.admin_security_unlock_email(
  p_email_norm text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email_norm text := lower(trim(coalesce(p_email_norm, '')));
  v_old public.admin_email_lockouts%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_removed boolean := false;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not public.is_admin_global_or_master() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_email_norm = '' or v_email_norm !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  select * into v_old from public.admin_email_lockouts where email_norm = v_email_norm for update;
  if found then
    delete from public.admin_email_lockouts where email_norm = v_email_norm;
    v_removed := true;
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_user_id,
      'admin_email_lockouts.unlock',
      'admin_email_lockouts',
      v_email_norm,
      jsonb_build_object('previous_locked_until', v_old.locked_until, 'previous_updated_at', v_old.updated_at, 'reason', v_reason)
    );
  elsif v_reason is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (v_user_id, 'admin_email_lockouts.unlock.noop', 'admin_email_lockouts', v_email_norm, jsonb_build_object('reason', v_reason));
  end if;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'email_norm', v_email_norm,
      'removed', v_removed,
      'previous_locked_until', case when v_removed then v_old.locked_until else null end
    )
  );
end;
$$;

create or replace function public.admin_security_touch_session(
  p_email text default null,
  p_ip text default null,
  p_device text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_ip text := nullif(left(trim(coalesce(p_ip, '')), 64), '');
  v_device text := nullif(left(trim(coalesce(p_device, '')), 64), '');
  v_row public.admin_session_activity%rowtype;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if v_jwt_email <> '' then
    v_email := v_jwt_email;
  elsif v_email = '' then
    v_email := null;
  end if;

  insert into public.admin_session_activity as session_activity (usuario_id, email, ip, device, last_seen_at)
  values (v_user_id, v_email, v_ip, v_device, now())
  on conflict (usuario_id) do update
    set email = excluded.email,
        ip = excluded.ip,
        device = excluded.device,
        last_seen_at = now()
  returning * into v_row;

  return jsonb_build_object('ok', true, 'data', jsonb_build_object('usuario_id', v_row.usuario_id, 'last_seen_at', v_row.last_seen_at));
end;
$$;

create or replace function public.admin_security_save_config(
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
  v_old_payload jsonb;
  v_new public.admin_security_config%rowtype;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  v_key text;
  v_item jsonb;
  v_ip text;
  v_octet text;
  v_created boolean := false;
  v_old_manual jsonb := '[]'::jsonb;
  v_new_manual jsonb := '[]'::jsonb;
  v_old_whitelist jsonb := '[]'::jsonb;
  v_new_whitelist jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not public.is_admin_security_config_manager() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 65536 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  for v_key in select jsonb_object_keys(p_payload) loop
    if v_key not in ('extra', 'manual_ip_blocks', 'ip_whitelist') then
      raise exception 'invalid_input: unexpected top-level key %', v_key using errcode = 'P0001';
    end if;
  end loop;

  if p_payload ? 'extra' then
    if jsonb_typeof(p_payload -> 'extra') <> 'object' then
      raise exception 'invalid_input: extra must be object' using errcode = 'P0001';
    end if;
    for v_key in select jsonb_object_keys(p_payload -> 'extra') loop
      if v_key not in ('notif_admin', 'twofa_obrigatorio') then
        raise exception 'invalid_input: unexpected extra key %', v_key using errcode = 'P0001';
      end if;
      if jsonb_typeof((p_payload -> 'extra') -> v_key) <> 'boolean' then
        raise exception 'invalid_input: extra.% must be boolean', v_key using errcode = 'P0001';
      end if;
    end loop;
  end if;

  if p_payload ? 'manual_ip_blocks' then
    if jsonb_typeof(p_payload -> 'manual_ip_blocks') <> 'array' then
      raise exception 'invalid_input: manual_ip_blocks must be array' using errcode = 'P0001';
    end if;
    if jsonb_array_length(p_payload -> 'manual_ip_blocks') > 500 then
      raise exception 'invalid_input: too many manual_ip_blocks' using errcode = 'P0001';
    end if;
    for v_item in select * from jsonb_array_elements(p_payload -> 'manual_ip_blocks') loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'invalid_input: manual_ip_blocks item must be object' using errcode = 'P0001';
      end if;
      for v_key in select jsonb_object_keys(v_item) loop
        if v_key not in ('id', 'ip', 'motivo', 'bloqueado_em', 'expira_em', 'bloqueado_por') then
          raise exception 'invalid_input: unexpected manual_ip_blocks key %', v_key using errcode = 'P0001';
        end if;
      end loop;
      v_ip := trim(coalesce(v_item ->> 'ip', ''));
      if coalesce(v_item ->> 'id', '') = '' or length(v_item ->> 'id') > 80 then
        raise exception 'invalid_input: invalid manual_ip_blocks.id' using errcode = 'P0001';
      end if;
      if coalesce(v_item ->> 'motivo', '') not in ('manual', 'forca_bruta', 'suspeito') then
        raise exception 'invalid_input: invalid manual_ip_blocks.motivo' using errcode = 'P0001';
      end if;
      if v_ip !~ '^\d{1,3}(\.\d{1,3}){3}$' then
        raise exception 'invalid_input: invalid manual_ip_blocks.ip' using errcode = 'P0001';
      end if;
      foreach v_octet in array regexp_split_to_array(v_ip, '\.') loop
        if v_octet::int < 0 or v_octet::int > 255 then
          raise exception 'invalid_input: invalid manual_ip_blocks.ip octet' using errcode = 'P0001';
        end if;
      end loop;
      if coalesce(v_item ->> 'bloqueado_em', '') = '' then
        raise exception 'invalid_input: bloqueado_em required' using errcode = 'P0001';
      end if;
      begin
        perform (v_item ->> 'bloqueado_em')::timestamptz;
      exception when invalid_datetime_format then
        raise exception 'invalid_input: invalid manual_ip_blocks.bloqueado_em' using errcode = 'P0001';
      end;
      if v_item ? 'expira_em' and v_item ->> 'expira_em' is not null and v_item ->> 'expira_em' <> '' then
        begin
          perform (v_item ->> 'expira_em')::timestamptz;
        exception when invalid_datetime_format then
          raise exception 'invalid_input: invalid manual_ip_blocks.expira_em' using errcode = 'P0001';
        end;
      end if;
    end loop;
  end if;

  if p_payload ? 'ip_whitelist' then
    if jsonb_typeof(p_payload -> 'ip_whitelist') <> 'array' then
      raise exception 'invalid_input: ip_whitelist must be array' using errcode = 'P0001';
    end if;
    if jsonb_array_length(p_payload -> 'ip_whitelist') > 500 then
      raise exception 'invalid_input: too many ip_whitelist items' using errcode = 'P0001';
    end if;
    for v_item in select * from jsonb_array_elements(p_payload -> 'ip_whitelist') loop
      if jsonb_typeof(v_item) <> 'string' then
        raise exception 'invalid_input: ip_whitelist item must be string' using errcode = 'P0001';
      end if;
      v_ip := trim(v_item #>> '{}');
      if v_ip !~ '^\d{1,3}(\.\d{1,3}){3}$' then
        raise exception 'invalid_input: invalid ip_whitelist ip' using errcode = 'P0001';
      end if;
      foreach v_octet in array regexp_split_to_array(v_ip, '\.') loop
        if v_octet::int < 0 or v_octet::int > 255 then
          raise exception 'invalid_input: invalid ip_whitelist octet' using errcode = 'P0001';
        end if;
      end loop;
    end loop;
    p_payload := jsonb_set(
      p_payload,
      '{ip_whitelist}',
      coalesce((select jsonb_agg(distinct to_jsonb(trim(value #>> '{}'))) from jsonb_array_elements(p_payload -> 'ip_whitelist') as t(value)), '[]'::jsonb),
      true
    );
  end if;

  select payload into v_old_payload from public.admin_security_config where config_key = 'default' for update;
  v_created := not found;

  insert into public.admin_security_config (config_key, payload, updated_by, updated_at)
  values ('default', p_payload, v_user_id, now())
  on conflict (config_key) do update
    set payload = excluded.payload,
        updated_by = excluded.updated_by,
        updated_at = now()
  returning * into v_new;

  v_old_manual := coalesce(v_old_payload -> 'manual_ip_blocks', '[]'::jsonb);
  v_new_manual := coalesce(p_payload -> 'manual_ip_blocks', '[]'::jsonb);
  v_old_whitelist := coalesce(v_old_payload -> 'ip_whitelist', '[]'::jsonb);
  v_new_whitelist := coalesce(p_payload -> 'ip_whitelist', '[]'::jsonb);

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (
    v_user_id,
    'admin_security_config.save',
    'admin_security_config',
    'default',
    jsonb_build_object(
      'created_singleton', v_created,
      'reason', v_reason,
      'extra_changed', coalesce(v_old_payload -> 'extra', '{}'::jsonb) is distinct from coalesce(p_payload -> 'extra', '{}'::jsonb),
      'manual_ip_blocks_old_count', jsonb_array_length(v_old_manual),
      'manual_ip_blocks_new_count', jsonb_array_length(v_new_manual),
      'ip_whitelist_old_count', jsonb_array_length(v_old_whitelist),
      'ip_whitelist_new_count', jsonb_array_length(v_new_whitelist)
    )
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'config_key', 'default',
      'updated_by', v_new.updated_by,
      'updated_at', v_new.updated_at,
      'manual_ip_blocks_count', jsonb_array_length(v_new_manual),
      'ip_whitelist_count', jsonb_array_length(v_new_whitelist)
    )
  );
end;
$$;

revoke execute on function public.admin_security_update_settings(integer, integer, integer, text) from public, anon;
grant execute on function public.admin_security_update_settings(integer, integer, integer, text) to authenticated;

revoke execute on function public.admin_security_unlock_email(text, text) from public, anon;
grant execute on function public.admin_security_unlock_email(text, text) to authenticated;

revoke execute on function public.admin_security_touch_session(text, text, text) from public, anon;
grant execute on function public.admin_security_touch_session(text, text, text) to authenticated;

revoke execute on function public.admin_security_save_config(jsonb, text) from public, anon;
grant execute on function public.admin_security_save_config(jsonb, text) to authenticated;
