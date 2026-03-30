-- =============================================================================
-- Client Intelligence Insights
--
-- Supabase -> SQL Editor -> New query
-- Cole TODO o conteudo deste arquivo -> Run
--
-- Pre-requisitos:
-- - Tabelas: nps_avaliacoes, csat_avaliacoes, programas_cliente, movimentos_programa,
--   emissoes, cliente_gestores, alertas_sistema, tarefas_cs
-- - Funcoes: public.can_manage_client, public.cs_can_access_gestor, public.perfis_equipe_id_safe,
--   public.is_legacy_platform_admin
-- =============================================================================

-- Conteudo da migration:

-- =============================================================================
-- Client Intelligence Insights
--
-- Objetivo:
-- - Criar insights acionaveis por cliente/gestor para CS e gestores
-- - Suportar resolucao manual e criacao de tarefa a partir do insight
--
-- Observacoes de logica (padroes ajustaveis):
-- - CHURN_RISK: NPS <= 6 OU CSAT <= 2 OU sem atividade > 30d
-- - SATISFACTION_DROP: queda de CSAT entre (mes-2) e (mes-1) >= 1 ponto (media mensal)
-- - EMISSION_OPPORTUNITY: saldo alto + economia_real positiva (ult. 90d)
-- - UPSELL_OPPORTUNITY: engajamento + bom score + sinal premium (state jsonb)
-- - LOW_USAGE: saldo alto + sem emissao do gestor (ult. 90d)
-- - HIGH_ENGAGEMENT: muitos movimentos no ult. 30d ou atividade recente (7d)
-- =============================================================================

create table if not exists public.insights_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users (id) on delete cascade,
  gestor_id uuid not null references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  tipo_insight text not null check (
    tipo_insight in (
      'CHURN_RISK',
      'SATISFACTION_DROP',
      'EMISSION_OPPORTUNITY',
      'UPSELL_OPPORTUNITY',
      'LOW_USAGE',
      'HIGH_ENGAGEMENT'
    )
  ),
  titulo text not null,
  descricao text not null,
  nivel text not null check (nivel in ('baixo', 'medio', 'alto', 'critico')),
  status text not null default 'ativo' check (status in ('ativo', 'resolvido')),
  data_criacao timestamptz not null default now()
);

create index if not exists idx_insights_cliente_cliente_status
  on public.insights_cliente (cliente_id, status, data_criacao desc);

create index if not exists idx_insights_cliente_gestor_status
  on public.insights_cliente (gestor_id, status, data_criacao desc);

create unique index if not exists insights_cliente_dedup_ativo_idx
  on public.insights_cliente (cliente_id, gestor_id, tipo_insight)
  where status = 'ativo';

alter table public.insights_cliente enable row level security;

drop policy if exists insights_cliente_select on public.insights_cliente;
create policy insights_cliente_select on public.insights_cliente
  for select
  using (
    public.is_legacy_platform_admin()
    or (gestor_id = auth.uid())
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
  );

drop policy if exists insights_cliente_update on public.insights_cliente;
create policy insights_cliente_update on public.insights_cliente
  for update
  using (
    public.is_legacy_platform_admin()
    or (gestor_id = auth.uid())
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
  )
  with check (
    public.is_legacy_platform_admin()
    or (gestor_id = auth.uid())
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
  );

-- =============================================================================
-- Sync: avalia (insere/resolve) insights para um cliente
-- =============================================================================

