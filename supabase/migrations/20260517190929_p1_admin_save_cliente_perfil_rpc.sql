begin;

create or replace function public.admin_save_cliente_perfil_config(
  p_usuario_id uuid,
  p_nome_completo text,
  p_slug text,
  p_cliente_perfil jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_target_role text;
  v_target_equipe_id uuid;
  v_existing_config jsonb;
  v_next_config jsonb;
  v_nome text := nullif(trim(coalesce(p_nome_completo, '')), '');
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
  v_exists boolean := false;
begin
  if v_actor is null then
    raise exception 'admin_cliente_perfil_unauthenticated' using errcode = '42501';
  end if;

  if p_usuario_id is null or v_nome is null or p_cliente_perfil is null or jsonb_typeof(p_cliente_perfil) <> 'object' then
    raise exception 'admin_cliente_perfil_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_geral', 'admin_equipe') then
    raise exception 'admin_cliente_perfil_forbidden' using errcode = '42501';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id, coalesce(p.configuracao_tema::jsonb, '{}'::jsonb), true
    into v_target_role, v_target_equipe_id, v_existing_config, v_exists
  from public.perfis p
  where p.usuario_id = p_usuario_id
  for update;

  if v_exists then
    if v_target_role not in ('cliente', 'cliente_gestao') then
      raise exception 'admin_cliente_perfil_target_not_client' using errcode = '23514';
    end if;

    if v_actor_role = 'admin' and v_actor_equipe_id is not null and v_target_equipe_id is distinct from v_actor_equipe_id then
      raise exception 'admin_cliente_perfil_cross_team_forbidden' using errcode = '42501';
    end if;

    if v_actor_role = 'admin_equipe' then
      if v_actor_equipe_id is null then
        raise exception 'admin_cliente_perfil_cross_team_forbidden' using errcode = '42501';
      end if;

      if v_target_equipe_id is distinct from v_actor_equipe_id
         and not exists (
           select 1 from public.cliente_gestores cg
           join public.equipe_gestores eg on eg.gestor_id = cg.gestor_id
           where cg.cliente_id = p_usuario_id and eg.equipe_id = v_actor_equipe_id
         )
         and not exists (
           select 1 from public.cliente_cs cc
           join public.equipe_cs ec on ec.cs_id = cc.cs_id
           where cc.cliente_id = p_usuario_id and ec.equipe_id = v_actor_equipe_id
         ) then
        raise exception 'admin_cliente_perfil_cross_team_forbidden' using errcode = '42501';
      end if;
    end if;

    v_next_config := v_existing_config || jsonb_build_object('clientePerfil', p_cliente_perfil);

    update public.perfis
       set nome_completo = v_nome,
           configuracao_tema = v_next_config
     where usuario_id = p_usuario_id;
  else
    if v_actor_role not in ('admin_master', 'admin', 'admin_geral') or (v_actor_role = 'admin' and v_actor_equipe_id is not null) then
      raise exception 'admin_cliente_perfil_create_forbidden' using errcode = '42501';
    end if;

    if v_slug is null then
      raise exception 'admin_cliente_perfil_slug_required' using errcode = '23514';
    end if;

    v_next_config := jsonb_build_object('clientePerfil', p_cliente_perfil);

    insert into public.perfis(usuario_id, slug, nome_completo, role, configuracao_tema)
    values (p_usuario_id, v_slug, v_nome, 'cliente', v_next_config);
  end if;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_cliente_perfil.save',
      'perfis',
      p_usuario_id::text,
      jsonb_build_object('created', not v_exists)
    );
  end if;

  return jsonb_build_object('ok', true, 'usuario_id', p_usuario_id, 'created', not v_exists);
end;
$$;

revoke all on function public.admin_save_cliente_perfil_config(uuid, text, text, jsonb) from public, anon;
grant execute on function public.admin_save_cliente_perfil_config(uuid, text, text, jsonb) to authenticated, service_role;

commit;
