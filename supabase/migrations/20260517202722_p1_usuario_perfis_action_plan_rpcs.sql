begin;

create or replace function public.ensure_self_cliente_profile(
  p_slug text,
  p_nome_completo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
  v_nome text := nullif(trim(coalesce(p_nome_completo, '')), '');
begin
  if v_actor is null then
    raise exception 'self_profile_unauthenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.perfis p where p.usuario_id = v_actor) then
    return jsonb_build_object('ok', true, 'created', false);
  end if;

  if v_slug is null then
    v_slug := 'cliente-' || substring(v_actor::text from 1 for 8);
  end if;

  if exists (select 1 from public.perfis p where p.slug = v_slug) then
    v_slug := v_slug || '-' || substring(v_actor::text from 1 for 8);
  end if;

  insert into public.perfis(usuario_id, slug, nome_completo, role)
  values (v_actor, v_slug, coalesce(v_nome, 'Usuário'), 'cliente');

  return jsonb_build_object('ok', true, 'created', true);
end;
$$;

create or replace function public.cliente_set_action_plan(
  p_usuario_id uuid,
  p_plano_acao jsonb,
  p_slug text default null,
  p_nome_completo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
  v_nome text := nullif(trim(coalesce(p_nome_completo, '')), '');
  v_target_role text;
  v_existing_config jsonb;
  v_existing_cliente_perfil jsonb;
  v_existing_plano_acao jsonb;
  v_next_config jsonb;
begin
  if v_actor is null then
    raise exception 'cliente_action_plan_unauthenticated' using errcode = '42501';
  end if;

  if p_usuario_id is null or p_plano_acao is null or jsonb_typeof(p_plano_acao) <> 'object' then
    raise exception 'cliente_action_plan_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), coalesce(p.configuracao_tema::jsonb, '{}'::jsonb)
    into v_target_role, v_existing_config
  from public.perfis p
  where p.usuario_id = p_usuario_id
  for update;

  if v_target_role is null then
    if p_usuario_id is distinct from v_actor then
      raise exception 'cliente_action_plan_target_missing' using errcode = '23514';
    end if;

    if v_slug is null then
      v_slug := 'cliente-' || substring(v_actor::text from 1 for 8);
    end if;

    if exists (select 1 from public.perfis p where p.slug = v_slug) then
      v_slug := v_slug || '-' || substring(v_actor::text from 1 for 8);
    end if;

    insert into public.perfis(usuario_id, slug, nome_completo, role, configuracao_tema)
    values (
      v_actor,
      v_slug,
      coalesce(v_nome, 'Usuário'),
      'cliente',
      jsonb_build_object('clientePerfil', jsonb_build_object('planoAcao', p_plano_acao))
    );

    return jsonb_build_object('ok', true, 'created', true);
  end if;

  if v_target_role not in ('cliente', 'cliente_gestao') then
    raise exception 'cliente_action_plan_target_not_client' using errcode = '23514';
  end if;

  if p_usuario_id is distinct from v_actor and not public.can_manage_client(p_usuario_id) then
    raise exception 'cliente_action_plan_forbidden' using errcode = '42501';
  end if;

  v_existing_cliente_perfil := coalesce(v_existing_config->'clientePerfil', '{}'::jsonb);
  v_existing_plano_acao := coalesce(v_existing_cliente_perfil->'planoAcao', '{}'::jsonb);
  v_next_config := v_existing_config || jsonb_build_object(
    'clientePerfil',
    v_existing_cliente_perfil || jsonb_build_object('planoAcao', v_existing_plano_acao || p_plano_acao)
  );

  update public.perfis
     set configuracao_tema = v_next_config
   where usuario_id = p_usuario_id;

  return jsonb_build_object('ok', true, 'created', false);
end;
$$;

revoke all on function public.ensure_self_cliente_profile(text, text) from public, anon;
revoke all on function public.cliente_set_action_plan(uuid, jsonb, text, text) from public, anon;
grant execute on function public.ensure_self_cliente_profile(text, text) to authenticated, service_role;
grant execute on function public.cliente_set_action_plan(uuid, jsonb, text, text) to authenticated, service_role;

commit;
