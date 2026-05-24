begin;

create or replace function public.update_tarefa_cs_status(
  p_tarefa_id uuid,
  p_status text
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
    raise exception 'update_tarefa_cs_status_unauthenticated' using errcode = '42501';
  end if;

  if p_tarefa_id is null then
    raise exception 'update_tarefa_cs_status_id_required' using errcode = '23514';
  end if;

  if p_status not in ('pendente', 'em_andamento', 'concluida') then
    raise exception 'update_tarefa_cs_status_invalid' using errcode = '23514';
  end if;

  select (
    public.is_legacy_platform_admin()
    or (
      t.equipe_id is not null
      and public.rls_team_admin_matches_equipe(t.equipe_id)
    )
    or (
      t.gestor_id is not null
      and public.cs_can_access_gestor(t.gestor_id)
    )
    or (
      t.cliente_id is not null
      and public.can_cs_view_client(t.cliente_id)
    )
  )
  into v_allowed
  from public.tarefas_cs t
  where t.id = p_tarefa_id;

  if v_allowed is null then
    raise exception 'update_tarefa_cs_status_not_found' using errcode = 'P0002';
  end if;

  if not v_allowed then
    raise exception 'update_tarefa_cs_status_forbidden' using errcode = '42501';
  end if;

  update public.tarefas_cs
  set status = p_status
  where id = p_tarefa_id;
end;
$function$;

revoke all on function public.update_tarefa_cs_status(uuid, text)
from public, anon;
grant execute on function public.update_tarefa_cs_status(uuid, text)
to authenticated, service_role;

revoke insert, update on public.tarefas_cs from authenticated;

commit;
