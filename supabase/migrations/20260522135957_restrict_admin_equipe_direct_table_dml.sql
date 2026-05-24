begin;

do $$
begin
  if to_regclass('public.captacao_custom_domains') is null then
    raise exception 'missing_table_public_captacao_custom_domains';
  end if;

  if to_regprocedure('public.can_admin_equipe(uuid)') is null then
    raise exception 'missing_function_public_can_admin_equipe';
  end if;

  if to_regprocedure('public.equipe_usuario_eh_admin(uuid, uuid)') is null then
    raise exception 'missing_function_public_equipe_usuario_eh_admin';
  end if;
end;
$$;

create or replace function public.manager_captacao_custom_domain_delete(
  p_equipe_id uuid,
  p_domain_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'captacao_custom_domain_unauthenticated' using errcode = '42501';
  end if;

  if p_equipe_id is null or p_domain_id is null then
    raise exception 'captacao_custom_domain_missing_argument' using errcode = '23514';
  end if;

  if not (
    public.can_admin_equipe(p_equipe_id)
    or public.equipe_usuario_eh_admin(p_equipe_id, auth.uid())
  ) then
    raise exception 'captacao_custom_domain_forbidden' using errcode = '42501';
  end if;

  delete from public.captacao_custom_domains
   where id = p_domain_id
     and equipe_id = p_equipe_id
   returning id into v_deleted_id;

  if v_deleted_id is null then
    raise exception 'captacao_custom_domain_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'id', v_deleted_id);
end;
$$;

revoke all on function public.manager_captacao_custom_domain_delete(uuid, uuid) from public, anon;
grant execute on function public.manager_captacao_custom_domain_delete(uuid, uuid) to authenticated, service_role;

revoke insert, update, delete on table public.crm_receitas from authenticated;
revoke insert, update, delete on table public.crm_despesas from authenticated;
revoke insert, update, delete on table public.crm_fornecedores from authenticated;
revoke insert, update, delete on table public.crm_funcionarios from authenticated;

revoke insert, update, delete on table public.captacao_custom_domains from authenticated;
revoke insert, update, delete on table public.captacao_hero_metrics from authenticated;
revoke insert, update, delete on table public.captacao_leads from authenticated;
revoke insert, update, delete on table public.calculator_configs from authenticated;

commit;
