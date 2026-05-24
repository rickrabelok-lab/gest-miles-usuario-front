-- Draft only. Do not apply without Science/Rick approval.
-- Phase A: introduce/update the public captacao lead RPC with the minimal
-- anti-abuse layer while preserving current direct INSERT grants on
-- public.captacao_leads for zero-downtime rollout.
--
-- This is the canonical Phase A draft. Do not apply
-- 20260524123000_public_captacao_lead_anti_abuse_minimal.sql.draft separately;
-- its contents were consolidated here to avoid ambiguous rollout order.
--
-- Rollout order:
--   1. Apply Phase A.
--   2. Deploy clients that call public.public_captacao_lead_create.
--   3. Smoke CaptacaoPublicaPage and CalcPublicaPage with anon and authenticated sessions.
--   4. Apply Phase B only after RPC traffic is verified.
--
-- Rollback for Phase A:
--   revoke all on function public.public_captacao_lead_create(
--     uuid, text, text, text, text, text, text, text, text, text, text, text,
--     text, text, text, text, text, text, text, text, text, uuid, text, bigint, text
--   ) from public, anon, authenticated, service_role;
--   drop function if exists public.public_captacao_lead_create(
--     uuid, text, text, text, text, text, text, text, text, text, text, text,
--     text, text, text, text, text, text, text, text, text, uuid, text, bigint, text
--   );

begin;

do $$
declare
  v_missing_columns text[];
begin
  if to_regclass('public.captacao_leads') is null then
    raise exception 'missing_table_public_captacao_leads';
  end if;

  select array_agg(required_column order by required_column)
  into v_missing_columns
  from unnest(array[
    'id',
    'equipe_id',
    'slug',
    'nome',
    'email',
    'telefone',
    'gasto_mensal_cartao',
    'interesse',
    'canal',
    'observacoes',
    'captured_host',
    'fbclid',
    'gclid',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'fbc',
    'fbp',
    'event_id',
    'user_agent',
    'created_at'
  ]::text[]) as required_columns(required_column)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'captacao_leads'
      and c.column_name = required_column
  );

  if coalesce(array_length(v_missing_columns, 1), 0) > 0 then
    raise exception 'missing_columns_public_captacao_leads: %', array_to_string(v_missing_columns, ',');
  end if;

  if to_regprocedure('public.resolver_equipe_por_captacao_slug(text)') is null then
    raise exception 'missing_function_public_resolver_equipe_por_captacao_slug';
  end if;
end;
$$;

drop function if exists public.public_captacao_lead_create(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, uuid
);

drop function if exists public.public_captacao_lead_create(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, uuid, text, bigint, text
);

