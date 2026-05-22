begin;

create or replace function public.admin_delete_user_profile(p_usuario_id uuid)
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
begin
  if v_actor is null then
    raise exception 'admin_delete_user_unauthenticated' using errcode = '42501';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null then
    raise exception 'admin_delete_user_forbidden' using errcode = '42501';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_target_role, v_target_equipe_id
  from public.perfis p
  where p.usuario_id = p_usuario_id
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'deleted', false, 'reason', 'target_not_found');
  end if;

  if v_target_role = 'admin_master' then
    raise exception 'admin_master_profile_not_deletable_by_panel' using errcode = '42501';
  end if;

  if v_actor_role not in ('admin_master', 'admin') then
    raise exception 'admin_delete_user_forbidden' using errcode = '42501';
  end if;

  if v_actor_role = 'admin' and v_actor_equipe_id is not null then
    raise exception 'admin_delete_user_global_admin_required' using errcode = '42501';
  end if;

  if to_regclass('public.cliente_gestores') is not null then
    delete from public.cliente_gestores where cliente_id = p_usuario_id or gestor_id = p_usuario_id;
  end if;

  if to_regclass('public.cliente_cs') is not null then
    delete from public.cliente_cs where cliente_id = p_usuario_id or cs_id = p_usuario_id;
  end if;

  if to_regclass('public.equipe_cs') is not null then
    delete from public.equipe_cs where cs_id = p_usuario_id;
  end if;

  if to_regclass('public.equipe_gestores') is not null then
    delete from public.equipe_gestores where gestor_id = p_usuario_id;
  end if;

  delete from public.perfis where usuario_id = p_usuario_id;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_user_profile.delete',
      'perfis',
      p_usuario_id::text,
      jsonb_build_object(
        'role_before', v_target_role,
        'equipe_id_before', v_target_equipe_id
      )
    );
  end if;

  return jsonb_build_object('ok', true, 'deleted', true, 'usuario_id', p_usuario_id);
end;
$$;

revoke all on function public.admin_delete_user_profile(uuid) from public, anon;
grant execute on function public.admin_delete_user_profile(uuid) to authenticated, service_role;

commit;
