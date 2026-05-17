begin;

create or replace function public.operational_log_write(
  p_tipo_acao text,
  p_entidade_afetada text,
  p_entidade_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_tipo text := nullif(trim(coalesce(p_tipo_acao, '')), '');
  v_entidade text := nullif(trim(coalesce(p_entidade_afetada, '')), '');
begin
  if v_actor is null then
    raise exception 'operational_log_unauthenticated' using errcode = '42501';
  end if;

  if v_tipo is null or v_entidade is null then
    raise exception 'operational_log_invalid_input' using errcode = '23514';
  end if;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (
    v_actor,
    v_tipo,
    v_entidade,
    nullif(trim(coalesce(p_entidade_id, '')), ''),
    coalesce(p_details, '{}'::jsonb)
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.operational_log_write(text, text, text, jsonb) from public, anon;
grant execute on function public.operational_log_write(text, text, text, jsonb) to authenticated, service_role;

commit;
