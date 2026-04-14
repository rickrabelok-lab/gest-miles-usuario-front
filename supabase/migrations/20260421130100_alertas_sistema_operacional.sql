-- Estende alertas automáticos com domínio operacional (cotações, pós-venda, viagens, financeiro, reclamações).
-- 1) Renomeia a implementação existente para alertas_sistema_sync_impl (idempotente).
-- 2) alertas_sistema_sync_operacional: resoluções + inserções dos novos tipos.
-- 3) Novo alertas_sistema_sync() = impl + operacional.

do $rename$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'alertas_sistema_sync'
      and pg_get_function_identity_arguments(p.oid) = ''
  )
  and not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'alertas_sistema_sync_impl'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute 'alter function public.alertas_sistema_sync() rename to alertas_sistema_sync_impl';
  end if;
end;
$rename$;

create or replace function public.alertas_sistema_sync_operacional()
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

  -- Resolver quando condição deixa de existir --------------------------------

  if to_regclass('public.cotacoes') is not null then
    update public.alertas_sistema a
    set status = 'resolvido', data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'COTACAO_SEM_RESPOSTA'
      and not exists (
        select 1
        from public.cotacoes c
        where c.id = (split_part(a.dedup_key, ':', 2))::uuid
          and c.status = 'enviada'
          and c.updated_at <= now() - interval '5 days'
      );

    update public.alertas_sistema a
    set status = 'resolvido', data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'COTACAO_SEM_RESPONSAVEL'
      and not exists (
        select 1
        from public.cotacoes c
        where c.id = (split_part(a.dedup_key, ':', 2))::uuid
          and c.responsavel_id is null
          and c.status in ('pendente', 'em_andamento')
          and c.created_at <= now() - interval '1 day'
      );
  end if;

  if to_regclass('public.pos_vendas') is not null and to_regclass('public.emissoes') is not null then
    update public.alertas_sistema a
    set status = 'resolvido', data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'VENDA_SEM_POS_VENDA'
      and exists (
        select 1
        from public.pos_vendas pv
        where pv.emissao_id = (split_part(a.dedup_key, ':', 2))::uuid
      );
  end if;

  if to_regclass('public.viagens_cliente') is not null then
    update public.alertas_sistema a
    set status = 'resolvido', data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'CHECKIN_SEM_CONFIRMACAO'
      and not exists (
        select 1
        from public.viagens_cliente v
        where v.id = (split_part(a.dedup_key, ':', 2))::uuid
          and v.status = 'check_in_aberto'
          and v.abertura_checkin is not null
          and v.abertura_checkin <= now() - interval '24 hours'
          and v.checkin_confirmado_em is null
      );

    update public.alertas_sistema a
    set status = 'resolvido', data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'VIAGEM_SEM_DOCUMENTACAO'
      and not exists (
        select 1
        from public.viagens_cliente v
        where v.id = (split_part(a.dedup_key, ':', 2))::uuid
          and v.data_partida <= current_date + 7
          and v.data_partida > current_date
          and v.documentacao_confirmada = false
      );
  end if;

  if to_regclass('public.financeiro_despesas') is not null then
    update public.alertas_sistema a
    set status = 'resolvido', data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'DESPESA_ATRASADA'
      and not exists (
        select 1
        from public.financeiro_despesas d
        where d.id = (split_part(a.dedup_key, ':', 2))::uuid
          and d.data_vencimento < current_date
          and d.situacao = 'pendente'
          and d.resolvido = false
      );
  end if;

  if to_regclass('public.emissoes') is not null then
    update public.alertas_sistema a
    set status = 'resolvido', data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'COMISSAO_PENDENTE'
      and exists (
        select 1
        from public.emissoes e
        where e.id = (split_part(a.dedup_key, ':', 2))::uuid
          and e.comissao_recebida = true
      );

    if to_regclass('public.financeiro_receitas') is not null then
      update public.alertas_sistema a
      set status = 'resolvido', data_resolucao = now()
      where a.status = 'ativo'
        and a.tipo_alerta = 'RECEITA_NAO_REGISTRADA'
        and exists (
          select 1
          from public.financeiro_receitas r
          where r.emissao_id = (split_part(a.dedup_key, ':', 2))::uuid
        );
    end if;
  end if;

  if to_regclass('public.cliente_metricas') is not null then
    update public.alertas_sistema a
    set status = 'resolvido', data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'SEM_PRIMEIRO_CONTATO'
      and exists (
        select 1
        from public.cliente_metricas m
        where m.cliente_id = a.cliente_id
          and m.primeiro_contato_em is not null
      );
  end if;

  if to_regclass('public.reclamacoes_cliente') is not null then
    update public.alertas_sistema a
    set status = 'resolvido', data_resolucao = now()
    where a.status = 'ativo'
      and a.tipo_alerta = 'MULTIPLAS_RECLAMACOES'
      and not exists (
        select 1
        from (
          select r.cliente_id, count(*) as c
          from public.reclamacoes_cliente r
          where r.created_at >= now() - interval '60 days'
          group by r.cliente_id
          having count(*) >= 2
        ) x
        where x.cliente_id = a.cliente_id
      );
  end if;

  -- Inserções ---------------------------------------------------------------

  if to_regclass('public.cotacoes') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select
      'COTACAO_SEM_RESPOSTA',
      c.cliente_id,
      c.gestor_id,
      public.perfis_equipe_id_safe(c.gestor_id),
      'alto'::text,
      'Cotação enviada há mais de 5 dias sem retorno do cliente.',
      'ativo',
      'COTSR:' || c.id::text
    from public.cotacoes c
    inner join public.cliente_gestores cg on cg.cliente_id = c.cliente_id and cg.gestor_id = c.gestor_id
    where c.status = 'enviada'
      and c.updated_at <= now() - interval '5 days'
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;

    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select
      'COTACAO_SEM_RESPONSAVEL',
      c.cliente_id,
      c.gestor_id,
      public.perfis_equipe_id_safe(c.gestor_id),
      'medio'::text,
      'Cotação em aberto sem gestor atribuído.',
      'ativo',
      'COTRESP:' || c.id::text
    from public.cotacoes c
    inner join public.cliente_gestores cg on cg.cliente_id = c.cliente_id and cg.gestor_id = c.gestor_id
    where c.responsavel_id is null
      and c.status in ('pendente', 'em_andamento')
      and c.created_at <= now() - interval '1 day'
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

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
    order by e.id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  if to_regclass('public.viagens_cliente') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select
      'CHECKIN_SEM_CONFIRMACAO',
      v.cliente_id,
      v.gestor_id,
      public.perfis_equipe_id_safe(v.gestor_id),
      'alto'::text,
      'Janela de check-in aberta há mais de 24h sem confirmação do cliente.',
      'ativo',
      'CHKIN:' || v.id::text
    from public.viagens_cliente v
    inner join public.cliente_gestores cg on cg.cliente_id = v.cliente_id and cg.gestor_id = v.gestor_id
    where v.status = 'check_in_aberto'
      and v.abertura_checkin is not null
      and v.abertura_checkin <= now() - interval '24 hours'
      and v.checkin_confirmado_em is null
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;

    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select
      'VIAGEM_SEM_DOCUMENTACAO',
      v.cliente_id,
      v.gestor_id,
      public.perfis_equipe_id_safe(v.gestor_id),
      'alto'::text,
      'Viagem em menos de 7 dias e documentação não confirmada.',
      'ativo',
      'VIAGDOC:' || v.id::text
    from public.viagens_cliente v
    inner join public.cliente_gestores cg on cg.cliente_id = v.cliente_id and cg.gestor_id = v.gestor_id
    where v.data_partida <= current_date + 7
      and v.data_partida > current_date
      and v.documentacao_confirmada = false
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  if to_regclass('public.financeiro_despesas') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select
      'DESPESA_ATRASADA',
      d.cliente_id,
      d.gestor_id,
      public.perfis_equipe_id_safe(d.gestor_id),
      'alto'::text,
      'Despesa com vencimento passado ainda não paga.',
      'ativo',
      'DESP:' || d.id::text
    from public.financeiro_despesas d
    inner join public.cliente_gestores cg on cg.cliente_id = d.cliente_id and cg.gestor_id = d.gestor_id
    where d.cliente_id is not null
      and d.data_vencimento < current_date
      and d.situacao = 'pendente'
      and d.resolvido = false
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
      and (m.primeiro_contato_em is null)
    order by cg.cliente_id, cg.gestor_id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  if to_regclass('public.reclamacoes_cliente') is not null then
    insert into public.alertas_sistema (
      tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, dedup_key
    )
    select distinct on (x.cliente_id)
      'MULTIPLAS_RECLAMACOES',
      x.cliente_id,
      x.gestor_id,
      public.perfis_equipe_id_safe(x.gestor_id),
      'alto'::text,
      'Cliente com 2 ou mais reclamações nos últimos 60 dias.',
      'ativo',
      'RECLM:' || x.cliente_id::text
    from (
      select r.cliente_id, r.gestor_id, count(*)::int as c
      from public.reclamacoes_cliente r
      where r.created_at >= now() - interval '60 days'
      group by r.cliente_id, r.gestor_id
      having count(*) >= 2
    ) x
    inner join public.cliente_gestores cg on cg.cliente_id = x.cliente_id and cg.gestor_id = x.gestor_id
    order by x.cliente_id
    on conflict (dedup_key) where (status = 'ativo') do nothing;
    get diagnostics n_batch = row_count;
    n_ins := n_ins + n_batch;
  end if;

  return n_ins;
end;
$$;

create or replace function public.alertas_sistema_sync()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a int := 0;
  b int := 0;
begin
  select public.alertas_sistema_sync_impl() into a;
  select public.alertas_sistema_sync_operacional() into b;
  return coalesce(a, 0) + coalesce(b, 0);
end;
$$;

grant execute on function public.alertas_sistema_sync_impl() to authenticated;
grant execute on function public.alertas_sistema_sync_operacional() to authenticated;
grant execute on function public.alertas_sistema_sync() to authenticated;
