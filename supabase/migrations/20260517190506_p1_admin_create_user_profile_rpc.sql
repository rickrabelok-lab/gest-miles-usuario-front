begin;

create or replace function public.admin_create_user_profile(
  p_usuario_id uuid,
  p_slug text,
  p_nome_completo text,
  p_role text,
  p_equipe_id uuid default null,
  p_cliente_gestor_ids uuid[] default null,
  p_cliente_cs_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_role text := lower(trim(coalesce(p_role, '')));
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
  v_nome text := nullif(trim(coalesce(p_nome_completo, '')), '');
  v_allowed_roles text[] := array[
    'admin',
    'admin_equipe',
    'admin_geral',
    'cs',
    'gestor',
    'cliente',
    'cliente_gestao',
    'closer_baixo',
    'closer_alto',
    'closer_geral'
  ];
  v_team_roles text[] := array[
    'admin_equipe',
    'cs',
    'gestor',
    'cliente_gestao',
    'closer_baixo',
    'closer_alto',
    'closer_geral'
  ];
  v_gestor_id uuid;
  v_cs_id uuid;
begin
  if v_actor is null then
    raise exception 'admin_create_user_profile_unauthenticated' using errcode = '42501';
  end if;

  if p_usuario_id is null or v_slug is null or v_nome is null or v_role = '' then
    raise exception 'admin_create_user_profile_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_geral', 'admin_equipe') then
    raise exception 'admin_create_user_profile_forbidden' using errcode = '42501';
  end if;

  if not (v_role = any(v_allowed_roles)) or v_role = 'admin_master' then
    raise exception 'admin_create_user_profile_invalid_role' using errcode = '23514';
  end if;

  if v_role = any(v_team_roles) and p_equipe_id is null then
    raise exception 'admin_create_user_profile_equipe_required' using errcode = '23514';
  end if;

  if v_actor_role = 'admin_equipe' then
    if v_actor_equipe_id is null or p_equipe_id is distinct from v_actor_equipe_id then
      raise exception 'admin_create_user_profile_cross_team_forbidden' using errcode = '42501';
    end if;
    if v_role in ('admin', 'admin_geral') then
      raise exception 'admin_create_user_profile_role_forbidden' using errcode = '42501';
    end if;
  end if;

  if v_actor_role = 'admin' and v_actor_equipe_id is not null then
    raise exception 'admin_create_user_profile_global_admin_required' using errcode = '42501';
  end if;

  insert into public.perfis(usuario_id, slug, nome_completo, role, equipe_id)
  values (p_usuario_id, v_slug, v_nome, v_role, p_equipe_id);

  if v_role = 'gestor' and to_regclass('public.equipe_gestores') is not null then
    insert into public.equipe_gestores(equipe_id, gestor_id)
    values (p_equipe_id, p_usuario_id)
    on conflict (equipe_id, gestor_id) do nothing;
  end if;

  if v_role = 'cs' and to_regclass('public.equipe_cs') is not null then
    insert into public.equipe_cs(equipe_id, cs_id)
    values (p_equipe_id, p_usuario_id)
    on conflict (equipe_id, cs_id) do nothing;
  end if;

  if v_role = 'cliente_gestao' then
    if p_cliente_gestor_ids is not null and to_regclass('public.cliente_gestores') is not null then
      foreach v_gestor_id in array coalesce(p_cliente_gestor_ids, array[]::uuid[]) loop
        if not exists (
          select 1
          from public.perfis p
          where p.usuario_id = v_gestor_id
            and lower(trim(coalesce(p.role::text, ''))) = 'gestor'
            and p.equipe_id = p_equipe_id
        ) then
          raise exception 'admin_create_user_profile_gestor_outside_team' using errcode = '23514';
        end if;

        insert into public.cliente_gestores(cliente_id, gestor_id)
        values (p_usuario_id, v_gestor_id)
        on conflict (cliente_id, gestor_id) do nothing;
      end loop;
    end if;

    if p_cliente_cs_ids is not null and to_regclass('public.cliente_cs') is not null then
      foreach v_cs_id in array coalesce(p_cliente_cs_ids, array[]::uuid[]) loop
        if not exists (
          select 1
          from public.perfis p
          where p.usuario_id = v_cs_id
            and lower(trim(coalesce(p.role::text, ''))) = 'cs'
            and p.equipe_id = p_equipe_id
        ) then
          raise exception 'admin_create_user_profile_cs_outside_team' using errcode = '23514';
        end if;

        insert into public.cliente_cs(cliente_id, cs_id)
        values (p_usuario_id, v_cs_id)
        on conflict (cliente_id, cs_id) do nothing;
      end loop;
    end if;
  end if;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_user_profile.create',
      'perfis',
      p_usuario_id::text,
      jsonb_build_object(
        'role', v_role,
        'equipe_id', p_equipe_id,
        'cliente_gestor_ids_count', coalesce(array_length(p_cliente_gestor_ids, 1), 0),
        'cliente_cs_ids_count', coalesce(array_length(p_cliente_cs_ids, 1), 0)
      )
    );
  end if;

  return p_usuario_id;
end;
$$;

revoke all on function public.admin_create_user_profile(uuid, text, text, text, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_create_user_profile(uuid, text, text, text, uuid, uuid[], uuid[]) to authenticated, service_role;

commit;
