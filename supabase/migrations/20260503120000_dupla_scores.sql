-- Pré-requisito: gestor_scores, contratos_cliente, perfis, equipes,
-- is_legacy_platform_admin, rls_team_admin_matches_equipe.

-- ---------------------------------------------------------------------------
-- 1) Tabela dupla_scores
-- ---------------------------------------------------------------------------

create table if not exists public.dupla_scores (
  id                 uuid primary key default gen_random_uuid(),
  dupla_key          text not null,
  equipe_id          uuid references public.equipes (id) on delete set null,
  score_total        numeric(6, 2) not null check (score_total >= 0 and score_total <= 100),
  score_nps          numeric(6, 2) not null check (score_nps >= 0 and score_nps <= 100),
  score_csat         numeric(6, 2) not null check (score_csat >= 0 and score_csat <= 100),
  score_sla          numeric(6, 2) not null check (score_sla >= 0 and score_sla <= 100),
  score_economia     numeric(6, 2) not null check (score_economia >= 0 and score_economia <= 100),
  score_retencao     numeric(6, 2) not null check (score_retencao >= 0 and score_retencao <= 100),
  score_renovacoes   numeric(6, 2) not null check (score_renovacoes >= 0 and score_renovacoes <= 100),
  clientes_ativos    integer not null default 0,
  clientes_inativos  integer not null default 0,
  media_anos_cliente numeric(6, 2),
  renovacoes_count   integer not null default 0,
  data_calculo       timestamptz not null default now()
);

create index if not exists idx_dupla_scores_key_calc
  on public.dupla_scores (dupla_key, data_calculo desc);

-- ---------------------------------------------------------------------------
-- 2) RPC — refresh snapshot
-- Pesos: NPS 20%, CSAT 20%, SLA 15%, Economia 20%, Retenção 15%, Renovações 10%
-- Duplas são identificadas por prefixo do primeiro nome em perfis.nome_completo.
-- ---------------------------------------------------------------------------

