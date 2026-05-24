begin;

create or replace function public.resolver_alerta_sistema(
  p_alerta_id uuid
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
    raise exception 'resolver_alerta_unauthenticated' using errcode = '42501';
  end if;

  if p_alerta_id is null then
    raise exception 'resolver_alerta_id_required' using errcode = '23514';
  end if;

  select (
    public.is_legacy_platform_admin()
    or public.rls_team_admin_matches_equipe(a.equipe_id)
    or (a.gestor_id is not null and public.cs_can_access_gestor(a.gestor_id))
    or (a.cliente_id is not null and public.can_cs_view_client(a.cliente_id))
    or (a.cliente_id is not null and public.can_manage_client(a.cliente_id))
    or (a.cliente_id is null and a.gestor_id is not null and a.gestor_id = auth.uid())
  )
  into v_allowed
  from public.alertas_sistema a
  where a.id = p_alerta_id
    and a.status = 'ativo';

  if v_allowed is null then
    raise exception 'resolver_alerta_not_found' using errcode = 'P0002';
  end if;

  if not v_allowed then
    raise exception 'resolver_alerta_forbidden' using errcode = '42501';
  end if;

  update public.alertas_sistema
  set
    status = 'resolvido',
    data_resolucao = now(),
    resolvido_por = auth.uid()
  where id = p_alerta_id
    and status = 'ativo';
end;
$function$;

create or replace function public.marcar_notificacao_lida(
  p_notificacao_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'marcar_notificacao_lida_unauthenticated' using errcode = '42501';
  end if;

  if p_notificacao_id is null then
    raise exception 'marcar_notificacao_lida_id_required' using errcode = '23514';
  end if;

  update public.notificacoes
  set lida = true
  where id = p_notificacao_id
    and usuario_id = auth.uid();

  if not found then
    raise exception 'marcar_notificacao_lida_not_found' using errcode = 'P0002';
  end if;
end;
$function$;

create or replace function public.marcar_todas_notificacoes_lidas()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'marcar_todas_notificacoes_lidas_unauthenticated' using errcode = '42501';
  end if;

  update public.notificacoes
  set lida = true
  where usuario_id = auth.uid()
    and lida = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.resolver_alerta_sistema(uuid) from public, anon;
revoke all on function public.marcar_notificacao_lida(uuid) from public, anon;
revoke all on function public.marcar_todas_notificacoes_lidas() from public, anon;

grant execute on function public.resolver_alerta_sistema(uuid) to authenticated, service_role;
grant execute on function public.marcar_notificacao_lida(uuid) to authenticated, service_role;
grant execute on function public.marcar_todas_notificacoes_lidas() to authenticated, service_role;

revoke update on public.alertas_sistema from authenticated;
revoke update on public.notificacoes from authenticated;

commit;
