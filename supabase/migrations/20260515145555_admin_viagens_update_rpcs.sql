-- Draft local: RPCs admin para updates controlados em public.viagens.
-- Nao aplicado no Supabase. Nao revoga UPDATE direto; fechamento fica para fase posterior apos frontend + smoke.

create extension if not exists "pgcrypto" with schema extensions;

-- Precheck fail-fast: a RPC so nasce se as dependencias conhecidas existirem.
do $$
begin
  if to_regclass('public.viagens') is null then
    raise exception 'missing dependency: public.viagens';
  end if;

  if to_regclass('public.perfis') is null then
    raise exception 'missing dependency: public.perfis';
  end if;

  if to_regclass('public.logs_acoes') is null then
    raise exception 'missing dependency: public.logs_acoes';
  end if;

  if to_regprocedure('public.is_admin_global_or_master()') is null then
    raise exception 'missing dependency: public.is_admin_global_or_master()';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'viagens'
      and column_name in ('id', 'equipe_id', 'status', 'checkin_enviado', 'chegada_enviada', 'retorno_enviado', 'updated_at')
    group by table_schema, table_name
    having count(*) = 7
  ) then
    raise exception 'missing expected columns on public.viagens';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'perfis'
      and column_name in ('usuario_id', 'role', 'equipe_id')
    group by table_schema, table_name
    having count(*) = 3
  ) then
    raise exception 'missing expected columns on public.perfis';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'logs_acoes'
      and column_name in ('user_id', 'tipo_acao', 'entidade_afetada', 'entidade_id', 'details')
    group by table_schema, table_name
    having count(*) = 5
  ) then
    raise exception 'missing expected columns on public.logs_acoes';
  end if;
end;
$$;

create or replace function public.admin_update_viagem_status(
  p_viagem_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_status text;
  v_new_status text := lower(trim(coalesce(p_status, '')));
  v_equipe_id uuid;
  v_updated_at timestamptz;
  v_allowed boolean := false;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_viagem_id is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  if v_new_status not in ('planejada', 'em_andamento', 'chegada_confirmada', 'finalizada') then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  select v.status::text, v.equipe_id
    into v_current_status, v_equipe_id
  from public.viagens v
  where v.id = p_viagem_id;

  if not found then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;

  if public.is_admin_global_or_master() then
    v_allowed := true;
  elsif v_equipe_id is not null then
    select exists (
      select 1
      from public.perfis p
      where p.usuario_id = v_user_id
        and lower(trim(coalesce(p.role, ''))) = 'admin_equipe'
        and p.equipe_id = v_equipe_id
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;

  update public.viagens v
     set status = v_new_status,
         updated_at = now()
   where v.id = p_viagem_id
   returning v.updated_at into v_updated_at;

  if not found then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (
    v_user_id,
    'viagem_status_update',
    'viagens',
    p_viagem_id::text,
    jsonb_build_object(
      'old_status', v_current_status,
      'new_status', v_new_status,
      'equipe_id', v_equipe_id,
      'source', 'rpc:admin_update_viagem_status'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'id', p_viagem_id,
      'status', v_new_status,
      'equipe_id', v_equipe_id,
      'updated_at', v_updated_at
    )
  );
end;
$$;

create or replace function public.admin_mark_viagem_mensagem_enviada(
  p_viagem_id uuid,
  p_tipo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tipo text := lower(trim(coalesce(p_tipo, '')));
  v_flag text;
  v_old_value boolean;
  v_equipe_id uuid;
  v_checkin_enviado boolean;
  v_chegada_enviada boolean;
  v_retorno_enviado boolean;
  v_updated_at timestamptz;
  v_allowed boolean := false;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_viagem_id is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  if v_tipo not in ('pre_viagem', 'chegada', 'pos_viagem') then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  select v.equipe_id,
         v.checkin_enviado,
         v.chegada_enviada,
         v.retorno_enviado
    into v_equipe_id,
         v_checkin_enviado,
         v_chegada_enviada,
         v_retorno_enviado
  from public.viagens v
  where v.id = p_viagem_id;

  if not found then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;

  if public.is_admin_global_or_master() then
    v_allowed := true;
  elsif v_equipe_id is not null then
    select exists (
      select 1
      from public.perfis p
      where p.usuario_id = v_user_id
        and lower(trim(coalesce(p.role, ''))) = 'admin_equipe'
        and p.equipe_id = v_equipe_id
    ) into v_allowed;
  end if;

  if not v_allowed then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;

  if v_tipo = 'pre_viagem' then
    v_flag := 'checkin_enviado';
    v_old_value := coalesce(v_checkin_enviado, false);

    update public.viagens v
       set checkin_enviado = true,
           updated_at = now()
     where v.id = p_viagem_id
     returning v.checkin_enviado, v.chegada_enviada, v.retorno_enviado, v.updated_at
        into v_checkin_enviado, v_chegada_enviada, v_retorno_enviado, v_updated_at;
  elsif v_tipo = 'chegada' then
    v_flag := 'chegada_enviada';
    v_old_value := coalesce(v_chegada_enviada, false);

    update public.viagens v
       set chegada_enviada = true,
           updated_at = now()
     where v.id = p_viagem_id
     returning v.checkin_enviado, v.chegada_enviada, v.retorno_enviado, v.updated_at
        into v_checkin_enviado, v_chegada_enviada, v_retorno_enviado, v_updated_at;
  else
    v_flag := 'retorno_enviado';
    v_old_value := coalesce(v_retorno_enviado, false);

    update public.viagens v
       set retorno_enviado = true,
           updated_at = now()
     where v.id = p_viagem_id
     returning v.checkin_enviado, v.chegada_enviada, v.retorno_enviado, v.updated_at
        into v_checkin_enviado, v_chegada_enviada, v_retorno_enviado, v_updated_at;
  end if;

  if not found then
    raise exception 'forbidden_or_not_found' using errcode = '42501';
  end if;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (
    v_user_id,
    'viagem_mensagem_enviada_mark',
    'viagens',
    p_viagem_id::text,
    jsonb_build_object(
      'tipo', v_tipo,
      'flag', v_flag,
      'old_value', v_old_value,
      'new_value', true,
      'equipe_id', v_equipe_id,
      'source', 'rpc:admin_mark_viagem_mensagem_enviada'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'id', p_viagem_id,
      'tipo', v_tipo,
      'checkin_enviado', coalesce(v_checkin_enviado, false),
      'chegada_enviada', coalesce(v_chegada_enviada, false),
      'retorno_enviado', coalesce(v_retorno_enviado, false),
      'equipe_id', v_equipe_id,
      'updated_at', v_updated_at
    )
  );
end;
$$;

revoke execute on function public.admin_update_viagem_status(uuid, text) from public, anon;
grant execute on function public.admin_update_viagem_status(uuid, text) to authenticated;

revoke execute on function public.admin_mark_viagem_mensagem_enviada(uuid, text) from public, anon;
grant execute on function public.admin_mark_viagem_mensagem_enviada(uuid, text) to authenticated;
