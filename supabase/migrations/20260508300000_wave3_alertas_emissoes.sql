-- Wave 3: alertas_dismissals, colunas estruturadas em emissoes

begin;

-- Tabela para persistir dismissals de alertas por usuário
create table if not exists public.alertas_dismissals (
  usuario_id   uuid not null references auth.users(id) on delete cascade,
  alerta_id    text not null,
  dismissed_at timestamptz not null default now(),
  primary key (usuario_id, alerta_id)
);

alter table public.alertas_dismissals enable row level security;

drop policy if exists "alertas_dismissals_own" on public.alertas_dismissals;
create policy "alertas_dismissals_own"
  on public.alertas_dismissals
  for all
  using (usuario_id = auth.uid());

-- Colunas estruturadas em emissoes
alter table public.emissoes
  add column if not exists rota_descricao text,
  add column if not exists extras_json    jsonb;

commit;
