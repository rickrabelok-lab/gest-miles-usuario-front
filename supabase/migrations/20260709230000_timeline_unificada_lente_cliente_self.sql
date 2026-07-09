-- Lente 'cliente' imposta no SERVIDOR quando o chamador é o próprio cliente.
--
-- Contexto: o app do cliente (usuario-front) passa a mostrar a timeline
-- unificada (demandas, movimentos, transferências, emissões, marco) no lugar
-- da tabela crua timeline_eventos (que expunha o spam de LOGIN).
-- can_manage_client() inclui self por design, então o cliente JÁ passava no
-- gate — mas podia pedir p_lente='equipe' via console e ler eventos internos
-- (alertas, tarefas, NPS/CSAT, notas não curadas). Este patch força a lente
-- 'cliente' pra self; staff (gestor/CS) segue escolhendo a lente.
-- Corpo idêntico ao de 20260628000002 fora o bloco novo do gate.
begin;

create or replace function public.get_client_timeline_unificada(
  p_cliente_id uuid,
  p_lente text default 'equipe',   -- 'equipe' | 'cliente'
  p_inicio date default null,
  p_fim date default null,
  p_limit int default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cliente      boolean := (p_lente = 'cliente');
  v_economia     jsonb;
  v_eventos      jsonb;
  v_saldo_total  numeric;
  v_valor_milhas numeric;
  v_valor_real   numeric;
begin
  -- ── Regra de Ouro ──────────────────────────────────────────────────────────
  if auth.uid() is null then
    raise exception 'timeline_unificada_unauthenticated' using errcode = '42501';
  end if;
  -- Paridade de acesso com get_relatorio_economia: gestor que gerencia OU CS que
  -- enxerga o cliente (CS puro não passa em can_manage_client).
  if not (public.can_manage_client(p_cliente_id) or public.can_cs_view_client(p_cliente_id)) then
    raise exception 'timeline_unificada_forbidden' using errcode = '42501';
  end if;

  -- Cliente vendo a própria timeline: lente 'cliente' SEMPRE, independente do
  -- parâmetro — impede ler eventos internos pedindo 'equipe' via console.
  if auth.uid() = p_cliente_id then
    v_cliente := true;
  end if;

  -- ── Reuso da economia (eventos manuais + emissões + KPIs, já filtrados por período) ──
  v_economia := public.get_relatorio_economia(p_cliente_id, p_inicio, p_fim);

  -- ── UNION das fontes ───────────────────────────────────────────────────────
  with mov as (
    select
      'movimento'::text as fonte,
      case te.tipo_evento
        when 'MOVIMENTO_ENTRADA' then 'entrada'
        when 'MOVIMENTO_SAIDA'   then 'saida'
        when 'TRANSFERENCIA'     then 'transferencia'
        when 'ALERTA'            then 'alerta'
        when 'TAREFA'            then 'tarefa'
        when 'LOGIN'             then 'login'
        when 'NPS'               then 'nps'
        when 'CSAT'              then 'csat'
        else lower(te.tipo_evento)
      end as tipo,
      te.data_evento as data,
      te.titulo as titulo,
      coalesce(te.descricao, '') as descricao,
      (te.tipo_evento in ('MOVIMENTO_ENTRADA','MOVIMENTO_SAIDA','TRANSFERENCIA')) as visivel_cliente,
      false as editavel,
      null::text as ref_tipo,
      null::text as ref_id,
      coalesce(te.metadata, '{}'::jsonb) as metadata
    from public.timeline_eventos te
    where te.cliente_id = p_cliente_id
      -- dedup: a emissão vem da economia; ATUALIZACAO_CONTA é o "Saldo atualizado"
      -- genérico, redundante com os movimentos tipados → fora da timeline (#5).
      and te.tipo_evento not in ('EMISSAO', 'ATUALIZACAO_CONTA')
  ),
  eco as (
    select
      'economia'::text as fonte,
      case when ev->>'origem' = 'emissao' then 'emissao' else ev->>'tipo' end as tipo,
      (ev->>'dataEvento')::timestamptz as data,
      coalesce(ev->>'titulo', '') as titulo,
      coalesce(ev->>'descricao', '') as descricao,
      case when ev->>'origem' = 'emissao' then true
           else coalesce((ev->>'visivelCliente')::boolean, true) end as visivel_cliente,
      (ev->>'origem' = 'manual') as editavel,
      'economia'::text as ref_tipo,
      ev->>'id' as ref_id,
      ev as metadata
    from jsonb_array_elements(coalesce(v_economia->'eventos', '[]'::jsonb)) ev
    where coalesce(ev->>'tipo', '') <> 'case_emissao'   -- case é artefato do relatório
  ),
  dem_criada as (
    select
      'demanda'::text, 'demanda_criada'::text,
      d.created_at,
      'Demanda criada'::text,
      coalesce(nullif(d.payload->>'descricao',''), d.tipo)::text,
      true, false, 'demanda'::text, d.id::text,
      jsonb_build_object('status', d.status, 'subStatus', d.sub_status, 'tipo', d.tipo, 'payload', d.payload)
    from public.demandas_cliente d
    where d.cliente_id = p_cliente_id
  ),
  dem_concluida as (
    select
      'demanda'::text, 'demanda_concluida'::text,
      d.updated_at,
      'Demanda concluída'::text,
      coalesce(nullif(d.payload->>'descricao',''), d.tipo)::text,
      true, false, 'demanda'::text, d.id::text,
      jsonb_build_object('status', d.status, 'subStatus', d.sub_status, 'tipo', d.tipo, 'payload', d.payload)
    from public.demandas_cliente d
    where d.cliente_id = p_cliente_id
      and d.status = 'concluida'
  ),
  marco as (
    -- Início da gestão = início do contrato do cliente (#4); fallback p/ o 1º
    -- programa cadastrado só para não sumir o marco de cliente sem contrato.
    select
      'marco'::text, 'marco_inicio'::text,
      (m.dt + time '12:00')::timestamptz,
      'Início da gestão'::text,
      'Cliente passou a ser gerido pela equipe'::text,
      true, false, null::text, null::text, '{}'::jsonb
    from (
      select coalesce(
        (select min(cc.data_inicio) from public.contratos_cliente cc where cc.cliente_id = p_cliente_id),
        (select min(pc.created_at)::date from public.programas_cliente pc where pc.cliente_id = p_cliente_id)
      ) as dt
    ) m
    where m.dt is not null
  ),
  uni as (
    select * from mov
    union all select * from eco
    union all select * from dem_criada
    union all select * from dem_concluida
    union all select * from marco
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'fonte',          e.fonte,
      'tipo',           e.tipo,
      'data',           e.data,
      'titulo',         e.titulo,
      'descricao',      e.descricao,
      'visivelCliente', e.visivel_cliente,
      'editavel',       e.editavel,
      'refTipo',        e.ref_tipo,
      'refId',          e.ref_id,
      'metadata',       e.metadata
    ) order by e.data desc
  ), '[]'::jsonb)
  into v_eventos
  from (
    select * from uni u
    where (not v_cliente or u.visivel_cliente)
      and (p_inicio is null or u.data::date >= p_inicio)
      and (p_fim is null or u.data::date <= p_fim)
    order by u.data desc
    limit greatest(coalesce(p_limit, 100), 1)
  ) e;

  -- ── Patrimônio em milhas (saldo atual × valor base / custo real) ───────────
  select
    coalesce(sum(pc.saldo), 0),
    coalesce(sum(case when vb.valor_milheiro is not null
                      then pc.saldo / 1000.0 * vb.valor_milheiro else 0 end), 0),
    coalesce(sum(pc.custo_saldo), 0)
  into v_saldo_total, v_valor_milhas, v_valor_real
  from public.programas_cliente pc
  left join public.programa_valor_base vb on vb.program_id = pc.program_id
  where pc.cliente_id = p_cliente_id
    and coalesce(pc.saldo, 0) > 0;

  return jsonb_build_object(
    'eventos', v_eventos,
    'patrimonio', jsonb_build_object(
      'saldoTotal',  v_saldo_total,
      'valorMilhas', v_valor_milhas,
      'valorReal',   v_valor_real,
      'diferenca',   v_valor_milhas - v_valor_real
    ),
    'kpis', coalesce(v_economia->'kpis', '{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_client_timeline_unificada(uuid, text, date, date, int) from public, anon;
grant execute on function public.get_client_timeline_unificada(uuid, text, date, date, int) to authenticated, service_role;

commit;
