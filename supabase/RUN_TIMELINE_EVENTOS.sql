-- =============================================================================
-- Client Timeline (Customer History)
--
-- Supabase -> SQL Editor -> New query
-- Cole TODO o conteúdo deste arquivo -> Run
--
-- Pré-requisitos:
-- - Tabelas: emissões, nps_avaliacoes, csat_avaliacoes, alertas_sistema, tarefas_cs,
--   programas_cliente, cliente_gestores
-- - Helpers: public.can_cs_view_client, public.can_manage_client
--   e (idealmente) public.perfis_equipe_id_safe
-- =============================================================================

-- Conteúdo da migration:

-- Client Timeline (Customer History)
-- Cria uma visão histórica por `cliente_gestao`/cliente com eventos de emissão, NPS, CSAT, alertas e tarefas.

-- ---------------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------------

create table if not exists public.timeline_eventos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users (id) on delete cascade,
  gestor_id uuid references auth.users (id) on delete set null,
  equipe_id uuid references public.equipes (id) on delete set null,
  tipo_evento text not null check (
    tipo_evento in (
      'EMISSAO',
      'NPS',
      'CSAT',
      'ALERTA',
      'TAREFA',
      'LOGIN',
      'ATUALIZACAO_CONTA'
    )
  ),
  titulo text not null,
  descricao text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  data_evento timestamptz not null default now()
);

create index if not exists idx_timeline_eventos_cliente_data
  on public.timeline_eventos (cliente_id, data_evento desc);

create index if not exists idx_timeline_eventos_gestor
  on public.timeline_eventos (cliente_id, gestor_id, data_evento desc);

-- ---------------------------------------------------------------------------
-- 2) RLS (acesso por cliente)
-- ---------------------------------------------------------------------------

alter table public.timeline_eventos enable row level security;

drop policy if exists timeline_eventos_select on public.timeline_eventos;
create policy timeline_eventos_select on public.timeline_eventos
  for select
  using (
    public.is_legacy_platform_admin()
    or public.can_cs_view_client(cliente_id)
    or public.can_manage_client(cliente_id)
  );

-- ---------------------------------------------------------------------------
-- 3) Inserção via SECURITY DEFINER (usado por triggers)
-- ---------------------------------------------------------------------------

create or replace function public.timeline_eventos_push(
  p_cliente_id uuid,
  p_gestor_id uuid,
  p_equipe_id uuid,
  p_tipo_evento text,
  p_titulo text,
  p_descricao text,
  p_metadata jsonb,
  p_data_evento timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_cliente_id is null then
    return;
  end if;

  insert into public.timeline_eventos (
    cliente_id,
    gestor_id,
    equipe_id,
    tipo_evento,
    titulo,
    descricao,
    metadata,
    data_evento
  )
  values (
    p_cliente_id,
    p_gestor_id,
    p_equipe_id,
    p_tipo_evento,
    p_titulo,
    coalesce(p_descricao, ''),
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_data_evento, now())
  );
end;
$$;

