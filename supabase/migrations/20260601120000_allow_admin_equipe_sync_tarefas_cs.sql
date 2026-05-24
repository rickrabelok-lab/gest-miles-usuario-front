begin;

do $$
begin
  if to_regclass('public.alertas_sistema') is null then
    raise exception 'missing_table_public_alertas_sistema';
  end if;

  if to_regclass('public.tarefas_cs') is null then
    raise exception 'missing_table_public_tarefas_cs';
  end if;

  if to_regprocedure('public.tarefas_cs_create_from_alerta(uuid)') is null then
    raise exception 'missing_function_public_tarefas_cs_create_from_alerta';
  end if;
end;
$$;

create or replace function public.tarefas_cs_sync_from_alertas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  r record;
begin
  if not exists (
    select 1 from public.perfis p
    where p.usuario_id = auth.uid()
      and p.role in ('admin', 'cs', 'admin_equipe')
  ) then
    raise exception 'tarefas_cs: apenas admin, cs ou admin_equipe podem sincronizar.';
  end if;

  for r in
    select id
    from public.alertas_sistema
    where status = 'ativo'
      and tipo_alerta in ('NPS_LOW', 'CSAT_LOW', 'GESTOR_SCORE_DROP', 'CLIENT_INACTIVITY', 'DEMANDA_ATRASADA')
  loop
    perform public.tarefas_cs_create_from_alerta(r.id);
    n := n + 1;
  end loop;

  return n;
end;
$$;

revoke all on function public.tarefas_cs_sync_from_alertas() from public, anon;
grant execute on function public.tarefas_cs_sync_from_alertas() to authenticated, service_role;

comment on function public.tarefas_cs_sync_from_alertas() is
  'Sincroniza tarefas CS a partir de alertas ativos. Permitido para admin, cs e admin_equipe; inserts continuam deduplicados por tarefas_cs_create_from_alerta.';

commit;

