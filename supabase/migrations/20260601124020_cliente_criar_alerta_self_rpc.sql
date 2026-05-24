-- Draft seguro/local: RPC para cliente autenticado criar alerta manual próprio.
-- Não aplicar em banco real sem aprovação explícita e smoke com usuário cliente.

begin;

create or replace function public.cliente_criar_alerta_self(
  p_titulo text,
  p_tipo text,
  p_data_alvo date default null,
  p_programa text default null,
  p_detalhes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_titulo text := nullif(trim(coalesce(p_titulo, '')), '');
  v_tipo text := nullif(trim(coalesce(p_tipo, '')), '');
  v_programa text := nullif(trim(coalesce(p_programa, '')), '');
  v_detalhes text := nullif(trim(coalesce(p_detalhes, '')), '');
  v_mensagem text;
  v_alerta_id uuid := gen_random_uuid();
  v_dedup_key text;
  v_role text;
  v_recent_count integer;
begin
  if v_actor is null then
    raise exception 'cliente_criar_alerta_unauthenticated' using errcode = '42501';
  end if;

  select lower(trim(coalesce(p.role::text, '')))
    into v_role
  from public.perfis p
  where p.usuario_id = v_actor
  limit 1;

  if v_role is null or v_role not in ('cliente', 'cliente_gestao') then
    raise exception 'cliente_criar_alerta_forbidden_role' using errcode = '42501';
  end if;

  if v_titulo is null or length(v_titulo) < 3 or length(v_titulo) > 120 then
    raise exception 'cliente_criar_alerta_invalid_titulo' using errcode = '23514';
  end if;

  if v_tipo is null or length(v_tipo) < 3 or length(v_tipo) > 80 then
    raise exception 'cliente_criar_alerta_invalid_tipo' using errcode = '23514';
  end if;

  if v_programa is not null and length(v_programa) > 80 then
    raise exception 'cliente_criar_alerta_invalid_programa' using errcode = '23514';
  end if;

  if v_detalhes is not null and length(v_detalhes) > 500 then
    raise exception 'cliente_criar_alerta_invalid_detalhes' using errcode = '23514';
  end if;

  select count(*)
    into v_recent_count
  from public.alertas_sistema a
  where a.cliente_id = v_actor
    and a.tipo_alerta = 'CLIENT_CUSTOM'
    and a.data_criacao >= now() - interval '1 hour';

  if v_recent_count >= 10 then
    raise exception 'cliente_criar_alerta_rate_limited' using errcode = '23514';
  end if;

  v_mensagem := v_titulo
    || ' | tipo=' || v_tipo
    || case when p_data_alvo is not null then ' | data_alvo=' || p_data_alvo::text else '' end
    || case when v_programa is not null then ' | programa=' || v_programa else '' end
    || case when v_detalhes is not null then ' | detalhes=' || v_detalhes else '' end;

  v_dedup_key := 'CLIENT_CUSTOM:'
    || v_actor::text
    || ':'
    || md5(
      lower(v_titulo)
      || '|'
      || lower(v_tipo)
      || '|'
      || coalesce(p_data_alvo::text, '')
      || '|'
      || lower(coalesce(v_programa, ''))
      || '|'
      || lower(coalesce(v_detalhes, ''))
    );

  insert into public.alertas_sistema (
    id,
    tipo_alerta,
    cliente_id,
    gestor_id,
    equipe_id,
    nivel,
    mensagem,
    status,
    dedup_key
  )
  values (
    v_alerta_id,
    'CLIENT_CUSTOM',
    v_actor,
    null,
    public.perfis_equipe_id_safe(v_actor),
    'baixo',
    v_mensagem,
    'ativo',
    v_dedup_key
  )
  on conflict (dedup_key) where (status = 'ativo') do nothing
  returning id into v_alerta_id;

  if v_alerta_id is null then
    select a.id
      into v_alerta_id
    from public.alertas_sistema a
    where a.dedup_key = v_dedup_key
      and a.status = 'ativo'
    limit 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_alerta_id,
    'tipo_alerta', 'CLIENT_CUSTOM',
    'cliente_id', v_actor
  );
end;
$function$;

revoke all on function public.cliente_criar_alerta_self(text, text, date, text, text) from public;
revoke all on function public.cliente_criar_alerta_self(text, text, date, text, text) from anon;
grant execute on function public.cliente_criar_alerta_self(text, text, date, text, text) to authenticated;
grant execute on function public.cliente_criar_alerta_self(text, text, date, text, text) to service_role;

comment on function public.cliente_criar_alerta_self(text, text, date, text, text) is
  'Cliente autenticado cria alerta manual apenas para o proprio usuario em alertas_sistema.';

commit;
