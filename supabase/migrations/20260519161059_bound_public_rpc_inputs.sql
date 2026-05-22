create or replace function public.admin_security_is_email_locked(p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  u timestamptz;
  en text := lower(left(trim(coalesce(p_email, '')), 320));
begin
  if en = '' then
    return jsonb_build_object('locked', false);
  end if;

  select locked_until into u
  from public.admin_email_lockouts
  where email_norm = en;

  if u is null then
    return jsonb_build_object('locked', false);
  end if;

  if u > now() then
    return jsonb_build_object('locked', true, 'until', u);
  end if;

  delete from public.admin_email_lockouts
  where email_norm = en;

  return jsonb_build_object('locked', false);
end;
$function$;

create or replace function public.admin_security_on_failed_login(
  p_email text,
  p_ip text,
  p_device text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  en text := lower(left(trim(coalesce(p_email, '')), 320));
  max_att int;
  lock_m int;
  win_m int;
  cnt int;
  new_until timestamptz;
begin
  if en = '' then
    return jsonb_build_object('ok', false, 'reason', 'empty_email');
  end if;

  insert into public.admin_failed_login (email_norm, ip, device, user_agent)
  values (
    en,
    nullif(left(trim(coalesce(p_ip, '')), 64), ''),
    nullif(left(trim(coalesce(p_device, '')), 128), ''),
    nullif(left(trim(coalesce(p_user_agent, '')), 512), '')
  );

  select max_failed_attempts, lockout_minutes, failure_window_minutes
  into max_att, lock_m, win_m
  from public.admin_security_settings
  where id = 1;

  max_att := coalesce(max_att, 5);
  lock_m := coalesce(lock_m, 15);
  win_m := coalesce(win_m, 15);

  select count(*)::int into cnt
  from public.admin_failed_login
  where email_norm = en
    and created_at > (now() - ((win_m::text || ' minutes')::interval));

  if cnt >= max_att then
    new_until := now() + ((lock_m::text || ' minutes')::interval);

    insert into public.admin_email_lockouts (email_norm, locked_until, updated_at)
    values (en, new_until, now())
    on conflict (email_norm) do update
      set locked_until = excluded.locked_until,
          updated_at = now();

    return jsonb_build_object(
      'ok', true,
      'now_locked', true,
      'locked_until', new_until,
      'failures_in_window', cnt
    );
  end if;

  return jsonb_build_object('ok', true, 'now_locked', false, 'failures_in_window', cnt);
end;
$function$;

create or replace function public.insert_captacao_event(
  p_slug text,
  p_event_name text,
  p_event_id text default null::text,
  p_session_id text default null::text,
  p_fbclid text default null::text,
  p_gclid text default null::text,
  p_utm_source text default null::text,
  p_utm_medium text default null::text,
  p_utm_campaign text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_slug text := nullif(left(trim(coalesce(p_slug, '')), 160), '');
  v_event_name text := nullif(left(trim(coalesce(p_event_name, '')), 80), '');
  v_equipe_id uuid;
begin
  if v_slug is null or v_event_name is null then
    return;
  end if;

  v_equipe_id := public.resolver_equipe_por_captacao_slug(v_slug);
  if v_equipe_id is null then
    return;
  end if;

  insert into public.captacao_events (
    equipe_id,
    slug,
    event_name,
    event_id,
    session_id,
    fbclid,
    gclid,
    utm_source,
    utm_medium,
    utm_campaign
  ) values (
    v_equipe_id,
    v_slug,
    v_event_name,
    nullif(left(trim(coalesce(p_event_id, '')), 160), ''),
    nullif(left(trim(coalesce(p_session_id, '')), 160), ''),
    nullif(left(trim(coalesce(p_fbclid, '')), 512), ''),
    nullif(left(trim(coalesce(p_gclid, '')), 512), ''),
    nullif(left(trim(coalesce(p_utm_source, '')), 160), ''),
    nullif(left(trim(coalesce(p_utm_medium, '')), 160), ''),
    nullif(left(trim(coalesce(p_utm_campaign, '')), 240), '')
  );
end;
$function$;

revoke execute on function public.admin_security_is_email_locked(text) from public;
revoke execute on function public.admin_security_on_failed_login(text, text, text, text) from public;
revoke execute on function public.insert_captacao_event(text, text, text, text, text, text, text, text, text) from public;

grant execute on function public.admin_security_is_email_locked(text) to anon, authenticated;
grant execute on function public.admin_security_on_failed_login(text, text, text, text) to anon, authenticated;
grant execute on function public.insert_captacao_event(text, text, text, text, text, text, text, text, text) to anon, authenticated;
