begin;

create or replace function public.admin_insert_audit_log(
  p_tipo_acao text,
  p_entidade_afetada text,
  p_entidade_id text,
  p_details jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_tipo_acao text := nullif(trim(coalesce(p_tipo_acao, '')), '');
  v_entidade_afetada text := nullif(trim(coalesce(p_entidade_afetada, '')), '');
  v_entidade_id text := nullif(trim(coalesce(p_entidade_id, '')), '');
begin
  if v_actor is null then
    raise exception 'admin_audit_log_unauthenticated' using errcode = '42501';
  end if;

  if v_tipo_acao is null or v_entidade_afetada is null or v_entidade_id is null then
    raise exception 'admin_audit_log_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, '')))
    into v_actor_role
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_geral') then
    raise exception 'admin_audit_log_forbidden' using errcode = '42501';
  end if;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (v_actor, v_tipo_acao, v_entidade_afetada, v_entidade_id, coalesce(p_details, '{}'::jsonb));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_delete_old_audit_logs(p_cutoff timestamptz)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_deleted integer := 0;
begin
  if v_actor is null then
    raise exception 'admin_audit_log_unauthenticated' using errcode = '42501';
  end if;

  if p_cutoff is null or p_cutoff > now() - interval '7 days' then
    raise exception 'admin_audit_log_invalid_cutoff' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, '')))
    into v_actor_role
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin') then
    raise exception 'admin_audit_log_delete_forbidden' using errcode = '42501';
  end if;

  delete from public.logs_acoes
  where created_at < p_cutoff;

  get diagnostics v_deleted = row_count;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (
    v_actor,
    'admin_logs.delete_old',
    'logs_acoes',
    'bulk',
    jsonb_build_object('cutoff', p_cutoff, 'deleted', v_deleted)
  );

  return v_deleted;
end;
$$;

revoke all on function public.admin_insert_audit_log(text, text, text, jsonb) from public, anon;
revoke all on function public.admin_delete_old_audit_logs(timestamptz) from public, anon;
grant execute on function public.admin_insert_audit_log(text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.admin_delete_old_audit_logs(timestamptz) to authenticated, service_role;

commit;
