-- Domínio operacional / financeiro / viagens + métricas de cliente para alertas e CRM.
-- RLS alinhado a cliente_gestores + CS (can_cs_view_client / can_manage_client).

-- ---------------------------------------------------------------------------
-- Emissões: comissão (alerta COMISSAO_PENDENTE)
-- ---------------------------------------------------------------------------

alter table public.emissoes
  add column if not exists comissao_recebida boolean not null default false;

comment on column public.emissoes.comissao_recebida is 'Se a comissão da emissão já foi recebida (financeiro).';

-- ---------------------------------------------------------------------------
-- Cotações comerciais
-- ---------------------------------------------------------------------------

create table if not exists public.cotacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users (id) on delete cascade,
  gestor_id uuid not null references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  responsavel_id uuid references auth.users (id) on delete set null,
  titulo text not null default 'Cotação',
  status text not null default 'pendente'
    check (status in ('rascunho', 'pendente', 'em_andamento', 'enviada', 'aceita', 'recusada', 'fechada', 'cancelada')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cotacoes_cliente on public.cotacoes (cliente_id);
create index if not exists idx_cotacoes_gestor on public.cotacoes (gestor_id);
create index if not exists idx_cotacoes_equipe on public.cotacoes (equipe_id);
create index if not exists idx_cotacoes_status_updated on public.cotacoes (status, updated_at desc);

-- ---------------------------------------------------------------------------
-- Pós-venda (ligado à emissão = venda)
-- ---------------------------------------------------------------------------

create table if not exists public.pos_vendas (
  id uuid primary key default gen_random_uuid(),
  emissao_id uuid not null references public.emissoes (id) on delete cascade,
  cliente_id uuid not null references auth.users (id) on delete cascade,
  gestor_id uuid not null references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  status text not null default 'aberto' check (status in ('aberto', 'em_andamento', 'concluido', 'cancelado')),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (emissao_id)
);

create index if not exists idx_pos_vendas_cliente on public.pos_vendas (cliente_id);
create index if not exists idx_pos_vendas_gestor on public.pos_vendas (gestor_id);

-- ---------------------------------------------------------------------------
-- Viagens (check-in / documentação)
-- ---------------------------------------------------------------------------

create table if not exists public.viagens_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users (id) on delete cascade,
  gestor_id uuid not null references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  status text not null default 'planeada'
    check (status in ('planeada', 'check_in_aberto', 'confirmada', 'concluida', 'cancelada')),
  data_partida date not null,
  data_volta date,
  abertura_checkin timestamptz,
  checkin_confirmado_em timestamptz,
  documentacao_confirmada boolean not null default false,
  destino text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_viagens_cliente on public.viagens_cliente (cliente_id);
create index if not exists idx_viagens_gestor on public.viagens_cliente (gestor_id);
create index if not exists idx_viagens_partida on public.viagens_cliente (data_partida);

-- ---------------------------------------------------------------------------
-- Financeiro: despesas e receitas
-- ---------------------------------------------------------------------------

create table if not exists public.financeiro_despesas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references auth.users (id) on delete cascade,
  gestor_id uuid not null references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  descricao text not null default '',
  valor numeric not null default 0 check (valor >= 0),
  data_vencimento date not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'pago', 'cancelado')),
  resolvido boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fin_despesas_gestor on public.financeiro_despesas (gestor_id);
create index if not exists idx_fin_despesas_cliente on public.financeiro_despesas (cliente_id);
create index if not exists idx_fin_despesas_venc on public.financeiro_despesas (data_vencimento);

create table if not exists public.financeiro_receitas (
  id uuid primary key default gen_random_uuid(),
  emissao_id uuid not null references public.emissoes (id) on delete cascade,
  cliente_id uuid not null references auth.users (id) on delete cascade,
  gestor_id uuid not null references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  valor numeric not null default 0 check (valor >= 0),
  descricao text,
  created_at timestamptz not null default now(),
  unique (emissao_id)
);

create index if not exists idx_fin_receitas_cliente on public.financeiro_receitas (cliente_id);

-- ---------------------------------------------------------------------------
-- Reclamações
-- ---------------------------------------------------------------------------

