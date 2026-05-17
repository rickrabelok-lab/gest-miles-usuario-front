begin;

do $$
begin
  if to_regclass('public.cliente_programa_acessos') is null then
    raise exception 'missing_table_public_cliente_programa_acessos' using errcode = '42P01';
  end if;

  if to_regclass('public.cliente_programa_acesso_audit_logs') is null then
    raise exception 'missing_table_public_cliente_programa_acesso_audit_logs' using errcode = '42P01';
  end if;
end;
$$;

-- RPC dedicada para registrar auditoria de acesso a credenciais de programas.
-- A funcao fica disponivel somente para service_role/backend; browser nao recebe EXECUTE.
create or replace function public.cliente_programa_acesso_audit_log_write(
  p_acesso_id uuid default null,
  p_cliente_id uuid default null,
  p_actor_id uuid default null,
  p_action text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text := nullif(trim(coalesce(p_action, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_log_id uuid;
begin
  if p_cliente_id is null then
    raise exception 'cliente_programa_acesso_audit_cliente_required' using errcode = '23514';
  end if;

  if p_actor_id is null then
    raise exception 'cliente_programa_acesso_audit_actor_required' using errcode = '23514';
  end if;

  if v_action is null or v_action not in ('list', 'view_secret', 'create', 'update', 'archive', 'delete') then
    raise exception 'cliente_programa_acesso_audit_action_invalid' using errcode = '23514';
  end if;

  if jsonb_typeof(v_metadata) <> 'object' then
    raise exception 'cliente_programa_acesso_audit_metadata_invalid' using errcode = '23514';
  end if;

  insert into public.cliente_programa_acesso_audit_logs (
    acesso_id,
    cliente_id,
    actor_id,
    action,
    metadata
  )
  values (
    p_acesso_id,
    p_cliente_id,
    p_actor_id,
    v_action,
    v_metadata
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

comment on function public.cliente_programa_acesso_audit_log_write(uuid, uuid, uuid, text, jsonb) is
  'Registra audit log especifico de cliente_programa_acessos. EXECUTE restrito ao service_role/backend; sem exposicao ao browser.';

revoke all on function public.cliente_programa_acesso_audit_log_write(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.cliente_programa_acesso_audit_log_write(uuid, uuid, uuid, text, jsonb) to service_role;

commit;
