-- =============================================================================
-- In-App Notifications System (copiar/colar e rodar)
--
-- Supabase -> SQL Editor -> New query -> Cole TUDO deste arquivo -> Run
-- =============================================================================

-- (Conteúdo da migration)

-- =============================================================================

-- In-App Notifications System
-- Notifica o usuário dentro do app sobre alertas/tarefas e eventos (NPS/CSAT baixos).

-- ---------------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------------

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  titulo text not null,
  mensagem text not null,
  tipo text not null check (tipo in ('alerta', 'tarefa', 'sistema')),
  lida boolean not null default false,
  data_criacao timestamptz not null default now()
);

create index if not exists idx_notificacoes_usuario_lida_data
  on public.notificacoes (usuario_id, lida, data_criacao desc);

-- Anti-duplicata: mesmo usuário, mesmo tipo, mesmo título e mesma mensagem.
create unique index if not exists notificacoes_dedup_idx
  on public.notificacoes (usuario_id, tipo, titulo, mensagem);

-- ---------------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------------

alter table public.notificacoes enable row level security;

drop policy if exists notificacoes_select_own on public.notificacoes;
create policy notificacoes_select_own on public.notificacoes
  for select
  using (usuario_id = auth.uid());

drop policy if exists notificacoes_update_own on public.notificacoes;
create policy notificacoes_update_own on public.notificacoes
  for update
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) Helpers (security definer): inserir com anti-duplicata
-- ---------------------------------------------------------------------------

create or replace function public.notificacoes_push(
  p_usuario_id uuid,
  p_tipo text,
  p_titulo text,
  p_mensagem text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_usuario_id is null then
    return;
  end if;

  insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, lida)
  values (p_usuario_id, p_tipo, p_titulo, p_mensagem, false)
  on conflict (usuario_id, tipo, titulo, mensagem) do nothing;
end;
$$;

