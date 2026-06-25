begin;

create table if not exists public.conta_exclusao_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  status text not null default 'pendente' check (status in ('pendente','cancelada','concluida')),
  solicitado_em timestamptz not null default now(),
  agendado_para timestamptz not null,
  cancelado_em timestamptz,
  processado_em timestamptz,
  observacao text
);

create index if not exists conta_exclusao_solicitacoes_status_agendado_idx
  on public.conta_exclusao_solicitacoes (status, agendado_para);

alter table public.conta_exclusao_solicitacoes enable row level security;

-- Self lê a própria solicitação (banner). Admin global também. SEM policy de
-- insert/update/delete p/ authenticated → escrita só via service role (backend).
drop policy if exists conta_exclusao_select_self on public.conta_exclusao_solicitacoes;
create policy conta_exclusao_select_self
  on public.conta_exclusao_solicitacoes
  for select
  to authenticated
  using (usuario_id = (select auth.uid()) or public.is_legacy_platform_admin());

commit;
