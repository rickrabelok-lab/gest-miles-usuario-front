-- Alertas automáticos para CS / gestores (NPS, CSAT, scores, inatividade, milhas, demandas).
-- Depende de: cliente_gestores, perfis, cs_can_access_gestor, can_cs_view_client, can_manage_client,
-- is_legacy_platform_admin, rls_team_admin_matches_equipe, perfis_equipe_id_safe (migrations NPS/equipe).

-- ---------------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------------

create table if not exists public.alertas_sistema (
  id uuid primary key default gen_random_uuid(),
  tipo_alerta text not null check (
    tipo_alerta in (
      'NPS_LOW',
      'CSAT_LOW',
      'CSAT_DROP',
      'GESTOR_SCORE_DROP',
      'CLIENT_INACTIVITY',
      'MILES_EXPIRING',
      'DEMANDA_ATRASADA',
      'MILES_CONCENTRATION'
    )
  ),
  cliente_id uuid references auth.users (id) on delete cascade,
  gestor_id uuid references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  nivel text not null check (nivel in ('baixo', 'medio', 'alto', 'critico')),
  mensagem text not null,
  status text not null default 'ativo' check (status in ('ativo', 'resolvido')),
  data_criacao timestamptz not null default now(),
  data_resolucao timestamptz,
  dedup_key text not null
);

create index if not exists idx_alertas_sistema_status_criacao
  on public.alertas_sistema (status, data_criacao desc);

create index if not exists idx_alertas_sistema_gestor
  on public.alertas_sistema (gestor_id)
  where status = 'ativo';

create index if not exists idx_alertas_sistema_cliente
  on public.alertas_sistema (cliente_id)
  where status = 'ativo';

create unique index if not exists alertas_sistema_dedup_ativo_idx
  on public.alertas_sistema (dedup_key)
  where status = 'ativo';

-- ---------------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------------

alter table public.alertas_sistema enable row level security;

drop policy if exists alertas_sistema_select on public.alertas_sistema;
create policy alertas_sistema_select on public.alertas_sistema
  for select
  using (
    public.is_legacy_platform_admin()
    or public.rls_team_admin_matches_equipe(equipe_id)
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or (cliente_id is not null and public.can_cs_view_client(cliente_id))
    or (cliente_id is not null and public.can_manage_client(cliente_id))
    or (cliente_id is null and gestor_id is not null and gestor_id = auth.uid())
  );

drop policy if exists alertas_sistema_update on public.alertas_sistema;
create policy alertas_sistema_update on public.alertas_sistema
  for update
  using (
    public.is_legacy_platform_admin()
    or public.rls_team_admin_matches_equipe(equipe_id)
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or (cliente_id is not null and public.can_cs_view_client(cliente_id))
    or (cliente_id is not null and public.can_manage_client(cliente_id))
    or (cliente_id is null and gestor_id is not null and gestor_id = auth.uid())
  )
  with check (
    public.is_legacy_platform_admin()
    or public.rls_team_admin_matches_equipe(equipe_id)
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or (cliente_id is not null and public.can_cs_view_client(cliente_id))
    or (cliente_id is not null and public.can_manage_client(cliente_id))
    or (cliente_id is null and gestor_id is not null and gestor_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3) Sincronização (SECURITY DEFINER): criar + resolver + anti-duplicata (dedup_key)
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
      and p.role in ('admin', 'cs')
  ) then
    raise exception 'alertas_sistema: apenas admin ou cs podem sincronizar.';
  end if;

  -- Resolver quando a condição deixa de valer
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
  end if;

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

  if to_regclass('public.lotes_programa') is not null then
    update public.alertas_sistema a
    set status = 'resolvido',
        data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'MILES_EXPIRING'
      and not exists (
        select 1
        from public.lotes_programa l
        where l.cliente_id = a.cliente_id
          and l.quantidade > 0
          and l.validade_lote > current_date
          and l.validade_lote <= current_date + interval '90 days'
      );
  end if;

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

  update public.alertas_sistema a
  set status = 'resolvido',
      data_resolucao = now()
  where a.status = 'ativo'
    and a.tipo_alerta = 'MILES_CONCENTRATION'
    and not exists (
      with totals as (
        select pc.cliente_id, sum(pc.saldo)::numeric as tot
        from public.programas_cliente pc
        group by pc.cliente_id
      ),
      mx as (
        select pc.cliente_id, max(pc.saldo / nullif(t.tot, 0)) as max_share
        from public.programas_cliente pc
        join totals t on t.cliente_id = pc.cliente_id
        where t.tot > 0
        group by pc.cliente_id
      )
      select 1
      from mx x
      where x.cliente_id = a.cliente_id
        and x.max_share > 0.6
    );

  -- Inserir novos (dedup: índice parcial + ON CONFLICT)
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

  if to_regclass('public.lotes_programa') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select distinct on (l.cliente_id)
      'MILES_EXPIRING',
      l.cliente_id,
      cg.gestor_id,
      public.perfis_equipe_id_safe(cg.gestor_id),
      'alto'::text,
      'Milhas com vencimento nos próximos 90 dias.',
      'ativo',
      'EXPIRE:' || l.cliente_id::text
    from public.lotes_programa l
    inner join public.cliente_gestores cg on cg.cliente_id = l.cliente_id
    where l.quantidade > 0
      and l.validade_lote > current_date
      and l.validade_lote <= current_date + interval '90 days'
    order by l.cliente_id, cg.gestor_id
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

  insert into public.alertas_sistema (
    tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
  )
  with totals as (
    select cliente_id, sum(saldo)::numeric as tot
    from public.programas_cliente
    group by cliente_id
  ),
  mx as (
    select
      pc.cliente_id,
      max(pc.saldo / nullif(t.tot, 0)) as max_share
    from public.programas_cliente pc
    join totals t on t.cliente_id = pc.cliente_id
    where t.tot > 0
    group by pc.cliente_id
  )
  select distinct on (x.cliente_id)
    'MILES_CONCENTRATION',
    x.cliente_id,
    cg.gestor_id,
    public.perfis_equipe_id_safe(cg.gestor_id),
    'medio'::text,
    'Concentração de milhas > 60% em um único programa.',
    'ativo',
    'CONC:' || x.cliente_id::text
  from mx x
  inner join public.cliente_gestores cg on cg.cliente_id = x.cliente_id
  where x.max_share > 0.6
  order by x.cliente_id, cg.gestor_id
  on conflict (dedup_key) where (status = 'ativo') do nothing;
  get diagnostics n_batch = row_count;
  n_ins := n_ins + n_batch;

  return n_ins;
end;
$$;

grant execute on function public.alertas_sistema_sync() to authenticated;
