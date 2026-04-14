-- Alertas inteligentes v2: remove concentração de milhas; novos tipos; resolvido_por; tipos em texto livre.

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------

delete from public.alertas_sistema where tipo_alerta = 'MILES_CONCENTRATION';
delete from public.alertas_sistema where tipo_alerta = 'MILES_EXPIRING';

alter table public.alertas_sistema drop constraint if exists alertas_sistema_tipo_alerta_check;

alter table public.alertas_sistema
  add column if not exists resolvido_por uuid references auth.users (id) on delete set null;

comment on column public.alertas_sistema.resolvido_por is 'Utilizador que marcou o alerta como resolvido (manual).';

-- ---------------------------------------------------------------------------
-- 2) Sincronização (substitui função anterior)
-- ---------------------------------------------------------------------------

create or replace function public.alertas_sistema_sync()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n_ins int := 0;
  n_batch int;
begin
  if not exists (
    select 1
    from public.perfis p
    where p.usuario_id = auth.uid()
      and p.role in ('admin', 'cs', 'admin_equipe')
  ) then
    raise exception 'alertas_sistema: apenas admin, cs ou admin_equipe podem sincronizar.';
  end if;

  -- Resolver NPS_LOW
  if to_regclass('public.nps_avaliacoes') is not null then
    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'NPS_LOW'
      and not exists (
        select 1
        from (
          select distinct on (n.cliente_id, n.gestor_id)
            n.cliente_id,
            n.gestor_id,
            n.nota
          from public.nps_avaliacoes n
          order by n.cliente_id, n.gestor_id, n.data_avaliacao desc
        ) z
        where z.cliente_id = a.cliente_id
          and z.gestor_id = a.gestor_id
          and z.nota <= 6
      );

    if to_regclass('public.timeline_eventos') is not null then
      update public.alertas_sistema a
      set status = 'resolvido',
          data_resolucao = now()
      where a.status = 'ativo'
        and a.tipo_alerta = 'NPS_BAIXO_SEM_FOLLOWUP'
        and not exists (
          select 1
          from (
            select distinct on (n.cliente_id, n.gestor_id)
              n.cliente_id,
              n.gestor_id,
              n.nota,
              n.data_avaliacao
            from public.nps_avaliacoes n
            order by n.cliente_id, n.gestor_id, n.data_avaliacao desc
          ) z
          where z.cliente_id = a.cliente_id
            and z.gestor_id = a.gestor_id
            and z.nota <= 6
            and z.data_avaliacao <= now() - interval '24 hours'
            and not exists (
              select 1
              from public.timeline_eventos t
              where t.cliente_id = z.cliente_id
                and t.data_evento > z.data_avaliacao
            )
        );
    end if;
  end if;

  -- CSAT_LOW / CSAT_DROP
  if to_regclass('public.csat_avaliacoes') is not null then
    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'CSAT_LOW'
      and not exists (
        select 1
        from (
          select distinct on (c.cliente_id, c.gestor_id)
            c.cliente_id,
            c.gestor_id,
            c.nota
          from public.csat_avaliacoes c
          order by c.cliente_id, c.gestor_id, c.mes_referencia desc, c.data_avaliacao desc
        ) z
        where z.cliente_id = a.cliente_id
          and z.gestor_id = a.gestor_id
          and z.nota <= 2
      );

    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'CSAT_DROP'
      and not exists (
        with monthly as (
          select
            c.gestor_id,
            c.cliente_id,
            date_trunc('month', c.mes_referencia::timestamp)::date as m,
            avg(c.nota::numeric) as avg_n
          from public.csat_avaliacoes c
          group by c.gestor_id, c.cliente_id, date_trunc('month', c.mes_referencia::timestamp)::date
        ),
        cur_d as (select (date_trunc('month', current_date) - interval '1 month')::date as d),
        prev_d as (select (date_trunc('month', current_date) - interval '2 months')::date as d),
        avgs as (
          select
            m.gestor_id,
            m.cliente_id,
            max(m.avg_n) filter (where m.m = (select d from cur_d)) as cur_avg,
            max(m.avg_n) filter (where m.m = (select d from prev_d)) as prev_avg
          from monthly m
          group by m.gestor_id, m.cliente_id
        ),
        drops as (
          select gestor_id, cliente_id
          from avgs
          where cur_avg is not null
            and prev_avg is not null
            and prev_avg - cur_avg >= 2
        )
        select 1
        from drops d
        where d.cliente_id = a.cliente_id
          and d.gestor_id = a.gestor_id
      );

    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'CSAT_NEGATIVO_RECENTE'
      and not exists (
        select 1
        from public.csat_avaliacoes c
        where c.cliente_id = a.cliente_id
          and c.gestor_id = a.gestor_id
          and c.nota <= 2
          and c.data_avaliacao >= now() - interval '24 hours'
      );
  end if;

  if to_regclass('public.gestor_scores') is not null then
    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'GESTOR_SCORE_DROP'
      and not exists (
        with ranked as (
          select
            gs.gestor_id,
            gs.score_total,
            row_number() over (partition by gs.gestor_id order by gs.data_calculo desc) as rn
          from public.gestor_scores gs
        ),
        pair as (
          select
            c.gestor_id,
            c.score_total as cur,
            p.score_total as prev
          from ranked c
          join ranked p
            on p.gestor_id = c.gestor_id
           and p.rn = 2
          where c.rn = 1
            and p.score_total > 0
            and (p.score_total - c.score_total) / p.score_total > 0.20
        )
        select 1
        from pair x
        where x.gestor_id = a.gestor_id
      );
  end if;

  -- CLIENT_INACTIVITY (mantido)
  update public.alertas_sistema a
  set status = 'resolvido',
      data_resolucao = now()
  where a.status = 'ativo'
    and a.tipo_alerta = 'CLIENT_INACTIVITY'
    and exists (
      select 1
      from (
        select
          pc.cliente_id,
          greatest(
            max(pc.updated_at),
            coalesce(
              (
                select max(m.data)::timestamptz
                from public.movimentos_programa m
                where m.cliente_id = a.cliente_id
              ),
              'epoch'::timestamptz
            )
          ) as last_ts
        from public.programas_cliente pc
        where pc.cliente_id = a.cliente_id
        group by pc.cliente_id
      ) la
      where la.last_ts >= now() - interval '30 days'
    );

  -- Milhas 7d / 30d
  if to_regclass('public.lotes_programa') is not null then
    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'MILHAS_VENCENDO_7D'
      and not exists (
        select 1
        from public.lotes_programa l
        where l.cliente_id = a.cliente_id
          and l.quantidade > 0
          and l.validade_lote > current_date
          and l.validade_lote <= current_date + interval '7 days'
      );

    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'MILHAS_VENCENDO_30D'
      and not exists (
        select 1
        from public.lotes_programa l
        where l.cliente_id = a.cliente_id
          and l.quantidade > 0
          and l.validade_lote > current_date + interval '7 days'
          and l.validade_lote <= current_date + interval '30 days'
      );
  end if;

  -- Carteira sem movimentação 90d
  update public.alertas_sistema a
  set status = 'resolvido',
      data_resolucao = now()
  where a.status = 'ativo'
    and a.tipo_alerta = 'CARTEIRA_SEM_MOVIMENTACAO'
    and exists (
      select 1
      from (
        select
          pc.cliente_id,
          greatest(
            max(pc.updated_at),
            coalesce(
              (select max(m.data)::timestamptz from public.movimentos_programa m where m.cliente_id = pc.cliente_id),
              'epoch'::timestamptz
            )
          ) as last_ts
        from public.programas_cliente pc
        group by pc.cliente_id
      ) la
      where la.cliente_id = a.cliente_id
        and la.last_ts >= now() - interval '90 days'
    );

  -- Sem interação 30d / 60d (última atividade em programas/movimentos)
  update public.alertas_sistema a
  set status = 'resolvido',
      data_resolucao = now()
  where a.status = 'ativo'
    and a.tipo_alerta = 'SEM_INTERACAO_30D'
    and exists (
      select 1
      from (
        select
          pc.cliente_id,
          greatest(
            max(pc.updated_at),
            coalesce(
              (select max(m.data)::timestamptz from public.movimentos_programa m where m.cliente_id = pc.cliente_id),
              'epoch'::timestamptz
            )
          ) as last_ts
        from public.programas_cliente pc
        group by pc.cliente_id
      ) la
      where la.cliente_id = a.cliente_id
        and la.last_ts >= now() - interval '30 days'
    );

  update public.alertas_sistema a
  set status = 'resolvido',
      data_resolucao = now()
  where a.status = 'ativo'
    and a.tipo_alerta = 'SEM_INTERACAO_60D'
    and exists (
      select 1
      from (
        select
          pc.cliente_id,
          greatest(
            max(pc.updated_at),
            coalesce(
              (select max(m.data)::timestamptz from public.movimentos_programa m where m.cliente_id = pc.cliente_id),
              'epoch'::timestamptz
            )
          ) as last_ts
        from public.programas_cliente pc
        group by pc.cliente_id
      ) la
      where la.cliente_id = a.cliente_id
        and la.last_ts >= now() - interval '60 days'
    );

  update public.alertas_sistema a
  set status = 'resolvido',
      data_resolucao = now()
  where a.status = 'ativo'
    and a.tipo_alerta = 'DEMANDA_ATRASADA'
    and not exists (
      select 1
      from public.demandas_cliente d
      where d.id = (split_part(a.dedup_key, ':', 2))::bigint
        and d.status <> 'concluida'
        and d.created_at < now() - interval '7 days'
    );

  -- Detrator sem plano: resolve quando há ação na timeline após a avaliação
  if to_regclass('public.timeline_eventos') is not null and to_regclass('public.nps_avaliacoes') is not null then
    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'DETRATOR_SEM_PLANO'
      and exists (
        select 1
        from public.nps_avaliacoes n
        where n.cliente_id = a.cliente_id
          and n.gestor_id = a.gestor_id
          and n.classificacao = 'detrator'
          and exists (
            select 1
            from public.timeline_eventos t
            where t.cliente_id = n.cliente_id
              and t.data_evento > n.data_avaliacao
          )
      );
  end if;

  -- Churn risk: resolve se score cair
  if to_regclass('public.nps_avaliacoes') is not null
     and to_regclass('public.emissoes') is not null
     and to_regclass('public.lotes_programa') is not null
  then
    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'CHURN_RISK_ALTO'
      and not exists (
        with last_act as (
          select
            pc.cliente_id,
            greatest(
              max(pc.updated_at),
              coalesce(
                (select max(m.data)::timestamptz from public.movimentos_programa m where m.cliente_id = pc.cliente_id),
                'epoch'::timestamptz
              )
            ) as last_ts
          from public.programas_cliente pc
          group by pc.cliente_id
        ),
        last_nps as (
          select distinct on (n.cliente_id)
            n.cliente_id,
            n.nota
          from public.nps_avaliacoes n
          order by n.cliente_id, n.data_avaliacao desc
        ),
        churn as (
          select
            la.cliente_id,
            (case when la.last_ts < now() - interval '30 days' then 1 else 0 end) +
            (case when not exists (
              select 1 from public.emissoes e
              where e.cliente_id = la.cliente_id and e.data_emissao >= current_date - interval '180 days'
            ) then 1 else 0 end) +
            (case when coalesce((select ln.nota from last_nps ln where ln.cliente_id = la.cliente_id), 10) < 7 then 1 else 0 end) +
            (case when exists (
              select 1 from public.lotes_programa l
              where l.cliente_id = la.cliente_id and l.quantidade > 0
                and l.validade_lote > current_date and l.validade_lote <= current_date + interval '30 days'
            ) then 1 else 0 end) +
            (case when exists (
              select 1 from public.demandas_cliente d
              where d.cliente_id = la.cliente_id
                and d.status <> 'concluida'
                and d.created_at < now() - interval '7 days'
            ) then 1 else 0 end) as sc
          from last_act la
        )
        select 1 from churn c
        where c.cliente_id = a.cliente_id
          and c.sc >= 3
      );
  end if;

  if to_regclass('public.emissoes') is not null then
    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'SEM_COMPRA_6MESES'
      and exists (
        select 1
        from public.emissoes e
        where e.cliente_id = a.cliente_id
          and e.data_emissao >= current_date - interval '180 days'
      );
  end if;

  if to_regclass('public.lotes_programa') is not null then
    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'SALDO_ZERADO_VENCIMENTO'
      and not exists (
        with z as (
          select pc.cliente_id
          from public.programas_cliente pc
          group by pc.cliente_id
          having sum(pc.saldo) <= 0
        ),
        had_exp as (
          select distinct l.cliente_id
          from public.lotes_programa l
          where l.validade_lote < current_date
            and l.validade_lote >= current_date - interval '30 days'
        )
        select 1
        from z
        inner join had_exp h on h.cliente_id = z.cliente_id
        where z.cliente_id = a.cliente_id
      );
  end if;

  -- VIP abandono
  update public.alertas_sistema a
  set status = 'resolvido',
      data_resolucao = now()
  where a.status = 'ativo'
    and a.tipo_alerta = 'VIP_ABANDONO'
    and exists (
      select 1
      from (
        select
          pc.cliente_id,
          greatest(
            max(pc.updated_at),
            coalesce(
              (select max(m.data)::timestamptz from public.movimentos_programa m where m.cliente_id = pc.cliente_id),
              'epoch'::timestamptz
            )
          ) as last_ts
        from public.programas_cliente pc
        group by pc.cliente_id
      ) la
      where la.cliente_id = a.cliente_id
        and la.last_ts >= now() - interval '20 days'
    );

  -- Inserções ----------------------------------------------------------------

  if to_regclass('public.nps_avaliacoes') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select
      'NPS_LOW',
      z.cliente_id,
      z.gestor_id,
      public.perfis_equipe_id_safe(z.gestor_id),
      'critico'::text,
      'NPS baixo: nota ' || z.nota::text || ' (≤ 6) na última avaliação.',
      'ativo',
      'NPS_LOW:' || z.cliente_id::text || ':' || z.gestor_id::text
    from (
      select distinct on (n.cliente_id, n.gestor_id)
        n.cliente_id,
        n.gestor_id,
        n.nota
      from public.nps_avaliacoes n
      order by n.cliente_id, n.gestor_id, n.data_avaliacao desc
    ) z
    where z.nota <= 6
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;

    if to_regclass('public.timeline_eventos') is not null then
      insert into public.alertas_sistema (
        tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
      )
      select
        'NPS_BAIXO_SEM_FOLLOWUP',
        z.cliente_id,
        z.gestor_id,
        public.perfis_equipe_id_safe(z.gestor_id),
        'alto'::text,
        'Cliente com nota NPS abaixo de 6 sem follow-up registrado (últimas 24h+).',
        'ativo',
        'NPS_FU:' || z.cliente_id::text || ':' || z.gestor_id::text
      from (
        select distinct on (n.cliente_id, n.gestor_id)
          n.cliente_id,
          n.gestor_id,
          n.nota,
          n.data_avaliacao
        from public.nps_avaliacoes n
        order by n.cliente_id, n.gestor_id, n.data_avaliacao desc
      ) z
      where z.nota <= 6
        and z.data_avaliacao <= now() - interval '24 hours'
        and not exists (
          select 1 from public.timeline_eventos t
          where t.cliente_id = z.cliente_id
            and t.data_evento > z.data_avaliacao
        )
      on conflict (dedup_key) where (status = 'ativo') do nothing;
      get diagnostics n_batch = row_count;
      n_ins := n_ins + n_batch;
    end if;
  end if;

  if to_regclass('public.csat_avaliacoes') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select
      'CSAT_LOW',
      z.cliente_id,
      z.gestor_id,
      public.perfis_equipe_id_safe(z.gestor_id),
      'alto'::text,
      'CSAT baixo: nota ' || z.nota::text || ' (≤ 2) na última avaliação mensal.',
      'ativo',
      'CSAT_LOW:' || z.cliente_id::text || ':' || z.gestor_id::text
    from (
      select distinct on (c.cliente_id, c.gestor_id)
        c.cliente_id,
        c.gestor_id,
        c.nota
      from public.csat_avaliacoes c
      order by c.cliente_id, c.gestor_id, c.mes_referencia desc, c.data_avaliacao desc
    ) z
    where z.nota <= 2
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;

    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select
      'CSAT_NEGATIVO_RECENTE',
      c.cliente_id,
      c.gestor_id,
      public.perfis_equipe_id_safe(c.gestor_id),
      'alto'::text,
      'Avaliação CSAT negativa recebida nas últimas 24 horas.',
      'ativo',
      'CSATNEG24:' || c.cliente_id::text || ':' || c.gestor_id::text
    from public.csat_avaliacoes c
    where c.nota <= 2
      and c.data_avaliacao >= now() - interval '24 hours'
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;

    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    with monthly as (
      select
        c.gestor_id,
        c.cliente_id,
        date_trunc('month', c.mes_referencia::timestamp)::date as m,
        avg(c.nota::numeric) as avg_n
      from public.csat_avaliacoes c
      group by c.gestor_id, c.cliente_id, date_trunc('month', c.mes_referencia::timestamp)::date
    ),
    cur_d as (select (date_trunc('month', current_date) - interval '1 month')::date as d),
    prev_d as (select (date_trunc('month', current_date) - interval '2 months')::date as d),
    avgs as (
      select
        m.gestor_id,
        m.cliente_id,
        max(m.avg_n) filter (where m.m = (select d from cur_d)) as cur_avg,
        max(m.avg_n) filter (where m.m = (select d from prev_d)) as prev_avg
      from monthly m
      group by m.gestor_id, m.cliente_id
    ),
    drops as (
      select gestor_id, cliente_id
      from avgs
      where cur_avg is not null
        and prev_avg is not null
        and prev_avg - cur_avg >= 2
    )
    select
      'CSAT_DROP',
      d.cliente_id,
      d.gestor_id,
      public.perfis_equipe_id_safe(d.gestor_id),
      'medio'::text,
      'Queda de CSAT: média caiu ≥ 2 pontos vs. mês anterior (escala 1–5).',
      'ativo',
      'CSAT_DROP:' || d.cliente_id::text || ':' || d.gestor_id::text
    from drops d
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  if to_regclass('public.gestor_scores') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    with ranked as (
      select
        gs.gestor_id,
        gs.score_total,
        row_number() over (partition by gs.gestor_id order by gs.data_calculo desc) as rn
      from public.gestor_scores gs
    ),
    pair as (
      select
        c.gestor_id,
        c.score_total as cur,
        p.score_total as prev
      from ranked c
      join ranked p
        on p.gestor_id = c.gestor_id
       and p.rn = 2
      where c.rn = 1
        and p.score_total > 0
        and (p.score_total - c.score_total) / p.score_total > 0.20
    )
    select
      'GESTOR_SCORE_DROP',
      null::uuid,
      x.gestor_id,
      public.perfis_equipe_id_safe(x.gestor_id),
      'alto'::text,
      'Queda forte no score de performance do gestor (> 20% vs. snapshot anterior).',
      'ativo',
      'GESTOR_SCORE_DROP:' || x.gestor_id::text
    from pair x
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  insert into public.alertas_sistema (
    tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
  )
  with last_act as (
    select
      pc.cliente_id,
      greatest(
        max(pc.updated_at),
        coalesce(
          (
            select max(m.data)::timestamptz
            from public.movimentos_programa m
            where m.cliente_id = pc.cliente_id
          ),
          'epoch'::timestamptz
        )
      ) as last_ts
    from public.programas_cliente pc
    group by pc.cliente_id
  ),
  stale as (
    select la.cliente_id
    from last_act la
    where la.last_ts < now() - interval '30 days'
  )
  select distinct on (s.cliente_id)
    'CLIENT_INACTIVITY',
    s.cliente_id,
    cg.gestor_id,
    public.perfis_equipe_id_safe(cg.gestor_id),
    'medio'::text,
    'Cliente sem movimentação relevante há mais de 30 dias.',
    'ativo',
    'INACTIVITY:' || s.cliente_id::text
  from stale s
  inner join public.cliente_gestores cg on cg.cliente_id = s.cliente_id
  order by s.cliente_id, cg.gestor_id
  on conflict (dedup_key) where (status = 'ativo') do nothing;
  get diagnostics n_batch = row_count;
  n_ins := n_ins + n_batch;

  -- SEM_INTERACAO_30D: entre 30 e 60 dias sem atividade
  insert into public.alertas_sistema (
    tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
  )
  with last_act as (
    select
      pc.cliente_id,
      greatest(
        max(pc.updated_at),
        coalesce(
          (select max(m.data)::timestamptz from public.movimentos_programa m where m.cliente_id = pc.cliente_id),
          'epoch'::timestamptz
        )
      ) as last_ts
    from public.programas_cliente pc
    group by pc.cliente_id
  )
  select distinct on (la.cliente_id)
    'SEM_INTERACAO_30D',
    la.cliente_id,
    cg.gestor_id,
    public.perfis_equipe_id_safe(cg.gestor_id),
    'medio'::text,
    'Sem interação registrada com este cliente nos últimos 30 dias.',
    'ativo',
    'SEMINT30:' || la.cliente_id::text
  from last_act la
  inner join public.cliente_gestores cg on cg.cliente_id = la.cliente_id
  where la.last_ts < now() - interval '30 days'
    and la.last_ts >= now() - interval '60 days'
  order by la.cliente_id, cg.gestor_id
  on conflict (dedup_key) where (status = 'ativo') do nothing;
  get diagnostics n_batch = row_count;
  n_ins := n_ins + n_batch;

  insert into public.alertas_sistema (
    tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
  )
  with last_act as (
    select
      pc.cliente_id,
      greatest(
        max(pc.updated_at),
        coalesce(
          (select max(m.data)::timestamptz from public.movimentos_programa m where m.cliente_id = pc.cliente_id),
          'epoch'::timestamptz
        )
      ) as last_ts
    from public.programas_cliente pc
    group by pc.cliente_id
  )
  select distinct on (la.cliente_id)
    'SEM_INTERACAO_60D',
    la.cliente_id,
    cg.gestor_id,
    public.perfis_equipe_id_safe(cg.gestor_id),
    'alto'::text,
    'Nenhuma interação registrada nos últimos 60 dias. Alto risco de abandono.',
    'ativo',
    'SEMINT60:' || la.cliente_id::text
  from last_act la
  inner join public.cliente_gestores cg on cg.cliente_id = la.cliente_id
  where la.last_ts < now() - interval '60 days'
  order by la.cliente_id, cg.gestor_id
  on conflict (dedup_key) where (status = 'ativo') do nothing;
  get diagnostics n_batch = row_count;
  n_ins := n_ins + n_batch;

  if to_regclass('public.lotes_programa') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select distinct on (l.cliente_id)
      'MILHAS_VENCENDO_7D',
      l.cliente_id,
      cg.gestor_id,
      public.perfis_equipe_id_safe(cg.gestor_id),
      'critico'::text,
      'Milhas prestes a expirar. Ação imediata necessária (vencimento em até 7 dias).',
      'ativo',
      'MILHAS7D:' || l.cliente_id::text
    from public.lotes_programa l
    inner join public.cliente_gestores cg on cg.cliente_id = l.cliente_id
    where l.quantidade > 0
      and l.validade_lote > current_date
      and l.validade_lote <= current_date + interval '7 days'
    order by l.cliente_id, cg.gestor_id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;

    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select distinct on (l.cliente_id)
      'MILHAS_VENCENDO_30D',
      l.cliente_id,
      cg.gestor_id,
      public.perfis_equipe_id_safe(cg.gestor_id),
      'medio'::text,
      'Cliente possui milhas que vencem em menos de 30 dias.',
      'ativo',
      'MILHAS30D:' || l.cliente_id::text
    from public.lotes_programa l
    inner join public.cliente_gestores cg on cg.cliente_id = l.cliente_id
    where l.quantidade > 0
      and l.validade_lote > current_date + interval '7 days'
      and l.validade_lote <= current_date + interval '30 days'
    order by l.cliente_id, cg.gestor_id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  insert into public.alertas_sistema (
    tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
  )
  with last_act as (
    select
      pc.cliente_id,
      greatest(
        max(pc.updated_at),
        coalesce(
          (select max(m.data)::timestamptz from public.movimentos_programa m where m.cliente_id = pc.cliente_id),
          'epoch'::timestamptz
        )
      ) as last_ts
    from public.programas_cliente pc
    group by pc.cliente_id
  )
  select distinct on (la.cliente_id)
    'CARTEIRA_SEM_MOVIMENTACAO',
    la.cliente_id,
    cg.gestor_id,
    public.perfis_equipe_id_safe(cg.gestor_id),
    'medio'::text,
    'Carteira de milhas sem nenhuma transação há mais de 90 dias. Risco de expiração por inatividade.',
    'ativo',
    'MOV90:' || la.cliente_id::text
  from last_act la
  inner join public.cliente_gestores cg on cg.cliente_id = la.cliente_id
  where la.last_ts < now() - interval '90 days'
  order by la.cliente_id, cg.gestor_id
  on conflict (dedup_key) where (status = 'ativo') do nothing;
  get diagnostics n_batch = row_count;
  n_ins := n_ins + n_batch;

  if to_regclass('public.emissoes') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    with last_compra as (
      select e.cliente_id, max(e.data_emissao) as d
      from public.emissoes e
      group by e.cliente_id
    )
    select distinct on (cg.cliente_id)
      'SEM_COMPRA_6MESES',
      cg.cliente_id,
      cg.gestor_id,
      public.perfis_equipe_id_safe(cg.gestor_id),
      'medio'::text,
      'Nenhuma venda registrada para este cliente nos últimos 6 meses.',
      'ativo',
      'SEM6M:' || cg.cliente_id::text
    from public.cliente_gestores cg
    left join last_compra lc on lc.cliente_id = cg.cliente_id
    where lc.d is null or lc.d < current_date - interval '180 days'
    order by cg.cliente_id, cg.gestor_id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  insert into public.alertas_sistema (
    tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
  )
  select distinct on (d.id)
    'DEMANDA_ATRASADA',
    d.cliente_id,
    cg.gestor_id,
    public.perfis_equipe_id_safe(cg.gestor_id),
    'alto'::text,
    'Demanda em aberto há mais de 7 dias (status: ' || d.status || ').',
    'ativo',
    'DEMANDA:' || d.id::text
  from public.demandas_cliente d
  inner join public.cliente_gestores cg on cg.cliente_id = d.cliente_id
  where d.status <> 'concluida'
    and d.created_at < now() - interval '7 days'
  order by d.id, cg.gestor_id
  on conflict (dedup_key) where (status = 'ativo') do nothing;
  get diagnostics n_batch = row_count;
  n_ins := n_ins + n_batch;

  -- Saldo zerado + vencimento recente (lotes já expirados, carteira zerada)
  if to_regclass('public.lotes_programa') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    with z as (
      select pc.cliente_id
      from public.programas_cliente pc
      group by pc.cliente_id
      having sum(pc.saldo) <= 0
    ),
    had_exp as (
      select distinct l.cliente_id
      from public.lotes_programa l
      where l.validade_lote < current_date
        and l.validade_lote >= current_date - interval '30 days'
    )
    select distinct on (z.cliente_id)
      'SALDO_ZERADO_VENCIMENTO',
      z.cliente_id,
      cg.gestor_id,
      public.perfis_equipe_id_safe(cg.gestor_id),
      'baixo'::text,
      'Cliente perdeu milhas por vencimento. Momento ideal para oferecer novo pacote.',
      'ativo',
      'SALDOZ:' || z.cliente_id::text
    from z
    inner join had_exp h on h.cliente_id = z.cliente_id
    inner join public.cliente_gestores cg on cg.cliente_id = z.cliente_id
    order by z.cliente_id, cg.gestor_id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  -- Detrator sem plano
  if to_regclass('public.timeline_eventos') is not null and to_regclass('public.nps_avaliacoes') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select distinct on (n.cliente_id, n.gestor_id)
      'DETRATOR_SEM_PLANO',
      n.cliente_id,
      n.gestor_id,
      public.perfis_equipe_id_safe(n.gestor_id),
      'critico'::text,
      'Cliente classificado como detrator há mais de 48h sem nenhuma ação registrada.',
      'ativo',
      'DETPLAN:' || n.cliente_id::text || ':' || n.gestor_id::text
    from public.nps_avaliacoes n
    where n.classificacao = 'detrator'
      and n.data_avaliacao <= now() - interval '48 hours'
      and not exists (
        select 1 from public.timeline_eventos t
        where t.cliente_id = n.cliente_id
          and t.data_evento > n.data_avaliacao
      )
    order by n.cliente_id, n.gestor_id, n.data_avaliacao desc
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  -- Churn risk (score >= 3, até 5 critérios)
  if to_regclass('public.nps_avaliacoes') is not null
     and to_regclass('public.emissoes') is not null
     and to_regclass('public.lotes_programa') is not null
  then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    with last_act as (
      select
        pc.cliente_id,
        greatest(
          max(pc.updated_at),
          coalesce(
            (select max(m.data)::timestamptz from public.movimentos_programa m where m.cliente_id = pc.cliente_id),
            'epoch'::timestamptz
          )
        ) as last_ts
      from public.programas_cliente pc
      group by pc.cliente_id
    ),
    last_nps as (
      select distinct on (n.cliente_id)
        n.cliente_id,
        n.nota
      from public.nps_avaliacoes n
      order by n.cliente_id, n.data_avaliacao desc
    ),
    churn as (
      select
        la.cliente_id,
        (case when la.last_ts < now() - interval '30 days' then 1 else 0 end) +
        (case when not exists (
          select 1 from public.emissoes e
          where e.cliente_id = la.cliente_id and e.data_emissao >= current_date - interval '180 days'
        ) then 1 else 0 end) +
        (case when coalesce((select ln.nota from last_nps ln where ln.cliente_id = la.cliente_id), 10) < 7 then 1 else 0 end) +
        (case when exists (
          select 1 from public.lotes_programa l
          where l.cliente_id = la.cliente_id and l.quantidade > 0
            and l.validade_lote > current_date and l.validade_lote <= current_date + interval '30 days'
        ) then 1 else 0 end) +
        (case when exists (
          select 1 from public.demandas_cliente d
          where d.cliente_id = la.cliente_id
            and d.status <> 'concluida'
            and d.created_at < now() - interval '7 days'
        ) then 1 else 0 end) as sc
      from last_act la
    )
    select distinct on (c.cliente_id)
      'CHURN_RISK_ALTO',
      c.cliente_id,
      cg.gestor_id,
      public.perfis_equipe_id_safe(cg.gestor_id),
      (case
        when c.sc >= 5 then 'critico'
        when c.sc = 4 then 'alto'
        else 'medio'
      end)::text,
      'Alto risco de churn (score ' || c.sc::text || '/5).',
      'ativo',
      'CHURN:' || c.cliente_id::text
    from churn c
    inner join public.cliente_gestores cg on cg.cliente_id = c.cliente_id
    where c.sc >= 3
    order by c.cliente_id, cg.gestor_id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  -- VIP abandono
  if to_regclass('public.emissoes') is not null then
  insert into public.alertas_sistema (
    tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
  )
  with milhas as (
    select pc.cliente_id, sum(pc.saldo)::numeric as tot_m
    from public.programas_cliente pc
    group by pc.cliente_id
  ),
  vendas as (
    select
      e.cliente_id,
      count(*)::int as n_em,
      coalesce(sum(e.taxa_embarque), 0)::numeric as gasto_em
    from public.emissoes e
    group by e.cliente_id
  ),
  last_act as (
    select
      pc.cliente_id,
      greatest(
        max(pc.updated_at),
        coalesce(
          (select max(m.data)::timestamptz from public.movimentos_programa m where m.cliente_id = pc.cliente_id),
          'epoch'::timestamptz
        )
      ) as last_ts
    from public.programas_cliente pc
    group by pc.cliente_id
  ),
  vip as (
    select la.cliente_id
    from last_act la
    left join milhas mi on mi.cliente_id = la.cliente_id
    left join vendas v on v.cliente_id = la.cliente_id
    where la.last_ts < now() - interval '20 days'
      and (
        coalesce(mi.tot_m, 0) > 500000
        or coalesce(v.n_em, 0) >= 5
        or coalesce(v.gasto_em, 0) > 10000
      )
  )
  select distinct on (v.cliente_id)
    'VIP_ABANDONO',
    v.cliente_id,
    cg.gestor_id,
    public.perfis_equipe_id_safe(cg.gestor_id),
    'critico'::text,
    'Cliente de alto valor sem interação há mais de 20 dias.',
    'ativo',
    'VIPAB:' || v.cliente_id::text
  from vip v
  inner join public.cliente_gestores cg on cg.cliente_id = v.cliente_id
  order by v.cliente_id, cg.gestor_id
  on conflict (dedup_key) where (status = 'ativo') do nothing;
  get diagnostics n_batch = row_count;
  n_ins := n_ins + n_batch;
  end if;

  return n_ins;
end;
$$;

grant execute on function public.alertas_sistema_sync() to authenticated;
