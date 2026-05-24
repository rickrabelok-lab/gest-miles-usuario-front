begin;

do $$
declare
  v_save_sql text;
  v_delete_sql text;
  v_old_check text := 'if not (public.is_legacy_platform_admin() or public.can_admin_equipe(v_equipe_id)) then';
  v_new_check text := 'if not (public.is_legacy_platform_admin() or public.can_admin_equipe(v_equipe_id) or public.equipe_usuario_eh_admin(v_equipe_id, v_actor)) then';
begin
  if to_regprocedure('public.manager_crm_financeiro_save(text, uuid, jsonb)') is null then
    raise exception 'missing_function_public_manager_crm_financeiro_save';
  end if;

  if to_regprocedure('public.manager_crm_financeiro_delete(text, uuid)') is null then
    raise exception 'missing_function_public_manager_crm_financeiro_delete';
  end if;

  if to_regprocedure('public.equipe_usuario_eh_admin(uuid, uuid)') is null then
    raise exception 'missing_function_public_equipe_usuario_eh_admin';
  end if;

  v_save_sql := pg_get_functiondef('public.manager_crm_financeiro_save(text, uuid, jsonb)'::regprocedure);
  v_delete_sql := pg_get_functiondef('public.manager_crm_financeiro_delete(text, uuid)'::regprocedure);

  if position(v_old_check in lower(v_save_sql)) = 0 then
    raise exception 'manager_crm_financeiro_save_auth_check_not_found';
  end if;

  if position(v_old_check in lower(v_delete_sql)) = 0 then
    raise exception 'manager_crm_financeiro_delete_auth_check_not_found';
  end if;

  execute replace(v_save_sql, v_old_check, v_new_check);
  execute replace(v_delete_sql, v_old_check, v_new_check);
end;
$$;

revoke all on function public.manager_crm_financeiro_save(text, uuid, jsonb) from public, anon;
grant execute on function public.manager_crm_financeiro_save(text, uuid, jsonb) to authenticated, service_role;

revoke all on function public.manager_crm_financeiro_delete(text, uuid) from public, anon;
grant execute on function public.manager_crm_financeiro_delete(text, uuid) to authenticated, service_role;

commit;