create or replace function public.dupla_scores_refresh_snapshot()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  -- Apenas admin ou admin_equipe podem acionar
  if not exists (
    select 1 from public.perfis p
    where p.usuario_id = auth.uid()
      and p.role in ('admin', 'admin_equipe', 'cs')
  ) then
    raise exception 'dupla_scores: apenas admin, admin_equipe ou cs podem atualizar o snapshot.';
  end if;

  insert into public.dupla_scores (
    dupla_key, equipe_id,
    score_total, score_nps, score_csat, score_sla,
    score_economia, score_retencao, score_renovacoes,
    clientes_ativos, clientes_inativos,
    media_anos_cliente, renovacoes_count,
    data_calculo
  )
  with duplas (dupla_key, nome_a, nome_b) as (
    values
      ('silmara-tiago',    'Silmara',  'Tiago'),
      ('felipe-guilherme', 'Felipe',   'Guilherme'),
      ('ana-diogo',        'Ana',      'Diogo'),
      ('rick-jessica',     'Rick',     'Jessica'),
      ('carla-wesley',     'Carla',    'Wesley')
  ),
  -- Mapeia primeiro nome → usuario_id via perfis
  gestor_map as (
    select
      d.dupla_key,
      p.usuario_id as gestor_id,
      public.perfis_equipe_id_safe(p.usuario_id) as equipe_id
    from duplas d
    join public.perfis p
      on lower(split_part(trim(p.nome_completo), ' ', 1)) = lower(d.nome_a)
      or lower(split_part(trim(p.nome_completo), ' ', 1)) = lower(d.nome_b)
    where p.role in ('cs', 'admin_equipe', 'admin')
  ),
  -- Pega o score mais recente por gestor de gestor_scores
  latest_gs as (
    select distinct on (gs.gestor_id)
      gs.gestor_id,
      gs.score_nps,
      gs.score_csat,
      gs.score_sla,
      gs.score_economia
    from public.gestor_scores gs
    order by gs.gestor_id, gs.data_calculo desc
  ),
  -- Agrega scores individuais por dupla (média dos gestores da dupla)
  dupla_gs as (
    select
      gm.dupla_key,
      gm.equipe_id,
      coalesce(avg(lg.score_nps),      50) as avg_nps,
      coalesce(avg(lg.score_csat),     50) as avg_csat,
      coalesce(avg(lg.score_sla),      50) as avg_sla,
      coalesce(avg(lg.score_economia), 50) as avg_eco
    from gestor_map gm
    left join latest_gs lg on lg.gestor_id = gm.gestor_id
    group by gm.dupla_key, gm.equipe_id
  ),
  -- Clientes ligados à dupla via cliente_gestores
  dupla_clientes as (
    select
      gm.dupla_key,
      cg.cliente_id
    from gestor_map gm
    join public.cliente_gestores cg on cg.gestor_id = gm.gestor_id
    group by gm.dupla_key, cg.cliente_id
  ),
  -- Status ativo/inativo via contratos_cliente (último por e-mail)
  client_status as (
    select
      dc.dupla_key,
      dc.cliente_id,
      cc.status_cliente
    from dupla_clientes dc
    join public.perfis pf on pf.usuario_id = dc.cliente_id
    left join lateral (
      select status_cliente
      from public.contratos_cliente cc2
      where lower(cc2.cliente_email) = lower(pf.email)
      order by cc2.created_at desc
      limit 1
    ) cc on true
  ),
  counts as (
    select
      dupla_key,
      count(*) filter (where status_cliente = 'ativo')   as ativos,
      count(*) filter (where status_cliente = 'inativo') as inativos
    from client_status
    group by dupla_key
  ),
  -- Retenção: tempo médio (anos) dos clientes ativos desde data_inicio do contrato
  retention as (
    select
      dc.dupla_key,
      coalesce(
        avg(
          extract(epoch from (now() - cc3.data_inicio::timestamptz)) / 86400 / 365
        ) filter (where cc3.status_cliente = 'ativo'),
        0
      ) as avg_anos
    from dupla_clientes dc
    join public.perfis pf on pf.usuario_id = dc.cliente_id
    left join public.contratos_cliente cc3
      on lower(cc3.cliente_email) = lower(pf.email)
     and cc3.status_cliente = 'ativo'
    group by dc.dupla_key
  ),
  -- Renovações confirmadas nos últimos 12 meses
  renovacoes as (
    select
      dc.dupla_key,
      count(cc4.id) as cnt
    from dupla_clientes dc
    join public.perfis pf on pf.usuario_id = dc.cliente_id
    join public.contratos_cliente cc4
      on lower(cc4.cliente_email) = lower(pf.email)
     and cc4.renovacao_confirmada = true
     and cc4.created_at >= now() - interval '365 days'
    group by dc.dupla_key
  ),
  -- Score de retenção: normaliza avg_anos (0–3+ anos → 0–100)
  scored as (
    select
      dg.dupla_key,
      dg.equipe_id,
      dg.avg_nps,
      dg.avg_csat,
      dg.avg_sla,
      dg.avg_eco,
      least(100, greatest(0,
        coalesce(r.avg_anos, 0) / 3.0 * 100
      )) as s_retencao,
      least(100, greatest(0,
        coalesce(rv.cnt, 0) * 10.0
      )) as s_renovacoes,
      coalesce(c.ativos,   0) as ativos,
      coalesce(c.inativos, 0) as inativos,
      coalesce(r.avg_anos, 0) as avg_anos,
      coalesce(rv.cnt, 0)     as renovacoes_cnt
    from dupla_gs dg
    left join counts    c  on c.dupla_key  = dg.dupla_key
    left join retention r  on r.dupla_key  = dg.dupla_key
    left join renovacoes rv on rv.dupla_key = dg.dupla_key
  )
  select
    s.dupla_key,
    s.equipe_id,
    round(
      0.20 * s.avg_nps     +
      0.20 * s.avg_csat    +
      0.15 * s.avg_sla     +
      0.20 * s.avg_eco     +
      0.15 * s.s_retencao  +
      0.10 * s.s_renovacoes,
      2
    ),
    round(s.avg_nps, 2),
    round(s.avg_csat, 2),
    round(s.avg_sla, 2),
    round(s.avg_eco, 2),
    round(s.s_retencao::numeric, 2),
    round(s.s_renovacoes::numeric, 2),
    s.ativos,
    s.inativos,
    round(s.avg_anos::numeric, 2),
    s.renovacoes_cnt,
    now()
  from scored s;

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.dupla_scores_refresh_snapshot() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------

alter table public.dupla_scores enable row level security;

drop policy if exists dupla_scores_select on public.dupla_scores;
create policy dupla_scores_select on public.dupla_scores
  for select
  using (
    public.is_legacy_platform_admin()
    or public.rls_team_admin_matches_equipe(equipe_id)
    or exists (
      select 1 from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role in ('admin', 'admin_equipe', 'cs')
    )
  );
