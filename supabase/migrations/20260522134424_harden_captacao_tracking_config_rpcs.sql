begin;

do $$
begin
  if to_regclass('public.captacao_tracking_configs') is null then
    raise exception 'missing_table_public_captacao_tracking_configs';
  end if;

  if to_regprocedure('public.is_legacy_platform_admin()') is null then
    raise exception 'missing_function_public_is_legacy_platform_admin';
  end if;

  if to_regprocedure('public.can_admin_equipe(uuid)') is null then
    raise exception 'missing_function_public_can_admin_equipe';
  end if;

  if to_regprocedure('public.equipe_usuario_eh_admin(uuid, uuid)') is null then
    raise exception 'missing_function_public_equipe_usuario_eh_admin';
  end if;
end;
$$;

create or replace function public.can_manage_captacao_tracking_config(p_equipe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and p_equipe_id is not null
    and (
      public.is_legacy_platform_admin()
      or public.can_admin_equipe(p_equipe_id)
      or public.equipe_usuario_eh_admin(p_equipe_id, auth.uid())
    );
$$;

create or replace function public.get_captacao_tracking_config_admin(p_equipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.captacao_tracking_configs%rowtype;
begin
  if not public.can_manage_captacao_tracking_config(p_equipe_id) then
    raise exception 'captacao_tracking_config_forbidden' using errcode = '42501';
  end if;

  select *
    into v_row
    from public.captacao_tracking_configs
   where equipe_id = p_equipe_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'gtm_container_id', v_row.gtm_container_id,
    'meta_pixel_id', v_row.meta_pixel_id,
    'meta_test_event_code', v_row.meta_test_event_code,
    'google_ads_customer_id', v_row.google_ads_customer_id,
    'google_ads_conversion_actions', v_row.google_ads_conversion_actions,
    'has_meta_access_token', coalesce(v_row.meta_access_token, '') <> '',
    'has_google_ads_refresh_token', coalesce(v_row.google_ads_refresh_token, '') <> ''
  );
end;
$$;

create or replace function public.save_captacao_tracking_gtm(
  p_equipe_id uuid,
  p_gtm_container_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_captacao_tracking_config(p_equipe_id) then
    raise exception 'captacao_tracking_config_forbidden' using errcode = '42501';
  end if;

  insert into public.captacao_tracking_configs(equipe_id, gtm_container_id, updated_at)
  values (p_equipe_id, nullif(trim(coalesce(p_gtm_container_id, '')), ''), now())
  on conflict (equipe_id) do update
    set gtm_container_id = excluded.gtm_container_id,
        updated_at = now();

  return public.get_captacao_tracking_config_admin(p_equipe_id);
end;
$$;

create or replace function public.save_captacao_tracking_meta(
  p_equipe_id uuid,
  p_meta_pixel_id text,
  p_meta_access_token text default null,
  p_meta_test_event_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_captacao_tracking_config(p_equipe_id) then
    raise exception 'captacao_tracking_config_forbidden' using errcode = '42501';
  end if;

  insert into public.captacao_tracking_configs(
    equipe_id,
    meta_pixel_id,
    meta_access_token,
    meta_test_event_code,
    updated_at
  )
  values (
    p_equipe_id,
    nullif(trim(coalesce(p_meta_pixel_id, '')), ''),
    nullif(trim(coalesce(p_meta_access_token, '')), ''),
    nullif(trim(coalesce(p_meta_test_event_code, '')), ''),
    now()
  )
  on conflict (equipe_id) do update
    set meta_pixel_id = excluded.meta_pixel_id,
        meta_access_token = coalesce(excluded.meta_access_token, public.captacao_tracking_configs.meta_access_token),
        meta_test_event_code = excluded.meta_test_event_code,
        updated_at = now();

  return public.get_captacao_tracking_config_admin(p_equipe_id);
end;
$$;

create or replace function public.save_captacao_tracking_google_ads(
  p_equipe_id uuid,
  p_google_ads_customer_id text,
  p_google_ads_conversion_actions jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_captacao_tracking_config(p_equipe_id) then
    raise exception 'captacao_tracking_config_forbidden' using errcode = '42501';
  end if;

  insert into public.captacao_tracking_configs(
    equipe_id,
    google_ads_customer_id,
    google_ads_conversion_actions,
    updated_at
  )
  values (
    p_equipe_id,
    nullif(trim(coalesce(p_google_ads_customer_id, '')), ''),
    coalesce(p_google_ads_conversion_actions, '{}'::jsonb),
    now()
  )
  on conflict (equipe_id) do update
    set google_ads_customer_id = excluded.google_ads_customer_id,
        google_ads_conversion_actions = excluded.google_ads_conversion_actions,
        updated_at = now();

  return public.get_captacao_tracking_config_admin(p_equipe_id);
end;
$$;

create or replace function public.disconnect_captacao_google_ads(p_equipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_manage_captacao_tracking_config(p_equipe_id) then
    raise exception 'captacao_tracking_config_forbidden' using errcode = '42501';
  end if;

  update public.captacao_tracking_configs
     set google_ads_refresh_token = null,
         updated_at = now()
   where equipe_id = p_equipe_id;

  return public.get_captacao_tracking_config_admin(p_equipe_id);
end;
$$;

revoke all on function public.can_manage_captacao_tracking_config(uuid) from public, anon, authenticated;

revoke all on function public.get_captacao_tracking_config_admin(uuid) from public, anon;
grant execute on function public.get_captacao_tracking_config_admin(uuid) to authenticated, service_role;

revoke all on function public.save_captacao_tracking_gtm(uuid, text) from public, anon;
grant execute on function public.save_captacao_tracking_gtm(uuid, text) to authenticated, service_role;

revoke all on function public.save_captacao_tracking_meta(uuid, text, text, text) from public, anon;
grant execute on function public.save_captacao_tracking_meta(uuid, text, text, text) to authenticated, service_role;

revoke all on function public.save_captacao_tracking_google_ads(uuid, text, jsonb) from public, anon;
grant execute on function public.save_captacao_tracking_google_ads(uuid, text, jsonb) to authenticated, service_role;

revoke all on function public.disconnect_captacao_google_ads(uuid) from public, anon;
grant execute on function public.disconnect_captacao_google_ads(uuid) to authenticated, service_role;

revoke insert, update, delete on table public.captacao_tracking_configs from authenticated;

commit;
