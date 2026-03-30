-- CS Task Engine: converte alertas_sistema em tarefas acionáveis
-- Regras principais (conforme pedido):
-- - Não duplicar tarefas para o mesmo alerta (por alertas_sistema.id)
-- - Criar tarefas automaticamente a partir de alertas_sistema (trigger)
-- - Auto atribuir responsavel_id a um CS da mesma equipe (fallback: auth.uid)
-- - RLS: CS só vê tarefas da sua equipe; ADMIN vê tudo

-- ---------------------------------------------------------------------------
-- 1) Tabela
-- ---------------------------------------------------------------------------

create table if not exists public.tarefas_cs (
  id uuid primary key default gen_random_uuid(),

  -- Link com o alerta que gerou a tarefa
  alerta_id uuid not null references public.alertas_sistema (id) on delete cascade,

  tipo_tarefa text not null check (
    tipo_tarefa in (
      'FOLLOW_UP_CLIENTE',
      'ANALISE_ATENDIMENTO',
      'ANALISE_GESTOR',
      'REATIVACAO_CLIENTE',
      'COBRANCA_GESTOR'
    )
  ),

  cliente_id uuid references auth.users (id) on delete set null,
  gestor_id uuid references auth.users (id) on delete set null,
  equipe_id uuid references public.equipes (id) on delete set null,

  prioridade text not null check (prioridade in ('baixa', 'media', 'alta', 'critica')),

  titulo text not null,
  descricao text not null default '',

  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluida')),

  responsavel_id uuid references auth.users (id) on delete set null,

  data_criacao timestamptz not null default now(),
  data_vencimento timestamptz not null
);

create unique index if not exists tarefas_cs_alerta_unique on public.tarefas_cs (alerta_id);

create index if not exists idx_tarefas_cs_filters
  on public.tarefas_cs (prioridade, status, equipe_id, gestor_id, data_vencimento desc);

-- ---------------------------------------------------------------------------
-- 2) RLS (acesso por equipe / CS)
-- ---------------------------------------------------------------------------

alter table public.tarefas_cs enable row level security;

drop policy if exists tarefas_cs_select on public.tarefas_cs;
create policy tarefas_cs_select on public.tarefas_cs
  for select
  using (
    public.is_legacy_platform_admin()
    or (equipe_id is not null and public.rls_team_admin_matches_equipe(equipe_id))
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or (cliente_id is not null and public.can_cs_view_client(cliente_id))
  );

drop policy if exists tarefas_cs_update on public.tarefas_cs;
create policy tarefas_cs_update on public.tarefas_cs
  for update
  using (
    public.is_legacy_platform_admin()
    or (equipe_id is not null and public.rls_team_admin_matches_equipe(equipe_id))
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or (cliente_id is not null and public.can_cs_view_client(cliente_id))
  )
  with check (
    public.is_legacy_platform_admin()
    or (equipe_id is not null and public.rls_team_admin_matches_equipe(equipe_id))
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or (cliente_id is not null and public.can_cs_view_client(cliente_id))
  );

drop policy if exists tarefas_cs_insert on public.tarefas_cs;
create policy tarefas_cs_insert on public.tarefas_cs
  for insert
  with check (
    public.is_legacy_platform_admin()
    or (equipe_id is not null and public.rls_team_admin_matches_equipe(equipe_id))
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or (cliente_id is not null and public.can_cs_view_client(cliente_id))
  );

-- ---------------------------------------------------------------------------
-- 3) Função: criar uma tarefa a partir de um alerta (trigger)
-- ---------------------------------------------------------------------------

