begin;

create or replace function public.cliente_submit_nps_avaliacao(
  p_cliente_id uuid,
  p_gestor_id uuid,
  p_equipe_id uuid,
  p_nota integer,
  p_comentario text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'cliente_nps_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is distinct from v_actor then
    raise exception 'cliente_nps_forbidden' using errcode = '42501';
  end if;

  if p_gestor_id is null or p_nota is null or p_nota < 0 or p_nota > 10 then
    raise exception 'cliente_nps_invalid_input' using errcode = '23514';
  end if;

  insert into public.nps_avaliacoes(cliente_id, gestor_id, equipe_id, nota, comentario)
  values (p_cliente_id, p_gestor_id, p_equipe_id, p_nota::smallint, nullif(trim(coalesce(p_comentario, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.cliente_submit_csat_avaliacao(
  p_cliente_id uuid,
  p_gestor_id uuid,
  p_equipe_id uuid,
  p_mes_referencia date,
  p_nota integer,
  p_comentario text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'cliente_csat_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is distinct from v_actor then
    raise exception 'cliente_csat_forbidden' using errcode = '42501';
  end if;

  if p_gestor_id is null or p_mes_referencia is null or p_nota is null or p_nota < 1 or p_nota > 5 then
    raise exception 'cliente_csat_invalid_input' using errcode = '23514';
  end if;

  insert into public.csat_avaliacoes(cliente_id, gestor_id, equipe_id, mes_referencia, nota, comentario)
  values (p_cliente_id, p_gestor_id, p_equipe_id, p_mes_referencia, p_nota::smallint, nullif(trim(coalesce(p_comentario, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.cliente_submit_nps_avaliacao(uuid, uuid, uuid, integer, text) from public, anon;
revoke all on function public.cliente_submit_csat_avaliacao(uuid, uuid, uuid, date, integer, text) from public, anon;
grant execute on function public.cliente_submit_nps_avaliacao(uuid, uuid, uuid, integer, text) to authenticated, service_role;
grant execute on function public.cliente_submit_csat_avaliacao(uuid, uuid, uuid, date, integer, text) to authenticated, service_role;

commit;
