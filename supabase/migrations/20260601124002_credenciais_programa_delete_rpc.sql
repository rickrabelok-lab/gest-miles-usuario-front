begin;

create or replace function public.delete_credencial_programa(
  p_id uuid,
  p_cliente_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
begin
  if auth.uid() is null then
    raise exception 'delete_credencial_unauthenticated' using errcode = '42501';
  end if;

  if p_id is null or p_cliente_id is null then
    raise exception 'delete_credencial_required_args' using errcode = '23514';
  end if;

  if not public.can_manage_client(p_cliente_id) then
    raise exception 'delete_credencial_forbidden' using errcode = '42501';
  end if;

  delete from public.credenciais_programa_cliente
  where id = p_id
    and cliente_id = p_cliente_id;

  if not found then
    raise exception 'delete_credencial_not_found' using errcode = 'P0002';
  end if;
end;
$function$;

revoke all on function public.delete_credencial_programa(uuid, uuid)
from public, anon;
grant execute on function public.delete_credencial_programa(uuid, uuid)
to authenticated, service_role;

revoke insert, update, delete, truncate, references, trigger
on public.credenciais_programa_cliente
from authenticated;

commit;