create or replace function public.tarefas_cs_create_from_alerta(p_alerta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a alertas_sistema%rowtype;

  v_tipo text;
  v_prioridade text;
  v_titulo text;
  v_intervalo interval;

  v_equipe uuid;
  v_responsavel uuid;
begin
  select *
  into a
  from public.alertas_sistema
  where id = p_alerta_id;

  if not found then
    return;
  end if;

  -- Só cria tarefas para alertas ativos
  if a.status <> 'ativo' then
    return;
  end if;

  -- Mapeamento (conforme pedido)
  v_tipo := null;
  v_prioridade := null;
  v_titulo := null;
  v_intervalo := null;

  if a.tipo_alerta = 'NPS_LOW' then
    v_tipo := 'FOLLOW_UP_CLIENTE';
    v_prioridade := 'critica';
    v_titulo := 'Cliente insatisfeito - contato necessário';
    v_intervalo := interval '48 hours';
  elsif a.tipo_alerta = 'CSAT_LOW' then
    v_tipo := 'ANALISE_ATENDIMENTO';
    v_prioridade := 'alta';
    v_titulo := 'Analisar atendimento do cliente';
    v_intervalo := interval '72 hours';
  elsif a.tipo_alerta = 'GESTOR_SCORE_DROP' then
    v_tipo := 'ANALISE_GESTOR';
    v_prioridade := 'alta';
    v_titulo := 'Analisar performance do gestor';
    v_intervalo := interval '72 hours';
  elsif a.tipo_alerta = 'CLIENT_INACTIVITY' then
    v_tipo := 'REATIVACAO_CLIENTE';
    v_prioridade := 'media';
    v_titulo := 'Reativar cliente sem atividade';
    v_intervalo := interval '120 hours';
  elsif a.tipo_alerta = 'DEMANDA_ATRASADA' then
    v_tipo := 'COBRANCA_GESTOR';
    v_prioridade := 'alta';
    v_titulo := 'Cobrança com o gestor por demanda atrasada';
    v_intervalo := interval '72 hours';
  else
    -- outros tipos de alerta não geram tarefa por enquanto
    return;
  end if;

  v_equipe := a.equipe_id;
  if v_equipe is null and a.gestor_id is not null then
    v_equipe := public.perfis_equipe_id_safe(a.gestor_id);
  end if;

  -- Responsável:
  -- 1) preferir um CS vinculado à equipe (equipe_cs)
  -- 2) fallback: usuário atual (se for cs/admin)
  v_responsavel := null;
  if v_equipe is not null and to_regclass('public.equipe_cs') is not null then
    select ec.cs_id
    into v_responsavel
    from public.equipe_cs ec
    where ec.equipe_id = v_equipe
    order by ec.cs_id
    limit 1;
  end if;

  if v_responsavel is null then
    select p.usuario_id
    into v_responsavel
    from public.perfis p
    where p.usuario_id = auth.uid()
      and p.role in ('cs', 'admin')
    limit 1;
  end if;

  insert into public.tarefas_cs (
    alerta_id,
    tipo_tarefa,
    cliente_id,
    gestor_id,
    equipe_id,
    prioridade,
    titulo,
    descricao,
    status,
    responsavel_id,
    data_vencimento
  )
  values (
    a.id,
    v_tipo,
    a.cliente_id,
    a.gestor_id,
    v_equipe,
    v_prioridade,
    v_titulo,
    a.mensagem,
    'pendente'::text,
    v_responsavel,
    now() + v_intervalo
  )
  on conflict (alerta_id) do nothing;
end;
$$;

grant execute on function public.tarefas_cs_create_from_alerta(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Trigger: ao criar/ativar alerta, cria tarefa correspondente
-- ---------------------------------------------------------------------------

-- Wrapper do trigger: o CREATE TRIGGER não pode passar NEW.id como argumento
-- diretamente. Usamos uma função sem parâmetros que chama a função principal
-- com NEW.id.
create or replace function public.tarefas_cs_create_from_alerta_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.tarefas_cs_create_from_alerta(new.id);
  return new;
end;
$$;

drop trigger if exists trg_tarefas_cs_from_alertas_insert on public.alertas_sistema;
create trigger trg_tarefas_cs_from_alertas_insert
after insert on public.alertas_sistema
for each row
when (new.status = 'ativo')
execute function public.tarefas_cs_create_from_alerta_trigger();

drop trigger if exists trg_tarefas_cs_from_alertas_update on public.alertas_sistema;
create trigger trg_tarefas_cs_from_alertas_update
after update of status, tipo_alerta on public.alertas_sistema
for each row
when (new.status = 'ativo')
execute function public.tarefas_cs_create_from_alerta_trigger();

-- ---------------------------------------------------------------------------
-- 5) Backfill (caso existam alertas ativos antes da feature)
-- ---------------------------------------------------------------------------

create or replace function public.tarefas_cs_sync_from_alertas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  r record;
begin
  if not exists (
    select 1 from public.perfis p
    where p.usuario_id = auth.uid()
      and p.role in ('admin', 'cs')
  ) then
    raise exception 'tarefas_cs: apenas admin ou cs podem sincronizar.';
  end if;

  for r in
    select id
    from public.alertas_sistema
    where status = 'ativo'
      and tipo_alerta in ('NPS_LOW', 'CSAT_LOW', 'GESTOR_SCORE_DROP', 'CLIENT_INACTIVITY', 'DEMANDA_ATRASADA')
  loop
    perform public.tarefas_cs_create_from_alerta(r.id);
    n := n + 1;
  end loop;

  return n;
end;
$$;

grant execute on function public.tarefas_cs_sync_from_alertas() to authenticated;

