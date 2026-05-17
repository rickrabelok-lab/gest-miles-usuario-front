begin;

create or replace function public.cliente_registrar_emissao(
  p_cliente_id uuid,
  p_programa_cliente_id bigint,
  p_programa text,
  p_origem text,
  p_destino text,
  p_classe text,
  p_data_ida date,
  p_data_volta date,
  p_milhas_utilizadas numeric,
  p_taxa_embarque numeric,
  p_data_emissao date,
  p_observacoes text,
  p_sobrenome_emissao text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_programa text := nullif(trim(coalesce(p_programa, '')), '');
  v_origem text := trim(coalesce(p_origem, ''));
  v_destino text := trim(coalesce(p_destino, ''));
  v_classe text := trim(coalesce(p_classe, ''));
  v_sobrenome text := nullif(trim(coalesce(p_sobrenome_emissao, '')), '');
  v_milhas numeric := coalesce(p_milhas_utilizadas, 0);
  v_taxa numeric := coalesce(p_taxa_embarque, 0);
  v_data_emissao date := coalesce(p_data_emissao, current_date);
  v_programa_row record;
  v_current_saldo numeric;
  v_new_saldo numeric;
  v_state jsonb;
  v_movimentos jsonb;
  v_novo_movimento jsonb;
  v_new_state jsonb;
  v_emissao_id uuid;
begin
  if v_actor is null then
    raise exception 'cliente_emissao_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null
    or p_programa_cliente_id is null
    or v_programa is null
    or v_milhas <= 0
    or v_taxa < 0
    or v_sobrenome is null then
    raise exception 'cliente_emissao_invalid_input' using errcode = '23514';
  end if;

  if not public.can_manage_client(p_cliente_id) then
    raise exception 'cliente_emissao_forbidden' using errcode = '42501';
  end if;

  select pc.*
    into v_programa_row
  from public.programas_cliente pc
  where pc.id = p_programa_cliente_id
    and pc.cliente_id = p_cliente_id
  for update;

  if not found then
    raise exception 'cliente_emissao_programa_missing' using errcode = '23503';
  end if;

  v_current_saldo := coalesce(v_programa_row.saldo, 0);
  if v_current_saldo < v_milhas then
    raise exception 'cliente_emissao_saldo_insuficiente' using errcode = '23514';
  end if;

  insert into public.emissoes(
    cliente_id,
    programa,
    origem,
    destino,
    classe,
    data_ida,
    data_volta,
    milhas_utilizadas,
    taxa_embarque,
    data_emissao,
    usuario_responsavel,
    observacoes
  )
  values (
    p_cliente_id,
    v_programa,
    v_origem,
    v_destino,
    v_classe,
    p_data_ida,
    p_data_volta,
    v_milhas,
    v_taxa,
    v_data_emissao,
    v_actor,
    nullif(p_observacoes, '')
  )
  returning id into v_emissao_id;

  v_new_saldo := greatest(0, v_current_saldo - v_milhas);
  v_state := coalesce(v_programa_row.state, '{}'::jsonb);
  v_movimentos := case
    when jsonb_typeof(v_state -> 'movimentos') = 'array' then v_state -> 'movimentos'
    else '[]'::jsonb
  end;

  v_novo_movimento := jsonb_build_object(
    'id', 'em-' || extract(epoch from clock_timestamp())::bigint || '-' || replace(gen_random_uuid()::text, '-', ''),
    'data', v_data_emissao::text,
    'tipo', 'saida',
    'descricao', 'Emissão ' || coalesce(nullif(v_origem, ''), '?') || ' -> ' || coalesce(nullif(v_destino, ''), '?') || case when v_classe <> '' then ' (' || v_classe || ')' else '' end,
    'milhas', v_milhas,
    'taxas', v_taxa,
    'origem', nullif(v_origem, ''),
    'destino', nullif(v_destino, ''),
    'classe', nullif(v_classe, ''),
    'sobrenomeEmissao', v_sobrenome
  );

  v_new_state := jsonb_build_object(
    'saldo', v_new_saldo,
    'movimentos', v_movimentos || jsonb_build_array(jsonb_strip_nulls(v_novo_movimento)),
    'custoSaldo', coalesce(v_state -> 'custoSaldo', '0'::jsonb),
    'custoMedioMilheiro', coalesce(v_state -> 'custoMedioMilheiro', '0'::jsonb),
    'lotes', case
      when jsonb_typeof(v_state -> 'lotes') = 'array' then v_state -> 'lotes'
      else '[]'::jsonb
    end
  );

  update public.programas_cliente
  set saldo = v_new_saldo,
      state = v_new_state,
      updated_at = now()
  where id = v_programa_row.id;

  return v_emissao_id;
end;
$$;

revoke all on function public.cliente_registrar_emissao(uuid, bigint, text, text, text, text, date, date, numeric, numeric, date, text, text) from public, anon;
grant execute on function public.cliente_registrar_emissao(uuid, bigint, text, text, text, text, date, date, numeric, numeric, date, text, text) to authenticated, service_role;

commit;
