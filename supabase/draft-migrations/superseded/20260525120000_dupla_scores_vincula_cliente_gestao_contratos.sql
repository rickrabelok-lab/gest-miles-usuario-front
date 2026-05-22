-- Aplica/actualiza a RPC completa: tokens de dupla + ligação cliente_gestores
-- a contratos_cliente como useGestor (e-mails do perfil + config.clientePerfil, nome; último
-- contrato por coalesce(updated_at, created_at) desc). Contagens: inativo = só
-- status inativo; ativo = todo o resto (incl. sem contrato, pendente) — alinhado aos KPIs do app.
-- Idempotente. Use este ficheiro no Supabase se 20260524120000 já tiver sido aplicada
-- no remoto na versão antiga (só o push deste ficheiro aplica a alteração de gestão).

create or replace function public.dupla_scores_refresh_snapshot()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
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
  with dupla_tokens (dupla_key, token) as (
    values
      ('silmara-tiago',    'silmara'),
      ('silmara-tiago',    'tiago'),
      ('felipe-guilherme', 'felipe'),
      ('felipe-guilherme', 'filipe'),
      ('felipe-guilherme', 'guilherme'),
      ('felipe-guilherme', 'gui'),
      ('ana-diogo',        'ana'),
      ('ana-diogo',        'diogo'),
      ('rick-jessica',     'rick'),
      ('rick-jessica',     'jessica'),
      ('rick-jessica',     'jéssica'),
      ('carla-wesley',     'carla'),
      ('carla-wesley',     'wesley')
  ),
  gestor_map as (
    select distinct
      dt.dupla_key,
      p.usuario_id as gestor_id,
      public.perfis_equipe_id_safe(p.usuario_id) as equipe_id
    from dupla_tokens dt
    join public.perfis p
      on lower(split_part(trim(p.nome_completo), ' ', 1)) = dt.token
    where p.role in ('gestor', 'cs', 'admin_equipe')
  ),
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
  dupla_clientes as (
    select
      s.dupla_key,
      s.cliente_id
    from (
      select gm.dupla_key, cg.cliente_id
      from gestor_map gm
      join public.cliente_gestores cg on cg.gestor_id = gm.gestor_id
      union
      select gm.dupla_key, gc.cliente_id
      from gestor_map gm
      join public.gestor_clientes gc on gc.gestor_id = gm.gestor_id
      union
      select gm.dupla_key, ec.cliente_id
      from gestor_map gm
      join public.equipe_clientes ec
        on coalesce(ec.ativo, true) = true
       and (
         ec.gestor_nacional_id = gm.gestor_id
         or ec.gestor_internacional_id = gm.gestor_id
       )
    ) s
    group by s.dupla_key, s.cliente_id
  ),
  -- Carteira: cliente_gestores + legado + equipe; gestão: último contrato (como useGestor).
  client_status as (
    select
      dc.dupla_key,
      dc.cliente_id,
      cc.status_cliente
    from dupla_clientes dc
    join public.perfis pf on pf.usuario_id = dc.cliente_id
    left join lateral (
      select c.status_cliente
      from public.contratos_cliente c
      where (
        (nullif(lower(trim(c.cliente_email::text)), '') is not null
         and nullif(lower(trim(c.cliente_email::text)), '') in (
           nullif(lower(trim(pf.email::text)), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'emailContato')), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'email')), '')
         ))
        or (
          nullif(regexp_replace(lower(trim(c.cliente_nome::text)), '\s+', ' ', 'g'), '') is not null
          and nullif(regexp_replace(lower(trim(pf.nome_completo::text)), '\s+', ' ', 'g'), '') is not null
          and regexp_replace(lower(trim(c.cliente_nome::text)), '\s+', ' ', 'g')
            = regexp_replace(lower(trim(pf.nome_completo::text)), '\s+', ' ', 'g')
        )
      )
      order by coalesce(c.updated_at, c.created_at) desc nulls last
      limit 1
    ) cc on true
  ),
  counts as (
    select
      dupla_key,
      count(*) filter (where
        lower(trim(coalesce(status_cliente::text, ''))) in ('inativo', 'inactive')
      ) as inativos,
      count(*) filter (where
        lower(trim(coalesce(status_cliente::text, ''))) not in ('inativo', 'inactive')
      ) as ativos
    from client_status
    group by dupla_key
  ),
  retention as (
    select
      dc.dupla_key,
      coalesce(
        avg(
          extract(epoch from (now() - cc3.data_inicio::timestamptz)) / 86400 / 365
        ),
        0
      ) as avg_anos
    from dupla_clientes dc
    join public.perfis pf on pf.usuario_id = dc.cliente_id
    left join lateral (
      select c.data_inicio
      from public.contratos_cliente c
      where (
        (nullif(lower(trim(c.cliente_email::text)), '') is not null
         and nullif(lower(trim(c.cliente_email::text)), '') in (
           nullif(lower(trim(pf.email::text)), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'emailContato')), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'email')), '')
         ))
        or (
          nullif(regexp_replace(lower(trim(c.cliente_nome::text)), '\s+', ' ', 'g'), '') is not null
          and nullif(regexp_replace(lower(trim(pf.nome_completo::text)), '\s+', ' ', 'g'), '') is not null
          and regexp_replace(lower(trim(c.cliente_nome::text)), '\s+', ' ', 'g')
            = regexp_replace(lower(trim(pf.nome_completo::text)), '\s+', ' ', 'g')
        )
      )
        and lower(trim(coalesce(c.status_cliente::text, ''))) not in ('inativo', 'inactive')
      order by c.data_inicio asc nulls last
      limit 1
    ) cc3 on true
    group by dc.dupla_key
  ),
  renovacoes as (
    select
      dc.dupla_key,
      count(cc4.id) as cnt
    from dupla_clientes dc
    join public.perfis pf on pf.usuario_id = dc.cliente_id
    join public.contratos_cliente cc4
      on (
        (nullif(lower(trim(cc4.cliente_email::text)), '') is not null
         and nullif(lower(trim(cc4.cliente_email::text)), '') in (
           nullif(lower(trim(pf.email::text)), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'emailContato')), ''),
           nullif(lower(trim(pf.configuracao_tema->'clientePerfil'->>'email')), '')
         ))
        or (
          nullif(regexp_replace(lower(trim(cc4.cliente_nome::text)), '\s+', ' ', 'g'), '') is not null
          and regexp_replace(lower(trim(cc4.cliente_nome::text)), '\s+', ' ', 'g')
            = regexp_replace(lower(trim(pf.nome_completo::text)), '\s+', ' ', 'g')
        )
      )
     and coalesce(cc4.renovacao_confirmada, false) = true
     and cc4.created_at >= now() - interval '365 days'
    group by dc.dupla_key
  ),
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
