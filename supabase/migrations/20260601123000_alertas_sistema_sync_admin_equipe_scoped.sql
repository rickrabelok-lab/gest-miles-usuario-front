-- Draft seguro: sync de alertas limitado às equipes administradas pelo admin_equipe autenticado.
-- Não aplicar sem aprovação. Mantém a sync global atual reservada a admin/cs.

alter table public.alertas_sistema
  drop constraint if exists alertas_sistema_tipo_alerta_check;

create or replace function public.alertas_sistema_sync_admin_equipe()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe_ids uuid[];
  n_ins int := 0;
  n_batch int;
begin
  select array_agg(distinct x.equipe_id)
    into v_equipe_ids
  from (
    select p.equipe_id
    from public.perfis p
    where p.usuario_id = auth.uid()
      and p.role = 'admin_equipe'
      and p.equipe_id is not null
    union
    select ea.equipe_id
    from public.equipe_admin ea
    where ea.ativo = true
      and (
        ea.admin_equipe_id_1 = auth.uid()
        or ea.admin_equipe_id_2 = auth.uid()
        or ea.admin_equipe_id_3 = auth.uid()
      )
  ) x
  where x.equipe_id is not null;

  if coalesce(array_length(v_equipe_ids, 1), 0) = 0 then
    raise exception 'alertas_sistema: admin_equipe sem equipe administrada para sincronizar.';
  end if;

  -- Resolve somente alertas da(s) equipe(s) do admin_equipe.
  update public.alertas_sistema a
  set status = 'resolvido',
      data_resolucao = now()
  where a.status = 'ativo'
    and a.equipe_id = any(v_equipe_ids)
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
    and a.equipe_id = any(v_equipe_ids)
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

  -- Insere somente candidatos cuja equipe calculada pertence ao admin_equipe.
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
  where public.perfis_equipe_id_safe(cg.gestor_id) = any(v_equipe_ids)
  order by s.cliente_id, cg.gestor_id
  on conflict (dedup_key) where (status = 'ativo') do nothing;
  get diagnostics n_batch = row_count;
  n_ins := n_ins + n_batch;

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
    and public.perfis_equipe_id_safe(cg.gestor_id) = any(v_equipe_ids)
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
    and public.perfis_equipe_id_safe(cg.gestor_id) = any(v_equipe_ids)
  order by x.cliente_id, cg.gestor_id
  on conflict (dedup_key) where (status = 'ativo') do nothing;
  get diagnostics n_batch = row_count;
  n_ins := n_ins + n_batch;

  if to_regclass('public.emissoes') is not null and to_regclass('public.pos_vendas') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select distinct on (e.id)
      'VENDA_SEM_POS_VENDA',
      e.cliente_id,
      e.usuario_responsavel,
      public.perfis_equipe_id_safe(e.usuario_responsavel),
      'medio'::text,
      'Venda concluída há mais de 2 dias sem pós-venda registrado.',
      'ativo',
      'POSV:' || e.id::text
    from public.emissoes e
    inner join public.cliente_gestores cg on cg.cliente_id = e.cliente_id and cg.gestor_id = e.usuario_responsavel
    where e.created_at <= now() - interval '2 days'
      and not exists (select 1 from public.pos_vendas pv where pv.emissao_id = e.id)
      and public.perfis_equipe_id_safe(e.usuario_responsavel) = any(v_equipe_ids)
    order by e.id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  if to_regclass('public.emissoes') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select distinct on (e.id)
      'COMISSAO_PENDENTE',
      e.cliente_id,
      e.usuario_responsavel,
      public.perfis_equipe_id_safe(e.usuario_responsavel),
      'medio'::text,
      'Comissão esperada não recebida após 30 dias da venda.',
      'ativo',
      'COM:' || e.id::text
    from public.emissoes e
    inner join public.cliente_gestores cg on cg.cliente_id = e.cliente_id and cg.gestor_id = e.usuario_responsavel
    where e.comissao_recebida = false
      and e.created_at <= now() - interval '30 days'
      and public.perfis_equipe_id_safe(e.usuario_responsavel) = any(v_equipe_ids)
    order by e.id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  if to_regclass('public.emissoes') is not null and to_regclass('public.financeiro_receitas') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select distinct on (e.id)
      'RECEITA_NAO_REGISTRADA',
      e.cliente_id,
      e.usuario_responsavel,
      public.perfis_equipe_id_safe(e.usuario_responsavel),
      'baixo'::text,
      'Venda concluída sem receita correspondente lançada no financeiro.',
      'ativo',
      'REC:' || e.id::text
    from public.emissoes e
    inner join public.cliente_gestores cg on cg.cliente_id = e.cliente_id and cg.gestor_id = e.usuario_responsavel
    where e.created_at <= now() - interval '3 days'
      and not exists (select 1 from public.financeiro_receitas r where r.emissao_id = e.id)
      and public.perfis_equipe_id_safe(e.usuario_responsavel) = any(v_equipe_ids)
    order by e.id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  if to_regclass('public.cliente_metricas') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select distinct on (cg.cliente_id)
      'SEM_PRIMEIRO_CONTATO',
      cg.cliente_id,
      cg.gestor_id,
      public.perfis_equipe_id_safe(cg.gestor_id),
      'alto'::text,
      'Cliente cadastrado há mais de 7 dias sem primeiro contacto registado.',
      'ativo',
      'SEM1C:' || cg.cliente_id::text
    from public.cliente_gestores cg
    inner join public.perfis p on p.usuario_id = cg.cliente_id and p.role = 'cliente_gestao'
    left join public.cliente_metricas m on m.cliente_id = cg.cliente_id
    where cg.created_at <= now() - interval '7 days'
      and m.primeiro_contato_em is null
      and public.perfis_equipe_id_safe(cg.gestor_id) = any(v_equipe_ids)
    order by cg.cliente_id, cg.gestor_id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  return n_ins;
end;
$$;

revoke all on function public.alertas_sistema_sync_admin_equipe() from public, anon;
grant execute on function public.alertas_sistema_sync_admin_equipe() to authenticated, service_role;

comment on function public.alertas_sistema_sync_admin_equipe() is
  'Sincroniza alertas apenas para equipes administradas pelo admin_equipe autenticado. Draft de mitigação para evitar sync global.';
