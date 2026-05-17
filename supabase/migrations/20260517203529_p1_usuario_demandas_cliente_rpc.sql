begin;

create or replace function public.cliente_criar_demanda(
  p_cliente_id uuid,
  p_tipo text,
  p_payload jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_tipo text := nullif(trim(coalesce(p_tipo, '')), '');
  v_id bigint;
begin
  if v_actor is null then
    raise exception 'cliente_demanda_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null or v_tipo not in ('emissao', 'outros') or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'cliente_demanda_invalid_input' using errcode = '23514';
  end if;

  if not public.can_manage_client(p_cliente_id) then
    raise exception 'cliente_demanda_forbidden' using errcode = '42501';
  end if;

  insert into public.demandas_cliente(cliente_id, tipo, status, payload)
  values (p_cliente_id, v_tipo, 'pendente', p_payload)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.cliente_criar_demanda(uuid, text, jsonb) from public, anon;
grant execute on function public.cliente_criar_demanda(uuid, text, jsonb) to authenticated, service_role;

commit;