grant execute on function public.timeline_eventos_push(uuid, uuid, uuid, text, text, text, jsonb, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Triggers: Emissões
-- ---------------------------------------------------------------------------

create or replace function public.timeline_on_emissao_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
begin
  v_equipe := null;
  if to_regclass('public.perfis_equipe_id_safe') is not null then
    v_equipe := public.perfis_equipe_id_safe(new.usuario_responsavel);
  end if;

  perform public.timeline_eventos_push(
    new.cliente_id,
    new.usuario_responsavel,
    v_equipe,
    'EMISSAO',
    'Emissão registrada',
    'Programa ' || new.programa || ' • ' || coalesce(new.origem, '-') || ' → ' || coalesce(new.destino, '-') || ' • Classe ' || coalesce(new.classe, '-'),
    jsonb_build_object(
      'emissao_id', new.id,
      'programa', new.programa,
      'origem', new.origem,
      'destino', new.destino,
      'classe', new.classe,
      'data_ida', new.data_ida,
      'data_volta', new.data_volta,
      'milhas_utilizadas', new.milhas_utilizadas,
      'taxa_embarque', new.taxa_embarque
    ),
    new.created_at
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.emissoes') is not null then
    drop trigger if exists trg_timeline_emissoes_insert on public.emissoes;
    create trigger trg_timeline_emissoes_insert
    after insert on public.emissoes
    for each row
    execute function public.timeline_on_emissao_insert();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Triggers: NPS
-- ---------------------------------------------------------------------------

create or replace function public.timeline_on_nps_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.timeline_eventos_push(
    new.cliente_id,
    new.gestor_id,
    new.equipe_id,
    'NPS',
    'NPS enviado',
    'Nota ' || new.nota::text || '/10 • ' || coalesce(new.classificacao, '-'),
    jsonb_build_object(
      'nps_id', new.id,
      'nota', new.nota,
      'classificacao', new.classificacao,
      'comentario', new.comentario,
      'data_avaliacao', new.data_avaliacao
    ),
    new.data_avaliacao
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.nps_avaliacoes') is not null then
    drop trigger if exists trg_timeline_nps_insert on public.nps_avaliacoes;
    create trigger trg_timeline_nps_insert
    after insert on public.nps_avaliacoes
    for each row
    execute function public.timeline_on_nps_insert();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Triggers: CSAT
-- ---------------------------------------------------------------------------

create or replace function public.timeline_on_csat_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.timeline_eventos_push(
    new.cliente_id,
    new.gestor_id,
    new.equipe_id,
    'CSAT',
    'CSAT enviado',
    'Mês ' || to_char(new.mes_referencia, 'YYYY-MM') || ' • Nota ' || new.nota::text || '/5',
    jsonb_build_object(
      'csat_id', new.id,
      'nota', new.nota,
      'mes_referencia', new.mes_referencia,
      'comentario', new.comentario,
      'data_avaliacao', new.data_avaliacao
    ),
    new.data_avaliacao
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.csat_avaliacoes') is not null then
    drop trigger if exists trg_timeline_csat_insert on public.csat_avaliacoes;
    create trigger trg_timeline_csat_insert
    after insert on public.csat_avaliacoes
    for each row
    execute function public.timeline_on_csat_insert();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7) Triggers: Alertas
-- ---------------------------------------------------------------------------

create or replace function public.timeline_on_alerta_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'ativo' then
    return new;
  end if;

  if new.cliente_id is null then
    return new;
  end if;

  perform public.timeline_eventos_push(
    new.cliente_id,
    new.gestor_id,
    new.equipe_id,
    'ALERTA',
    'Alerta criado',
    new.mensagem,
    jsonb_build_object(
      'alerta_id', new.id,
      'tipo_alerta', new.tipo_alerta,
      'nivel', new.nivel,
      'status', new.status
    ),
    new.data_criacao
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.alertas_sistema') is not null then
    drop trigger if exists trg_timeline_alertas_insert on public.alertas_sistema;
    create trigger trg_timeline_alertas_insert
    after insert on public.alertas_sistema
    for each row
    execute function public.timeline_on_alerta_insert();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8) Triggers: Tarefas (insert + update)
-- ---------------------------------------------------------------------------

create or replace function public.timeline_on_tarefa_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cliente_id is null then
    return new;
  end if;

  perform public.timeline_eventos_push(
    new.cliente_id,
    new.gestor_id,
    new.equipe_id,
    'TAREFA',
    'Tarefa criada',
    new.titulo,
    jsonb_build_object(
      'tarefa_id', new.id,
      'tipo_tarefa', new.tipo_tarefa,
      'prioridade', new.prioridade,
      'status', new.status
    ),
    new.data_criacao
  );

  return new;
end;
$$;

create or replace function public.timeline_on_tarefa_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cliente_id is null then
    return new;
  end if;

  if new.status is distinct from old.status
    or new.responsavel_id is distinct from old.responsavel_id
    or new.prioridade is distinct from old.prioridade
  then
    perform public.timeline_eventos_push(
      new.cliente_id,
      new.gestor_id,
      new.equipe_id,
      'TAREFA',
      'Tarefa atualizada',
      new.titulo,
      jsonb_build_object(
        'tarefa_id', new.id,
        'tipo_tarefa', new.tipo_tarefa,
        'prioridade', new.prioridade,
        'status_antigo', old.status,
        'status_novo', new.status,
        'responsavel_id_antigo', old.responsavel_id,
        'responsavel_id_novo', new.responsavel_id
      ),
      now()
    );
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.tarefas_cs') is not null then
    drop trigger if exists trg_timeline_tarefas_insert on public.tarefas_cs;
    create trigger trg_timeline_tarefas_insert
    after insert on public.tarefas_cs
    for each row
    execute function public.timeline_on_tarefa_insert();

    drop trigger if exists trg_timeline_tarefas_update on public.tarefas_cs;
    create trigger trg_timeline_tarefas_update
    after update of status, responsavel_id, prioridade on public.tarefas_cs
    for each row
    execute function public.timeline_on_tarefa_update();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9) Triggers: Atualização de saldo (programas_cliente)
-- ---------------------------------------------------------------------------

create or replace function public.timeline_on_programa_saldo_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gestor uuid;
  v_equipe uuid;
  v_saldo_old numeric;
  v_saldo_new numeric;
begin
  if new.saldo is not distinct from old.saldo then
    return new;
  end if;

  v_saldo_old := old.saldo;
  v_saldo_new := new.saldo;

  if to_regclass('public.cliente_gestores') is not null and to_regclass('public.perfis_equipe_id_safe') is not null then
    for v_gestor in
      select cg.gestor_id
      from public.cliente_gestores cg
      where cg.cliente_id = new.cliente_id
    loop
      v_equipe := public.perfis_equipe_id_safe(v_gestor);
      perform public.timeline_eventos_push(
        new.cliente_id,
        v_gestor,
        v_equipe,
        'ATUALIZACAO_CONTA',
        'Saldo atualizado',
        'Saldo: ' || coalesce(v_saldo_old, 0)::text || ' → ' || coalesce(v_saldo_new, 0)::text,
        jsonb_build_object(
          'programas_cliente_id', new.id,
          'saldo_antigo', v_saldo_old,
          'saldo_novo', v_saldo_new,
          'updated_at', new.updated_at
        ),
        new.updated_at
      );
    end loop;
  else
    perform public.timeline_eventos_push(
      new.cliente_id,
      null,
      null,
      'ATUALIZACAO_CONTA',
      'Saldo atualizado',
      'Saldo: ' || coalesce(v_saldo_old, 0)::text || ' → ' || coalesce(v_saldo_new, 0)::text,
      jsonb_build_object(
        'programas_cliente_id', new.id,
        'saldo_antigo', v_saldo_old,
        'saldo_novo', v_saldo_new,
        'updated_at', new.updated_at
      ),
      new.updated_at
    );
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.programas_cliente') is not null then
    drop trigger if exists trg_timeline_programas_saldo_update on public.programas_cliente;
    create trigger trg_timeline_programas_saldo_update
    after update of saldo on public.programas_cliente
    for each row
    execute function public.timeline_on_programa_saldo_update();
  end if;
end $$;

