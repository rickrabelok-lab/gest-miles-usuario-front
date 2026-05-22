begin;

do $$
begin
  if to_regclass('public.captacao_hero_metrics') is null then
    raise exception 'missing_table_public_captacao_hero_metrics';
  end if;
end;
$$;

create or replace function public.manager_captacao_hero_metrics_can_manage(p_equipe_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_legacy_platform_admin()
    or public.can_admin_equipe(p_equipe_id)
    or public.equipe_usuario_eh_admin(p_equipe_id, auth.uid()),
    false
  );
$$;

create or replace function public.manager_captacao_hero_metrics_save(
  p_equipe_id uuid,
  p_slug text,
  p_metricas_json jsonb,
  p_whatsapp_comercial text default '',
  p_calc_primary_color text default null,
  p_calc_bg_color text default null,
  p_calc_brand_name text default null,
  p_calc_whatsapp text default null,
  p_calc_show_secondary_cta boolean default true,
  p_calc_secondary_cta_url text default null,
  p_calc_quiz_content_json jsonb default null,
  p_calc_ac_url text default null,
  p_calc_ac_form_id text default null,
  p_calc_ac_or_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_slug text := nullif(trim(p_slug), '');
begin
  if v_actor is null then
    raise exception 'manager_captacao_hero_metrics_unauthenticated' using errcode = '42501';
  end if;

  if p_equipe_id is null then
    raise exception 'manager_captacao_hero_metrics_missing_equipe' using errcode = '23502';
  end if;

  if v_slug is null then
    raise exception 'manager_captacao_hero_metrics_missing_slug' using errcode = '23514';
  end if;

  if not public.manager_captacao_hero_metrics_can_manage(p_equipe_id) then
    raise exception 'manager_captacao_hero_metrics_forbidden' using errcode = '42501';
  end if;

  insert into public.captacao_hero_metrics (
    equipe_id,
    slug,
    metricas_json,
    whatsapp_comercial,
    calc_primary_color,
    calc_bg_color,
    calc_brand_name,
    calc_whatsapp,
    calc_show_secondary_cta,
    calc_secondary_cta_url,
    calc_quiz_content_json,
    calc_ac_url,
    calc_ac_form_id,
    calc_ac_or_hash,
    updated_by,
    updated_at
  )
  values (
    p_equipe_id,
    v_slug,
    coalesce(p_metricas_json, '[]'::jsonb),
    coalesce(trim(p_whatsapp_comercial), ''),
    nullif(trim(p_calc_primary_color), ''),
    nullif(trim(p_calc_bg_color), ''),
    nullif(trim(p_calc_brand_name), ''),
    nullif(trim(p_calc_whatsapp), ''),
    coalesce(p_calc_show_secondary_cta, true),
    nullif(trim(p_calc_secondary_cta_url), ''),
    p_calc_quiz_content_json,
    nullif(trim(p_calc_ac_url), ''),
    nullif(trim(p_calc_ac_form_id), ''),
    nullif(trim(p_calc_ac_or_hash), ''),
    v_actor,
    now()
  )
  on conflict (equipe_id, slug) do update
  set metricas_json = excluded.metricas_json,
      whatsapp_comercial = excluded.whatsapp_comercial,
      calc_primary_color = excluded.calc_primary_color,
      calc_bg_color = excluded.calc_bg_color,
      calc_brand_name = excluded.calc_brand_name,
      calc_whatsapp = excluded.calc_whatsapp,
      calc_show_secondary_cta = excluded.calc_show_secondary_cta,
      calc_secondary_cta_url = excluded.calc_secondary_cta_url,
      calc_quiz_content_json = excluded.calc_quiz_content_json,
      calc_ac_url = excluded.calc_ac_url,
      calc_ac_form_id = excluded.calc_ac_form_id,
      calc_ac_or_hash = excluded.calc_ac_or_hash,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true, 'equipe_id', p_equipe_id, 'slug', v_slug);
end;
$$;

revoke all on function public.manager_captacao_hero_metrics_can_manage(uuid) from public, anon;
revoke all on function public.manager_captacao_hero_metrics_can_manage(uuid) from authenticated, service_role;
revoke all on function public.manager_captacao_hero_metrics_save(uuid, text, jsonb, text, text, text, text, text, boolean, text, jsonb, text, text, text) from public, anon;
grant execute on function public.manager_captacao_hero_metrics_save(uuid, text, jsonb, text, text, text, text, text, boolean, text, jsonb, text, text, text) to authenticated, service_role;

commit;