grant execute on function public.notificacoes_push(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Helper: escolher CS responsável pela equipe
-- ---------------------------------------------------------------------------

create or replace function public.cs_user_for_equipe(p_equipe_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v uuid;
begin
  if p_equipe_id is null then
    return null;
  end if;

  -- Preferir mapeamento explícito CS <-> equipe
  if to_regclass('public.equipe_cs') is not null then
    select ec.cs_id into v
    from public.equipe_cs ec
    where ec.equipe_id = p_equipe_id
    limit 1;
  end if;

  -- Fallback: algum perfil role cs com equipe igual (se existir helper perfis_equipe_id_safe)
  if v is null and to_regclass('public.perfis') is not null then
    begin
      if to_regclass('public.perfis_equipe_id_safe') is not null then
        select p.usuario_id into v
        from public.perfis p
        where p.role = 'cs'
          and public.perfis_equipe_id_safe(p.usuario_id) = p_equipe_id
        limit 1;
      end if;
    exception when others then
      v := null;
    end;
  end if;

  return v;
end;
$$;

grant execute on function public.cs_user_for_equipe(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Triggers
-- ---------------------------------------------------------------------------

-- 5.1) Notificar ao criar novo alerta (status=ativo)
create or replace function public.notificacoes_on_alerta_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
  v_cs uuid;
  v_titulo text;
  v_mensagem text;
begin
  if new.status is distinct from 'ativo' then
    return new;
  end if;

  v_equipe := new.equipe_id;
  if v_equipe is null and new.gestor_id is not null then
    v_equipe := public.perfis_equipe_id_safe(new.gestor_id);
  end if;

  v_cs := public.cs_user_for_equipe(v_equipe);
  if v_cs is null then
    return new;
  end if;

  if new.tipo_alerta = 'NPS_LOW' then
    v_titulo := 'NPS baixo - contato necessário';
    v_mensagem := 'tipo_alerta=NPS_LOW; clienteId=' || new.cliente_id::text || '; gestorId=' || new.gestor_id::text || '; alertaKey=NPS_LOW:' || new.cliente_id::text || ':' || new.gestor_id::text;
  elsif new.tipo_alerta = 'CSAT_LOW' then
    v_titulo := 'CSAT baixo - análise necessária';
    v_mensagem := 'tipo_alerta=CSAT_LOW; clienteId=' || new.cliente_id::text || '; gestorId=' || new.gestor_id::text || '; alertaKey=CSAT_LOW:' || new.cliente_id::text || ':' || new.gestor_id::text;
  else
    v_titulo := 'Novo alerta inteligente';
    v_mensagem := 'tipo_alerta=' || new.tipo_alerta || '; clienteId=' || coalesce(new.cliente_id::text,'') || '; gestorId=' || coalesce(new.gestor_id::text,'');
  end if;

  perform public.notificacoes_push(v_cs, 'alerta', v_titulo, v_mensagem);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.alertas_sistema') is not null then
    drop trigger if exists trg_notificacoes_alertas_insert on public.alertas_sistema;
    create trigger trg_notificacoes_alertas_insert
    after insert on public.alertas_sistema
    for each row
    when (new.status = 'ativo')
    execute function public.notificacoes_on_alerta_insert();
  end if;
end $$;

-- 5.2) Notificar ao criar nova tarefa atribuída
create or replace function public.notificacoes_on_tarefa_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo text;
begin
  if new.responsavel_id is null then
    return new;
  end if;

  v_tipo := 'tarefa';

  perform public.notificacoes_push(
    new.responsavel_id,
    v_tipo,
    'Nova tarefa do CS',
    'tarefaId=' || new.id::text || '; tipo_tarefa=' || new.tipo_tarefa || '; prioridade=' || new.prioridade || '; clienteId=' || coalesce(new.cliente_id::text,'') || '; gestorId=' || coalesce(new.gestor_id::text,'')
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.tarefas_cs') is not null then
    drop trigger if exists trg_notificacoes_tarefas_insert on public.tarefas_cs;
    create trigger trg_notificacoes_tarefas_insert
    after insert on public.tarefas_cs
    for each row
    when (new.status in ('pendente','em_andamento'))
    execute function public.notificacoes_on_tarefa_insert();
  end if;
end $$;

-- 5.3) Notificar NPS_LOW diretamente no insert de avaliações
create or replace function public.notificacoes_on_nps_low_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
  v_cs uuid;
begin
  if new.nota::int > 6 then
    return new;
  end if;

  v_equipe := public.perfis_equipe_id_safe(new.gestor_id);
  v_cs := public.cs_user_for_equipe(v_equipe);
  if v_cs is null then
    return new;
  end if;

  perform public.notificacoes_push(
    v_cs,
    'alerta',
    'NPS baixo - contato necessário',
    'tipo_alerta=NPS_LOW; clienteId=' || new.cliente_id::text || '; gestorId=' || new.gestor_id::text || '; alertaKey=NPS_LOW:' || new.cliente_id::text || ':' || new.gestor_id::text
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.nps_avaliacoes') is not null then
    drop trigger if exists trg_notificacoes_nps_low on public.nps_avaliacoes;
    create trigger trg_notificacoes_nps_low
    after insert on public.nps_avaliacoes
    for each row
    when (new.nota <= 6)
    execute function public.notificacoes_on_nps_low_insert();
  end if;
end $$;

-- 5.4) Notificar CSAT_LOW diretamente no insert de avaliações
create or replace function public.notificacoes_on_csat_low_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_equipe uuid;
  v_cs uuid;
begin
  if new.nota::int > 2 then
    return new;
  end if;

  v_equipe := public.perfis_equipe_id_safe(new.gestor_id);
  v_cs := public.cs_user_for_equipe(v_equipe);
  if v_cs is null then
    return new;
  end if;

  perform public.notificacoes_push(
    v_cs,
    'alerta',
    'CSAT baixo - análise necessária',
    'tipo_alerta=CSAT_LOW; clienteId=' || new.cliente_id::text || '; gestorId=' || new.gestor_id::text || '; alertaKey=CSAT_LOW:' || new.cliente_id::text || ':' || new.gestor_id::text
  );

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.csat_avaliacoes') is not null then
    drop trigger if exists trg_notificacoes_csat_low on public.csat_avaliacoes;
    create trigger trg_notificacoes_csat_low
    after insert on public.csat_avaliacoes
    for each row
    when (new.nota <= 2)
    execute function public.notificacoes_on_csat_low_insert();
  end if;
end $$;

