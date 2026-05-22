begin;

create or replace function public.admin_can_manage_global_config()
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.perfis p
    where p.usuario_id = auth.uid()
      and lower(trim(coalesce(p.role::text, ''))) in ('admin_master', 'admin')
      and (lower(trim(coalesce(p.role::text, ''))) = 'admin_master' or p.equipe_id is null)
  );
$$;

create or replace function public.admin_update_pesquisa_passagens_branding(
  p_destination_images jsonb,
  p_brand_assets jsonb,
  p_airline_logos jsonb,
  p_program_card_logos jsonb,
  p_updated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'admin_pesquisa_config_unauthenticated' using errcode = '42501';
  end if;

  if not public.admin_can_manage_global_config() then
    raise exception 'admin_pesquisa_config_forbidden' using errcode = '42501';
  end if;

  insert into public.pesquisa_passagens_config(
    id,
    feature_enabled,
    destination_images,
    brand_assets,
    airline_logos,
    program_card_logos,
    updated_at,
    updated_by
  )
  values (
    1,
    true,
    coalesce(p_destination_images, '{}'::jsonb),
    coalesce(p_brand_assets, '{}'::jsonb),
    coalesce(p_airline_logos, '{}'::jsonb),
    coalesce(p_program_card_logos, '{}'::jsonb),
    now(),
    p_updated_by
  )
  on conflict (id) do update
    set destination_images = excluded.destination_images,
        brand_assets = excluded.brand_assets,
        airline_logos = excluded.airline_logos,
        program_card_logos = excluded.program_card_logos,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (
    auth.uid(),
    'admin_pesquisa_passagens.branding_update',
    'pesquisa_passagens_config',
    '1',
    '{}'::jsonb
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_save_pesquisa_passagens_config(
  p_feature_enabled boolean,
  p_allowed_roles text[],
  p_allowed_equipe_ids uuid[],
  p_denied_usuario_ids uuid[],
  p_allowed_plan_slugs text[],
  p_max_searches_user_per_day integer,
  p_max_searches_equipe_per_day integer,
  p_destination_images jsonb,
  p_brand_assets jsonb,
  p_airline_logos jsonb,
  p_program_card_logos jsonb,
  p_updated_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'admin_pesquisa_config_unauthenticated' using errcode = '42501';
  end if;

  if not public.admin_can_manage_global_config() then
    raise exception 'admin_pesquisa_config_forbidden' using errcode = '42501';
  end if;

  if coalesce(p_max_searches_user_per_day, 1) < 0 or coalesce(p_max_searches_equipe_per_day, 1) < 0 then
    raise exception 'admin_pesquisa_config_invalid_limits' using errcode = '23514';
  end if;

  insert into public.pesquisa_passagens_config(
    id,
    feature_enabled,
    allowed_roles,
    allowed_equipe_ids,
    denied_usuario_ids,
    allowed_plan_slugs,
    max_searches_user_per_day,
    max_searches_equipe_per_day,
    destination_images,
    brand_assets,
    airline_logos,
    program_card_logos,
    updated_at,
    updated_by
  )
  values (
    1,
    coalesce(p_feature_enabled, true),
    p_allowed_roles,
    p_allowed_equipe_ids,
    p_denied_usuario_ids,
    p_allowed_plan_slugs,
    p_max_searches_user_per_day,
    p_max_searches_equipe_per_day,
    coalesce(p_destination_images, '{}'::jsonb),
    coalesce(p_brand_assets, '{}'::jsonb),
    coalesce(p_airline_logos, '{}'::jsonb),
    coalesce(p_program_card_logos, '{}'::jsonb),
    now(),
    p_updated_by
  )
  on conflict (id) do update
    set feature_enabled = excluded.feature_enabled,
        allowed_roles = excluded.allowed_roles,
        allowed_equipe_ids = excluded.allowed_equipe_ids,
        denied_usuario_ids = excluded.denied_usuario_ids,
        allowed_plan_slugs = excluded.allowed_plan_slugs,
        max_searches_user_per_day = excluded.max_searches_user_per_day,
        max_searches_equipe_per_day = excluded.max_searches_equipe_per_day,
        destination_images = excluded.destination_images,
        brand_assets = excluded.brand_assets,
        airline_logos = excluded.airline_logos,
        program_card_logos = excluded.program_card_logos,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (
    auth.uid(),
    'admin_pesquisa_passagens.config_save',
    'pesquisa_passagens_config',
    '1',
    '{}'::jsonb
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_can_manage_global_config() from public, anon;
revoke all on function public.admin_update_pesquisa_passagens_branding(jsonb, jsonb, jsonb, jsonb, uuid) from public, anon;
revoke all on function public.admin_save_pesquisa_passagens_config(boolean, text[], uuid[], uuid[], text[], integer, integer, jsonb, jsonb, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.admin_update_pesquisa_passagens_branding(jsonb, jsonb, jsonb, jsonb, uuid) to authenticated, service_role;
grant execute on function public.admin_save_pesquisa_passagens_config(boolean, text[], uuid[], uuid[], text[], integer, integer, jsonb, jsonb, jsonb, jsonb, uuid) to authenticated, service_role;

commit;
