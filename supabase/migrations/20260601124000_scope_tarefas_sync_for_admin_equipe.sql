-- Escopa a sync de tarefas para admin_equipe.
-- admin/cs continuam sincronizando todos os alertas ativos; admin_equipe sincroniza apenas alertas das equipes administradas.

create or replace function public.tarefas_cs_sync_from_alertas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  r record;
  v_role text;
  v_equipe_ids uuid[];
begin
  select p.role
    into v_role
  from public.perfis p
  where p.usuario_id = auth.uid()
    and p.role in ('admin', 'cs', 'admin_equipe')
  limit 1;

  if v_role is null then
    raise exception 'tarefas_cs: apenas admin, cs ou admin_equipe podem sincronizar.';
  end if;

  if v_role = 'admin_equipe' then
    select array_agg(distinct x.equipe_id)
      into v_equipe_ids
    from (
      select p.equipe_id
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role = 'admin_equipe'
        and p.equipe_id is not null
      union
      select ea.equipe_id
      from public.equipe_admin ea
      where ea.ativo = true
        and (
          ea.admin_equipe_id_1 = auth.uid()
          or ea.admin_equipe_id_2 = auth.uid()
          or ea.admin_equipe_id_3 = auth.uid()
        )
    ) x
    where x.equipe_id is not null;

    if coalesce(array_length(v_equipe_ids, 1), 0) = 0 then
      raise exception 'tarefas_cs: admin_equipe sem equipe administrada para sincronizar.';
    end if;
  end if;

  for r in
    select a.id
    from public.alertas_sistema a
    where a.status = 'ativo'
      and a.tipo_alerta in ('NPS_LOW', 'CSAT_LOW', 'GESTOR_SCORE_DROP', 'CLIENT_INACTIVITY', 'DEMANDA_ATRASADA')
      and (
        v_role in ('admin', 'cs')
        or a.equipe_id = any(v_equipe_ids)
        or (
          a.equipe_id is null
          and a.gestor_id is not null
          and public.perfis_equipe_id_safe(a.gestor_id) = any(v_equipe_ids)
        )
      )
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
  'Sincroniza tarefas a partir de alertas. admin/cs global; admin_equipe limitado às equipes administradas.';
