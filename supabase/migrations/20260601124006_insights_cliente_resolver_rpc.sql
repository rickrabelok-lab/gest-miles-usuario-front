begin;

create or replace function public.resolver_insight_cliente(
  p_insight_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_allowed boolean;
begin
  if auth.uid() is null then
    raise exception 'resolver_insight_cliente_unauthenticated' using errcode = '42501';
  end if;

  if p_insight_id is null then
    raise exception 'resolver_insight_cliente_id_required' using errcode = '23514';
  end if;

  select (
    public.is_legacy_platform_admin()
    or i.gestor_id = auth.uid()
    or (i.gestor_id is not null and public.cs_can_access_gestor(i.gestor_id))
    or (i.equipe_id is not null and public.rls_team_admin_matches_equipe(i.equipe_id))
  )
  into v_allowed
  from public.insights_cliente i
  where i.id = p_insight_id
    and i.status = 'ativo';

  if v_allowed is null then
    raise exception 'resolver_insight_cliente_not_found' using errcode = 'P0002';
  end if;

  if not v_allowed then
    raise exception 'resolver_insight_cliente_forbidden' using errcode = '42501';
  end if;

  update public.insights_cliente
  set status = 'resolvido'
  where id = p_insight_id
    and status = 'ativo';
end;
$function$;

revoke all on function public.resolver_insight_cliente(uuid) from public, anon;
grant execute on function public.resolver_insight_cliente(uuid) to authenticated, service_role;

revoke update on public.insights_cliente from authenticated;

commit;
