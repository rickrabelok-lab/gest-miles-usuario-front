-- Credenciais de programas de milhas por cliente.
--
-- Objetivo:
-- - manter acesso facil para gestores/CS/admin via API do backend;
-- - remover login/senha do jsonb generico `perfis.configuracao_tema` no futuro;
-- - bloquear leitura direta pelo client Supabase;
-- - exigir service role/backend para descriptografar, auditar e entregar segredo.
--
-- IMPORTANTE: esta migration cria a estrutura segura, mas nao migra dados ainda.
-- A migracao dos dados atuais deve acontecer depois que a API de criptografia/decriptografia
-- estiver pronta e testada.

create extension if not exists pgcrypto;

create table if not exists public.cliente_programa_acessos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id) on delete cascade,
  programa text not null,
  login_ciphertext text not null,
  senha_ciphertext text not null,
  observacoes_ciphertext text,
  acesso_status text not null default 'active' check (acesso_status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cliente_programa_acessos_cliente_id
  on public.cliente_programa_acessos(cliente_id);

create index if not exists idx_cliente_programa_acessos_status
  on public.cliente_programa_acessos(acesso_status);

comment on table public.cliente_programa_acessos is
  'Credenciais criptografadas de programas/companhias por cliente. Acesso direto por Supabase client deve ficar bloqueado; usar backend service role com auditoria.';

comment on column public.cliente_programa_acessos.login_ciphertext is
  'Login criptografado pelo backend. Nunca armazenar plaintext aqui.';

comment on column public.cliente_programa_acessos.senha_ciphertext is
  'Senha criptografada pelo backend. Nunca armazenar plaintext aqui.';

create table if not exists public.cliente_programa_acesso_audit_logs (
  id uuid primary key default gen_random_uuid(),
  acesso_id uuid references public.cliente_programa_acessos(id) on delete set null,
  cliente_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('list', 'view_secret', 'create', 'update', 'archive', 'delete')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cliente_programa_acesso_audit_cliente_id
  on public.cliente_programa_acesso_audit_logs(cliente_id, created_at desc);

create index if not exists idx_cliente_programa_acesso_audit_actor_id
  on public.cliente_programa_acesso_audit_logs(actor_id, created_at desc);

alter table public.cliente_programa_acessos enable row level security;
alter table public.cliente_programa_acesso_audit_logs enable row level security;

-- Sem policies de SELECT/INSERT/UPDATE/DELETE para authenticated de proposito.
-- O app deve usar backend/edge function com service role para:
-- 1. validar permissao com can_view_perfil/can_manage_client/equipe;
-- 2. criptografar/descriptografar com chave fora do browser;
-- 3. registrar audit log sempre que segredo for exibido.

revoke all on public.cliente_programa_acessos from anon;
revoke all on public.cliente_programa_acessos from authenticated;
revoke all on public.cliente_programa_acesso_audit_logs from anon;
revoke all on public.cliente_programa_acesso_audit_logs from authenticated;

grant select, insert, update, delete on public.cliente_programa_acessos to service_role;
grant select, insert, update, delete on public.cliente_programa_acesso_audit_logs to service_role;
