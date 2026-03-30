-- Ranking de performance de gestores (economia, NPS, CSAT, SLA).
-- Pré-requisitos (migrations anteriores): cliente_gestores, movimentos_programa, demandas_cliente,
-- perfis, equipes, nps_avaliacoes, csat_avaliacoes, public.cs_can_access_gestor,
-- public.perfis_equipe_id_safe, public.rls_team_admin_matches_equipe, public.is_legacy_platform_admin.

-- ---------------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------------

create table if not exists public.gestor_scores (
  id uuid primary key default gen_random_uuid(),
  gestor_id uuid not null references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  score_total numeric(6, 2) not null check (score_total >= 0 and score_total <= 100),
  score_economia numeric(6, 2) not null check (score_economia >= 0 and score_economia <= 100),
  score_nps numeric(6, 2) not null check (score_nps >= 0 and score_nps <= 100),
  score_csat numeric(6, 2) not null check (score_csat >= 0 and score_csat <= 100),
  score_sla numeric(6, 2) not null check (score_sla >= 0 and score_sla <= 100),
  data_calculo timestamptz not null default now()
);

create index if not exists idx_gestor_scores_gestor_calc on public.gestor_scores (gestor_id, data_calculo desc);
create index if not exists idx_gestor_scores_equipe on public.gestor_scores (equipe_id);

-- ---------------------------------------------------------------------------
-- 2) Snapshot: 40% economia (min-max na carteira), 30% NPS, 20% CSAT, 10% SLA
-- ---------------------------------------------------------------------------

create or replace function public.gestor_scores_refresh_snapshot()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  if not exists (
    select 1
    from public.perfis p
    where p.usuario_id = auth.uid()
      and p.role in ('admin', 'cs')
  ) then
    raise exception 'gestor_scores: apenas admin ou cs podem atualizar o ranking.';
  end if;

  if to_regclass('public.nps_avaliacoes') is null or to_regclass('public.csat_avaliacoes') is null then
    raise exception 'gestor_scores: aplique antes as migrations de NPS e CSAT.';
  end if;

  insert into public.gestor_scores (
    gestor_id,
    equipe_id,
    score_total,
    score_economia,
    score_nps,
    score_csat,
    score_sla,
    data_calculo
  )
  with
  gids as (
    select distinct cg.gestor_id
    from public.cliente_gestores cg
  ),
  econ as (
    select
      cg.gestor_id,
      sum(coalesce(m.economia_real, 0))::numeric as raw_econ
    from public.cliente_gestores cg
    left join public.movimentos_programa m
      on m.cliente_id = cg.cliente_id
     and m.tipo = 'saida'
     and m.data >= (current_date - interval '365 days')
    group by cg.gestor_id
  ),
  nps_raw as (
    select
      n.gestor_id,
      avg(n.nota::numeric) as avg_n
    from public.nps_avaliacoes n
    where n.data_avaliacao >= now() - interval '180 days'
    group by n.gestor_id
  ),
  csat_raw as (
    select
      c.gestor_id,
      avg(c.nota::numeric) as avg_c
    from public.csat_avaliacoes c
    where c.data_avaliacao >= now() - interval '180 days'
    group by c.gestor_id
  ),
  sla_raw as (
    select
      cg.gestor_id,
      count(d.id) as n_tot,
      count(d.id) filter (where d.status = 'concluida') as n_ok
    from public.cliente_gestores cg
    left join public.demandas_cliente d
      on d.cliente_id = cg.cliente_id
     and d.created_at >= now() - interval '90 days'
    group by cg.gestor_id
  ),
  base as (
    select
      g.gestor_id,
      public.perfis_equipe_id_safe(g.gestor_id) as equipe_id,
      coalesce(e.raw_econ, 0)::numeric as raw_econ,
      coalesce(n.avg_n, 5::numeric) as avg_n,
      coalesce(c.avg_c, 3::numeric) as avg_c,
      case
        when coalesce(s.n_tot, 0) = 0 then 50::numeric
        else least(
          100::numeric,
          greatest(0::numeric, 100::numeric * s.n_ok::numeric / nullif(s.n_tot, 0))
        )
      end as score_sla
    from gids g
    left join econ e on e.gestor_id = g.gestor_id
    left join nps_raw n on n.gestor_id = g.gestor_id
    left join csat_raw c on c.gestor_id = g.gestor_id
    left join sla_raw s on s.gestor_id = g.gestor_id
  ),
  mx as (
    select
      min(raw_econ) as emin,
      max(raw_econ) as emax
    from base
  ),
  scored as (
    select
      b.gestor_id,
      b.equipe_id,
      case
        when m.emax is null or m.emin is null then 50::numeric
        when m.emax = m.emin then case when b.raw_econ > 0 then 100::numeric else 50::numeric end
        else least(
          100::numeric,
          greatest(
            0::numeric,
            100::numeric * (b.raw_econ - m.emin) / nullif(m.emax - m.emin, 0)
          )
        )
      end as score_economia,
      least(100::numeric, greatest(0::numeric, b.avg_n * 10)) as score_nps,
      least(100::numeric, greatest(0::numeric, (b.avg_c - 1) / 4.0 * 100)) as score_csat,
      b.score_sla
    from base b
    cross join mx m
  )
  select
    s.gestor_id,
    s.equipe_id,
    round(
      0.4 * s.score_economia + 0.3 * s.score_nps + 0.2 * s.score_csat + 0.1 * s.score_sla,
      2
    ),
    round(s.score_economia, 2),
    round(s.score_nps, 2),
    round(s.score_csat, 2),
    round(s.score_sla, 2),
    now()
  from scored s;

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.gestor_scores_refresh_snapshot() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------

alter table public.gestor_scores enable row level security;

drop policy if exists gestor_scores_select on public.gestor_scores;
create policy gestor_scores_select on public.gestor_scores
  for select
  using (
    gestor_id = auth.uid()
    or public.is_legacy_platform_admin()
    or public.cs_can_access_gestor(gestor_id)
    or public.rls_team_admin_matches_equipe(equipe_id)
  );

-- Sem insert/update pelo cliente — só via função definer
