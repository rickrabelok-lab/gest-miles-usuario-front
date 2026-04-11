-- Fluxo e-mail (Brevo) + convites cliente_gestão + reset senha custom + dedupe organização
-- Aplicar no Supabase (SQL Editor ou CLI). Service role usado só no backend/Edge.

-- 1) Organizações (dedupe: um CNPJ = uma conta organizacional)
create table if not exists public.organizacoes_cliente (
  id uuid primary key default gen_random_uuid(),
  cnpj text not null,
  nome_fantasia text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint organizacoes_cliente_cnpj_chk check (length(trim(cnpj)) >= 8)
);

create unique index if not exists organizacoes_cliente_cnpj_norm_uidx
  on public.organizacoes_cliente (regexp_replace(cnpj, '[^0-9]', '', 'g'));

alter table if exists public.perfis
  add column if not exists organizacao_id uuid references public.organizacoes_cliente (id) on delete set null;

create index if not exists idx_perfis_organizacao_id on public.perfis (organizacao_id);

-- 2) Tokens de recuperação de senha (hash apenas; nunca guardar token em claro)
create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (token_hash)
);

create index if not exists idx_password_reset_tokens_user_id on public.password_reset_tokens (user_id);
create index if not exists idx_password_reset_tokens_expires on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;

-- Sem políticas para anon/authenticated: só service role (backend/Edge)
drop policy if exists password_reset_tokens_service on public.password_reset_tokens;

-- 3) Convites para cliente_gestão
create table if not exists public.convites_cliente_gestao (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  equipe_id uuid,
  invited_by uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_convites_email on public.convites_cliente_gestao (lower(email));
create index if not exists idx_convites_expires on public.convites_cliente_gestao (expires_at);

alter table public.convites_cliente_gestao enable row level security;

-- 4) Flag opcional para não reenviar e-mail de boas-vindas
alter table if exists public.perfis
  add column if not exists email_boas_vindas_enviado_at timestamptz;

comment on table public.organizacoes_cliente is 'Dedupe cadastro: CNPJ normalizado único.';
comment on table public.password_reset_tokens is 'Reset senha custom; token só em hash.';
comment on table public.convites_cliente_gestao is 'Convite gestor → futuro cliente_gestão por e-mail.';

-- Helper só para service role / backend: resolver auth.users por e-mail (reset de senha)
create or replace function public.get_user_id_by_email_for_service(p_email text)
returns uuid
language sql
stable
security definer
set search_path = auth, public
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
$$;

revoke all on function public.get_user_id_by_email_for_service(text) from public;
grant execute on function public.get_user_id_by_email_for_service(text) to service_role;