create table if not exists public.reclamacoes_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users (id) on delete cascade,
  gestor_id uuid not null references auth.users (id) on delete cascade,
  equipe_id uuid references public.equipes (id) on delete set null,
  texto text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_reclamacoes_cliente on public.reclamacoes_cliente (cliente_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Métricas CRM (primeiro contato, etc.)
-- ---------------------------------------------------------------------------

create table if not exists public.cliente_metricas (
  cliente_id uuid primary key references auth.users (id) on delete cascade,
  primeiro_contato_em timestamptz,
  ultima_interacao_em timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.cliente_metricas is 'Métricas denormalizadas por cliente (primeiro contato, interação). Atualizado pelo app ou triggers.';
comment on column public.cliente_metricas.primeiro_contato_em is 'Quando o primeiro contacto comercial foi registado.';

-- ---------------------------------------------------------------------------
-- RLS helpers (mesmo padrão que demandas / alertas)
-- ---------------------------------------------------------------------------

alter table public.cotacoes enable row level security;
alter table public.pos_vendas enable row level security;
alter table public.viagens_cliente enable row level security;
alter table public.financeiro_despesas enable row level security;
alter table public.financeiro_receitas enable row level security;
alter table public.reclamacoes_cliente enable row level security;
alter table public.cliente_metricas enable row level security;

-- cotacoes
drop policy if exists cotacoes_select on public.cotacoes;
create policy cotacoes_select on public.cotacoes
  for select using (
    public.is_legacy_platform_admin()
    or public.rls_team_admin_matches_equipe(equipe_id)
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or public.can_cs_view_client(cliente_id)
    or public.can_manage_client(cliente_id)
  );

drop policy if exists cotacoes_write_gestor on public.cotacoes;
create policy cotacoes_write_gestor on public.cotacoes
  for insert with check (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_manage_client(cliente_id)
  );

drop policy if exists cotacoes_update on public.cotacoes;
create policy cotacoes_update on public.cotacoes
  for update using (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_manage_client(cliente_id)
    or (public.cs_can_access_gestor(gestor_id) and public.can_cs_view_client(cliente_id))
  )
  with check (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_manage_client(cliente_id)
    or (public.cs_can_access_gestor(gestor_id) and public.can_cs_view_client(cliente_id))
  );

-- pos_vendas
drop policy if exists pos_vendas_select on public.pos_vendas;
create policy pos_vendas_select on public.pos_vendas
  for select using (
    public.is_legacy_platform_admin()
    or public.rls_team_admin_matches_equipe(equipe_id)
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or public.can_cs_view_client(cliente_id)
    or public.can_manage_client(cliente_id)
  );

drop policy if exists pos_vendas_write on public.pos_vendas;
create policy pos_vendas_write on public.pos_vendas
  for all using (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_manage_client(cliente_id)
  )
  with check (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_manage_client(cliente_id)
  );

-- viagens_cliente
drop policy if exists viagens_cliente_select on public.viagens_cliente;
create policy viagens_cliente_select on public.viagens_cliente
  for select using (
    public.is_legacy_platform_admin()
    or public.rls_team_admin_matches_equipe(equipe_id)
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or public.can_cs_view_client(cliente_id)
    or public.can_manage_client(cliente_id)
  );

drop policy if exists viagens_cliente_write on public.viagens_cliente;
create policy viagens_cliente_write on public.viagens_cliente
  for all using (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_manage_client(cliente_id)
  )
  with check (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_manage_client(cliente_id)
  );

-- financeiro_despesas
drop policy if exists financeiro_despesas_select on public.financeiro_despesas;
create policy financeiro_despesas_select on public.financeiro_despesas
  for select using (
    public.is_legacy_platform_admin()
    or public.rls_team_admin_matches_equipe(equipe_id)
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or (cliente_id is not null and public.can_cs_view_client(cliente_id))
    or (cliente_id is not null and public.can_manage_client(cliente_id))
    or (cliente_id is null and public.cs_can_access_gestor(gestor_id))
  );

drop policy if exists financeiro_despesas_write on public.financeiro_despesas;
create policy financeiro_despesas_write on public.financeiro_despesas
  for all using (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or (cliente_id is not null and public.can_manage_client(cliente_id))
  )
  with check (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or (cliente_id is not null and public.can_manage_client(cliente_id))
  );

-- financeiro_receitas
drop policy if exists financeiro_receitas_select on public.financeiro_receitas;
create policy financeiro_receitas_select on public.financeiro_receitas
  for select using (
    public.is_legacy_platform_admin()
    or public.rls_team_admin_matches_equipe(equipe_id)
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or public.can_cs_view_client(cliente_id)
    or public.can_manage_client(cliente_id)
  );

drop policy if exists financeiro_receitas_write on public.financeiro_receitas;
create policy financeiro_receitas_write on public.financeiro_receitas
  for all using (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_manage_client(cliente_id)
  )
  with check (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_manage_client(cliente_id)
  );

-- reclamacoes_cliente
drop policy if exists reclamacoes_select on public.reclamacoes_cliente;
create policy reclamacoes_select on public.reclamacoes_cliente
  for select using (
    public.is_legacy_platform_admin()
    or public.rls_team_admin_matches_equipe(equipe_id)
    or (gestor_id is not null and public.cs_can_access_gestor(gestor_id))
    or public.can_cs_view_client(cliente_id)
    or public.can_manage_client(cliente_id)
  );

drop policy if exists reclamacoes_write on public.reclamacoes_cliente;
create policy reclamacoes_write on public.reclamacoes_cliente
  for all using (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_manage_client(cliente_id)
  )
  with check (
    public.is_legacy_platform_admin()
    or gestor_id = auth.uid()
    or public.can_manage_client(cliente_id)
  );

-- cliente_metricas
drop policy if exists cliente_metricas_select on public.cliente_metricas;
create policy cliente_metricas_select on public.cliente_metricas
  for select using (
    public.is_legacy_platform_admin()
    or public.can_cs_view_client(cliente_id)
    or public.can_manage_client(cliente_id)
    or cliente_id = auth.uid()
  );

drop policy if exists cliente_metricas_write on public.cliente_metricas;
create policy cliente_metricas_write on public.cliente_metricas
  for all using (
    public.is_legacy_platform_admin()
    or public.can_manage_client(cliente_id)
    or public.can_cs_view_client(cliente_id)
  )
  with check (
    public.is_legacy_platform_admin()
    or public.can_manage_client(cliente_id)
    or public.can_cs_view_client(cliente_id)
  );

-- updated_at (trigger genérico)
create or replace function public.gm_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cotacoes_updated on public.cotacoes;
create trigger trg_cotacoes_updated
  before update on public.cotacoes
  for each row execute function public.gm_touch_updated_at();

drop trigger if exists trg_pos_vendas_updated on public.pos_vendas;
create trigger trg_pos_vendas_updated
  before update on public.pos_vendas
  for each row execute function public.gm_touch_updated_at();

drop trigger if exists trg_viagens_updated on public.viagens_cliente;
create trigger trg_viagens_updated
  before update on public.viagens_cliente
  for each row execute function public.gm_touch_updated_at();

drop trigger if exists trg_fin_desp_updated on public.financeiro_despesas;
create trigger trg_fin_desp_updated
  before update on public.financeiro_despesas
  for each row execute function public.gm_touch_updated_at();