create or replace function public.insights_cliente_sync_for_cliente(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g record;
  v_equipe uuid;

  v_nps smallint;
  v_last_csat smallint;
  v_prev_month date;
  v_cur_month date;
  v_prev_csat_avg numeric;
  v_cur_csat_avg numeric;

  v_last_activity timestamptz;
  v_mov_count_30d int;
  v_total_saldo numeric;
  v_positive_savings numeric;
  v_has_emission boolean;
  v_is_premium boolean;

  v_churn boolean;
  v_sat_drop boolean;
  v_emission boolean;
  v_upsell boolean;
  v_low_usage boolean;
  v_high_engagement boolean;

  v_churn_level text;
  v_sat_drop_level text;
  v_emission_level text;
  v_upsell_level text;
  v_low_usage_level text;
  v_high_engagement_level text;

  v_churn_desc text;
  v_sat_drop_desc text;
  v_emission_desc text;
  v_upsell_desc text;
  v_low_usage_desc text;
  v_high_engagement_desc text;

  -- Ajustes de regra (facil de tunar)
  v_min_saldo numeric := 50000;
  v_savings_min numeric := 1;
begin
  if p_cliente_id is null then
    return;
  end if;

  if not public.is_legacy_platform_admin() then
    if not (public.can_manage_client(p_cliente_id) or public.can_cs_view_client(p_cliente_id)) then
      return;
    end if;
  end if;

  for g in
    select cg.gestor_id
    from public.cliente_gestores cg
    where cg.cliente_id = p_cliente_id
  loop
    v_equipe := public.perfis_equipe_id_safe(g.gestor_id);

    select n.nota
    into v_nps
    from public.nps_avaliacoes n
    where n.cliente_id = p_cliente_id
      and n.gestor_id = g.gestor_id
    order by n.data_avaliacao desc
    limit 1;

    select c.nota
    into v_last_csat
    from public.csat_avaliacoes c
    where c.cliente_id = p_cliente_id
      and c.gestor_id = g.gestor_id
    order by c.mes_referencia desc, c.data_avaliacao desc
    limit 1;

    v_prev_month := (date_trunc('month', current_date) - interval '2 months')::date;
    v_cur_month := (date_trunc('month', current_date) - interval '1 month')::date;

    select
      max(s.avg_n) filter (where s.m = v_cur_month),
      max(s.avg_n) filter (where s.m = v_prev_month)
    into v_cur_csat_avg, v_prev_csat_avg
    from (
      select date_trunc('month', c.mes_referencia::timestamp)::date as m,
             avg(c.nota::numeric) as avg_n
      from public.csat_avaliacoes c
      where c.cliente_id = p_cliente_id
        and c.gestor_id = g.gestor_id
      group by 1
    ) s;

    select greatest(
      coalesce((select max(pc.updated_at) from public.programas_cliente pc where pc.cliente_id = p_cliente_id), 'epoch'::timestamptz),
      coalesce((select max(mp.created_at) from public.movimentos_programa mp where mp.cliente_id = p_cliente_id), 'epoch'::timestamptz),
      coalesce((select max(n.data_avaliacao) from public.nps_avaliacoes n where n.cliente_id = p_cliente_id and n.gestor_id = g.gestor_id), 'epoch'::timestamptz),
      coalesce((select max(c.data_avaliacao) from public.csat_avaliacoes c where c.cliente_id = p_cliente_id and c.gestor_id = g.gestor_id), 'epoch'::timestamptz)
    )
    into v_last_activity;

    select coalesce(sum(pc.saldo), 0)::numeric
    into v_total_saldo
    from public.programas_cliente pc
    where pc.cliente_id = p_cliente_id;

    select coalesce(sum(mp.economia_real), 0)::numeric
    into v_positive_savings
    from public.movimentos_programa mp
    where mp.cliente_id = p_cliente_id
      and mp.created_at >= now() - interval '90 days'
      and mp.economia_real is not null
      and mp.economia_real > 0;

    select count(*)
    into v_mov_count_30d
    from public.movimentos_programa mp
    where mp.cliente_id = p_cliente_id
      and mp.created_at >= now() - interval '30 days';

    if to_regclass('public.emissoes') is not null then
      select exists (
        select 1
        from public.emissoes e
        where e.cliente_id = p_cliente_id
          and e.usuario_responsavel = g.gestor_id
          and e.created_at >= now() - interval '90 days'
          and e.milhas_utilizadas > 0
      )
      into v_has_emission;
    else
      v_has_emission := false;
    end if;

    select coalesce((
      select bool_or(
        case
          when pc.state ? 'premium' then lower(coalesce(pc.state->>'premium', 'false')) in ('true','1','yes','y','t')
          when pc.state ? 'is_premium' then lower(coalesce(pc.state->>'is_premium', 'false')) in ('true','1','yes','y','t')
          when pc.state ? 'premium_usage' then lower(coalesce(pc.state->>'premium_usage', 'false')) in ('true','1','yes','y','t')
          else false
        end
      )
      from public.programas_cliente pc
      where pc.cliente_id = p_cliente_id
    ), false)
    into v_is_premium;

    -- CHURN_RISK
    v_churn := (v_nps is not null and v_nps <= 6)
               or (v_last_csat is not null and v_last_csat <= 2)
               or (v_last_activity < now() - interval '30 days');

    if v_churn then
      if (v_nps is not null and v_nps <= 6) and (v_last_csat is not null and v_last_csat <= 2) then
        v_churn_level := 'critico';
      elsif (v_nps is not null and v_nps <= 6) or (v_last_csat is not null and v_last_csat <= 2) then
        v_churn_level := 'alto';
      else
        v_churn_level := 'medio';
      end if;

      v_churn_desc :=
        'NPS atual: ' || coalesce(v_nps::text, '-') ||
        ' . CSAT atual: ' || coalesce(v_last_csat::text, '-') ||
        ' . Ultima atividade: ' || to_char(v_last_activity, 'YYYY-MM-DD');

      insert into public.insights_cliente (
        cliente_id, gestor_id, equipe_id,
        tipo_insight, titulo, descricao, nivel, status
      )
      values (
        p_cliente_id, g.gestor_id, v_equipe,
        'CHURN_RISK',
        'Risco de churn',
        v_churn_desc,
        v_churn_level,
        'ativo'
      )
      on conflict (cliente_id, gestor_id, tipo_insight) where (status = 'ativo') do nothing;
    else
      update public.insights_cliente
      set status = 'resolvido'
      where cliente_id = p_cliente_id
        and gestor_id = g.gestor_id
        and tipo_insight = 'CHURN_RISK'
        and status = 'ativo';
    end if;

    -- SATISFACTION_DROP
    v_sat_drop := (v_prev_csat_avg is not null and v_cur_csat_avg is not null and (v_prev_csat_avg - v_cur_csat_avg) >= 1);

    if v_sat_drop then
      if (v_prev_csat_avg - v_cur_csat_avg) >= 2 then
        v_sat_drop_level := 'alto';
      else
        v_sat_drop_level := 'medio';
      end if;

      v_sat_drop_desc :=
        'Media CSAT caiu de ' || coalesce(round(v_prev_csat_avg, 2)::text, '-') ||
        ' para ' || coalesce(round(v_cur_csat_avg, 2)::text, '-') ||
        ' (mes -2 vs mes -1).';

      insert into public.insights_cliente (
        cliente_id, gestor_id, equipe_id,
        tipo_insight, titulo, descricao, nivel, status
      )
      values (
        p_cliente_id, g.gestor_id, v_equipe,
        'SATISFACTION_DROP',
        'Queda de satisfacao (CSAT)',
        v_sat_drop_desc,
        v_sat_drop_level,
        'ativo'
      )
      on conflict (cliente_id, gestor_id, tipo_insight) where (status = 'ativo') do nothing;
    else
      update public.insights_cliente
      set status = 'resolvido'
      where cliente_id = p_cliente_id
        and gestor_id = g.gestor_id
        and tipo_insight = 'SATISFACTION_DROP'
        and status = 'ativo';
    end if;

    -- EMISSION_OPPORTUNITY
    v_emission := (v_total_saldo >= v_min_saldo) and (v_positive_savings >= v_savings_min);
    if v_emission then
      v_emission_level := 'alto';
      v_emission_desc :=
        'Saldo acumulado alto (>= ' || v_min_saldo::text || ') e economia_real positiva nos ultimos 90 dias.';

      insert into public.insights_cliente (
        cliente_id, gestor_id, equipe_id,
        tipo_insight, titulo, descricao, nivel, status
      )
      values (
        p_cliente_id, g.gestor_id, v_equipe,
        'EMISSION_OPPORTUNITY',
        'Oportunidade de emissao',
        v_emission_desc,
        v_emission_level,
        'ativo'
      )
      on conflict (cliente_id, gestor_id, tipo_insight) where (status = 'ativo') do nothing;
    else
      update public.insights_cliente
      set status = 'resolvido'
      where cliente_id = p_cliente_id
        and gestor_id = g.gestor_id
        and tipo_insight = 'EMISSION_OPPORTUNITY'
        and status = 'ativo';
    end if;

    -- UPSELL_OPPORTUNITY
    v_upsell := (v_is_premium)
                and (v_nps is not null and v_nps >= 8)
                and (v_last_csat is not null and v_last_csat >= 4)
                and (v_mov_count_30d >= 3);

    if v_upsell then
      v_upsell_level := 'alto';
      v_upsell_desc :=
        'Premium sinalizado no state do cliente, com bom score e engajamento recente (>= 3 movimentos/30d).';

      insert into public.insights_cliente (
        cliente_id, gestor_id, equipe_id,
        tipo_insight, titulo, descricao, nivel, status
      )
      values (
        p_cliente_id, g.gestor_id, v_equipe,
        'UPSELL_OPPORTUNITY',
        'Oportunidade de upsell',
        v_upsell_desc,
        v_upsell_level,
        'ativo'
      )
      on conflict (cliente_id, gestor_id, tipo_insight) where (status = 'ativo') do nothing;
    else
      update public.insights_cliente
      set status = 'resolvido'
      where cliente_id = p_cliente_id
        and gestor_id = g.gestor_id
        and tipo_insight = 'UPSELL_OPPORTUNITY'
        and status = 'ativo';
    end if;

    -- LOW_USAGE
    v_low_usage := (v_total_saldo >= v_min_saldo) and (not v_has_emission);
    if v_low_usage then
      v_low_usage_level := 'medio';
      v_low_usage_desc :=
        'Saldo acumulado alto, mas nao ha emissao registrada pelo gestor nos ultimos 90 dias.';

      insert into public.insights_cliente (
        cliente_id, gestor_id, equipe_id,
        tipo_insight, titulo, descricao, nivel, status
      )
      values (
        p_cliente_id, g.gestor_id, v_equipe,
        'LOW_USAGE',
        'Baixo uso de milhas',
        v_low_usage_desc,
        v_low_usage_level,
        'ativo'
      )
      on conflict (cliente_id, gestor_id, tipo_insight) where (status = 'ativo') do nothing;
    else
      update public.insights_cliente
      set status = 'resolvido'
      where cliente_id = p_cliente_id
        and gestor_id = g.gestor_id
        and tipo_insight = 'LOW_USAGE'
        and status = 'ativo';
    end if;

    -- HIGH_ENGAGEMENT
    v_high_engagement := (v_mov_count_30d >= 5) or (v_last_activity >= now() - interval '7 days');
    if v_high_engagement then
      v_high_engagement_level := 'alto';
      v_high_engagement_desc :=
        'Engajamento alto (movimentos recentes: ' || v_mov_count_30d::text || ' / 30d) e/ou atividade dentro de 7 dias.';

      insert into public.insights_cliente (
        cliente_id, gestor_id, equipe_id,
        tipo_insight, titulo, descricao, nivel, status
      )
      values (
        p_cliente_id, g.gestor_id, v_equipe,
        'HIGH_ENGAGEMENT',
        'Engajamento alto',
        v_high_engagement_desc,
        v_high_engagement_level,
        'ativo'
      )
      on conflict (cliente_id, gestor_id, tipo_insight) where (status = 'ativo') do nothing;
    else
      update public.insights_cliente
      set status = 'resolvido'
      where cliente_id = p_cliente_id
        and gestor_id = g.gestor_id
        and tipo_insight = 'HIGH_ENGAGEMENT'
        and status = 'ativo';
    end if;
  end loop;
end;
$$;

-- =============================================================================
-- Trigger task creation (via alertas_sistema para reutilizar o motor de tarefas)
-- =============================================================================

create or replace function public.insights_cliente_trigger_task_from_insight(p_insight_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ins public.insights_cliente%rowtype;
  v_dedup text;
  v_alert_tipo text;
  v_alert_nivel text;
  v_alert_id uuid;
  v_mensagem text;
begin
  select *
  into ins
  from public.insights_cliente
  where id = p_insight_id;

  if not found then
    return;
  end if;

  if ins.status <> 'ativo' then
    return;
  end if;

  if not public.is_legacy_platform_admin() then
    if not (
      ins.gestor_id = auth.uid()
      or (ins.gestor_id is not null and public.cs_can_access_gestor(ins.gestor_id))
    ) then
      raise exception 'insights_cliente: sem permissao';
    end if;
  end if;

  v_dedup := 'INSIGHT_TASK:' || ins.id::text;

  if exists (
    select 1
    from public.tarefas_cs t
    join public.alertas_sistema a on a.id = t.alerta_id
    where a.dedup_key = v_dedup
  ) then
    return;
  end if;

  v_alert_nivel := ins.nivel;

  if ins.tipo_insight = 'CHURN_RISK' then
    v_alert_tipo := 'NPS_LOW';
  elsif ins.tipo_insight = 'SATISFACTION_DROP' then
    v_alert_tipo := 'CSAT_LOW';
  elsif ins.tipo_insight = 'LOW_USAGE' then
    v_alert_tipo := 'CLIENT_INACTIVITY';
  elsif ins.tipo_insight = 'EMISSION_OPPORTUNITY' then
    v_alert_tipo := 'GESTOR_SCORE_DROP';
  elsif ins.tipo_insight = 'UPSELL_OPPORTUNITY' then
    v_alert_tipo := 'NPS_LOW';
  elsif ins.tipo_insight = 'HIGH_ENGAGEMENT' then
    v_alert_tipo := 'GESTOR_SCORE_DROP';
  else
    v_alert_tipo := 'CSAT_LOW';
  end if;

  v_mensagem := 'Insight acionavel: ' || ins.titulo || '. ' || ins.descricao;

  insert into public.alertas_sistema (
    tipo_alerta, cliente_id, gestor_id, equipe_id,
    nivel, mensagem, status, dedup_key
  )
  values (
    v_alert_tipo,
    ins.cliente_id,
    ins.gestor_id,
    ins.equipe_id,
    v_alert_nivel,
    v_mensagem,
    'ativo',
    v_dedup
  )
  on conflict (dedup_key) do nothing;

  select a.id
  into v_alert_id
  from public.alertas_sistema a
  where a.dedup_key = v_dedup
  order by a.data_criacao desc
  limit 1;

  if v_alert_id is not null then
    perform public.tarefas_cs_create_from_alerta(v_alert_id);
  end if;

  update public.alertas_sistema
  set status = 'resolvido',
      data_resolucao = now()
  where dedup_key = v_dedup
    and status = 'ativo';
end;
$$;

grant execute on function public.insights_cliente_sync_for_cliente(uuid) to authenticated;
grant execute on function public.insights_cliente_trigger_task_from_insight(uuid) to authenticated;

-- =============================================================================
-- Triggers: disparam sync para o cliente afetado
-- =============================================================================

create or replace function public.insights_cliente_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cliente_id is not null then
    perform public.insights_cliente_sync_for_cliente(new.cliente_id);
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.nps_avaliacoes') is not null then
    drop trigger if exists trg_insights_nps on public.nps_avaliacoes;
    create trigger trg_insights_nps
    after insert or update of nota, data_avaliacao, gestor_id, cliente_id
    on public.nps_avaliacoes
    for each row
    execute function public.insights_cliente_sync_trigger();
  end if;
end $$;

do $$
begin
  if to_regclass('public.csat_avaliacoes') is not null then
    drop trigger if exists trg_insights_csat on public.csat_avaliacoes;
    create trigger trg_insights_csat
    after insert or update of nota, data_avaliacao, gestor_id, cliente_id
    on public.csat_avaliacoes
    for each row
    execute function public.insights_cliente_sync_trigger();
  end if;
end $$;

do $$
begin
  if to_regclass('public.programas_cliente') is not null then
    drop trigger if exists trg_insights_programas on public.programas_cliente;
    create trigger trg_insights_programas
    after insert or update of updated_at, saldo, state
    on public.programas_cliente
    for each row
    execute function public.insights_cliente_sync_trigger();
  end if;
end $$;

do $$
begin
  if to_regclass('public.movimentos_programa') is not null then
    drop trigger if exists trg_insights_movimentos on public.movimentos_programa;
    create trigger trg_insights_movimentos
    after insert on public.movimentos_programa
    for each row
    execute function public.insights_cliente_sync_trigger();
  end if;
end $$;

do $$
begin
  if to_regclass('public.emissoes') is not null then
    drop trigger if exists trg_insights_emissoes on public.emissoes;
    create trigger trg_insights_emissoes
    after insert on public.emissoes
    for each row
    execute function public.insights_cliente_sync_trigger();
  end if;
end $$;