create or replace function public.public_captacao_lead_create(
  p_equipe_id uuid,
  p_slug text,
  p_nome text,
  p_email text,
  p_telefone text,
  p_gasto_mensal_cartao text default '',
  p_interesse text default '',
  p_canal text default 'pagina_publica',
  p_observacoes text default '',
  p_captured_host text default '',
  p_fbclid text default null,
  p_gclid text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_fbc text default null,
  p_fbp text default null,
  p_event_id text default null,
  p_user_agent text default null,
  p_id uuid default null,
  p_hp_field text default '',
  p_rendered_at_ms bigint default null,
  p_submit_nonce text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_inserted_id uuid;
  v_slug text := nullif(left(btrim(coalesce(p_slug, '')), 160), '');
  v_nome text := nullif(left(btrim(coalesce(p_nome, '')), 240), '');
  v_email text := nullif(left(btrim(coalesce(p_email, '')), 320), '');
  v_email_norm text := lower(coalesce(v_email, ''));
  v_telefone text := nullif(left(btrim(coalesce(p_telefone, '')), 80), '');
  v_phone_norm text := regexp_replace(coalesce(v_telefone, ''), '[^0-9]+', '', 'g');
  v_canal text := nullif(left(btrim(coalesce(p_canal, 'pagina_publica')), 80), '');
  v_resolved_equipe_id uuid;
  v_public_count_10m integer;
  v_public_count_1h integer;
  v_public_count_24h integer;
  v_contact_count_24h integer;
  v_now_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if p_equipe_id is null then
    raise exception 'public_captacao_lead_missing_equipe' using errcode = '23502';
  end if;

  if v_slug is null then
    raise exception 'public_captacao_lead_missing_slug' using errcode = '23514';
  end if;

  if v_nome is null or v_email is null or v_telefone is null then
    raise exception 'public_captacao_lead_missing_contact' using errcode = '23514';
  end if;

  if v_canal is null or v_canal not in ('pagina_publica', 'calculadora_publica') then
    raise exception 'public_captacao_lead_invalid_canal' using errcode = '23514';
  end if;

  if nullif(btrim(coalesce(p_hp_field, '')), '') is not null then
    raise exception 'public_captacao_lead_rejected' using errcode = '42501';
  end if;

  if p_rendered_at_ms is not null
     and p_rendered_at_ms > 0
     and v_now_ms - p_rendered_at_ms < 2500 then
    raise exception 'public_captacao_lead_too_fast' using errcode = '42501';
  end if;

  if length(coalesce(p_submit_nonce, '')) > 200 then
    raise exception 'public_captacao_lead_invalid_nonce' using errcode = '23514';
  end if;

  v_resolved_equipe_id := public.resolver_equipe_por_captacao_slug(v_slug);
  if v_resolved_equipe_id is distinct from p_equipe_id then
    raise exception 'public_captacao_lead_slug_equipe_mismatch' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_public_count_10m
  from public.captacao_leads
  where equipe_id = p_equipe_id
    and canal in ('pagina_publica', 'calculadora_publica')
    and created_at >= now() - interval '10 minutes';

  if v_public_count_10m >= 10 then
    raise exception 'public_captacao_lead_rate_limited_10m' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_public_count_1h
  from public.captacao_leads
  where equipe_id = p_equipe_id
    and canal in ('pagina_publica', 'calculadora_publica')
    and created_at >= now() - interval '1 hour';

  if v_public_count_1h >= 30 then
    raise exception 'public_captacao_lead_rate_limited_1h' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_public_count_24h
  from public.captacao_leads
  where equipe_id = p_equipe_id
    and canal in ('pagina_publica', 'calculadora_publica')
    and created_at >= now() - interval '24 hours';

  if v_public_count_24h >= 200 then
    raise exception 'public_captacao_lead_rate_limited_24h' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_contact_count_24h
  from public.captacao_leads
  where equipe_id = p_equipe_id
    and canal in ('pagina_publica', 'calculadora_publica')
    and created_at >= now() - interval '24 hours'
    and (
      lower(coalesce(email, '')) = v_email_norm
      or regexp_replace(coalesce(telefone, ''), '[^0-9]+', '', 'g') = v_phone_norm
    );

  if v_contact_count_24h >= 2 then
    raise exception 'public_captacao_lead_contact_rate_limited_24h' using errcode = 'P0001';
  end if;

  insert into public.captacao_leads (
    id,
    equipe_id,
    slug,
    nome,
    email,
    telefone,
    gasto_mensal_cartao,
    interesse,
    canal,
    observacoes,
    captured_host,
    fbclid,
    gclid,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    fbc,
    fbp,
    event_id,
    user_agent
  )
  values (
    v_id,
    p_equipe_id,
    v_slug,
    v_nome,
    v_email,
    v_telefone,
    left(coalesce(p_gasto_mensal_cartao, ''), 240),
    left(coalesce(p_interesse, ''), 500),
    v_canal,
    left(coalesce(p_observacoes, ''), 4000),
    left(coalesce(p_captured_host, ''), 255),
    nullif(left(btrim(coalesce(p_fbclid, '')), 512), ''),
    nullif(left(btrim(coalesce(p_gclid, '')), 512), ''),
    nullif(left(btrim(coalesce(p_utm_source, '')), 160), ''),
    nullif(left(btrim(coalesce(p_utm_medium, '')), 160), ''),
    nullif(left(btrim(coalesce(p_utm_campaign, '')), 240), ''),
    nullif(left(btrim(coalesce(p_utm_content, '')), 240), ''),
    nullif(left(btrim(coalesce(p_utm_term, '')), 240), ''),
    nullif(left(btrim(coalesce(p_fbc, '')), 512), ''),
    nullif(left(btrim(coalesce(p_fbp, '')), 512), ''),
    nullif(left(btrim(coalesce(p_event_id, '')), 160), ''),
    nullif(left(coalesce(p_user_agent, ''), 500), '')
  )
  on conflict (id) do nothing
  returning id into v_inserted_id;

  return jsonb_build_object(
    'ok', true,
    'id', coalesce(v_inserted_id, v_id),
    'duplicate', v_inserted_id is null
  );
end;
$$;

comment on function public.public_captacao_lead_create(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, uuid, text, bigint, text
) is
  'Phase A public captacao lead RPC with minimal anti-abuse. Creates a lead through bounded '
  'security-definer validation while preserving direct INSERT grants until Phase B.';

revoke all on function public.public_captacao_lead_create(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, uuid, text, bigint, text
) from public, anon, authenticated, service_role;

grant execute on function public.public_captacao_lead_create(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, uuid, text, bigint, text
) to anon, authenticated, service_role;

commit;
