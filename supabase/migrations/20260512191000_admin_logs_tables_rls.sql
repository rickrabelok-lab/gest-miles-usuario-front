-- Versiona criacao e RLS dos logs administrativos usados pelo admin-app.
-- Origem: apps/admin-app/sql/logs_acoes.sql, logs_erros.sql e patch-logs-acoes-rls-admin-master.sql.
-- Ajuste: roles atuais aceitas sao admin_master ou admin global sem equipe_id; admin_geral nao acessa logs_erros.

create extension if not exists "pgcrypto" with schema extensions;

create or replace function public.is_admin_global_or_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfis p
    where p.usuario_id = auth.uid()
      and (
        lower(trim(coalesce(p.role, ''))) = 'admin_master'
        or (
          lower(trim(coalesce(p.role, ''))) = 'admin'
          and (p.equipe_id is null or trim(p.equipe_id::text) = '')
        )
      )
  );
$$;

create table if not exists public.logs_acoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  tipo_acao text not null,
  entidade_afetada text not null,
  entidade_id text not null,
  details jsonb null,
  created_at timestamptz not null default now()
);

alter table public.logs_acoes
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid null references auth.users(id) on delete set null,
  add column if not exists tipo_acao text null,
  add column if not exists entidade_afetada text null,
  add column if not exists entidade_id text null,
  add column if not exists details jsonb null,
  add column if not exists created_at timestamptz null default now();

create index if not exists idx_logs_acoes_created_at on public.logs_acoes(created_at desc);
create index if not exists idx_logs_acoes_tipo_acao on public.logs_acoes(tipo_acao);
create index if not exists idx_logs_acoes_entidade on public.logs_acoes(entidade_afetada, entidade_id);
create index if not exists idx_logs_acoes_user_id_created_at on public.logs_acoes(user_id, created_at desc);

alter table public.logs_acoes enable row level security;

drop policy if exists logs_acoes_select_self_or_admin on public.logs_acoes;
create policy logs_acoes_select_self_or_admin
on public.logs_acoes
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_global_or_master()
);

drop policy if exists logs_acoes_insert_self_or_admin on public.logs_acoes;
create policy logs_acoes_insert_self_or_admin
on public.logs_acoes
for insert
to authenticated
with check (
  user_id = auth.uid()
  or public.is_admin_global_or_master()
);

create table if not exists public.logs_erros (
  id uuid primary key default gen_random_uuid(),
  mensagem text not null,
  stack text null,
  origem text not null check (origem in ('frontend', 'backend', 'api')),
  created_at timestamptz not null default now()
);

alter table public.logs_erros
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists mensagem text null,
  add column if not exists stack text null,
  add column if not exists origem text null,
  add column if not exists created_at timestamptz null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.logs_erros'::regclass
      and conname = 'logs_erros_origem_check'
  ) then
    alter table public.logs_erros
      add constraint logs_erros_origem_check
      check (origem in ('frontend', 'backend', 'api')) not valid;
  end if;
end;
$$;

create index if not exists idx_logs_erros_created_at on public.logs_erros(created_at desc);
create index if not exists idx_logs_erros_origem on public.logs_erros(origem);

alter table public.logs_erros enable row level security;

drop policy if exists logs_erros_admin_select on public.logs_erros;
create policy logs_erros_admin_select
on public.logs_erros
for select
to authenticated
using (public.is_admin_global_or_master());

drop policy if exists logs_erros_admin_insert on public.logs_erros;
create policy logs_erros_admin_insert
on public.logs_erros
for insert
to authenticated
with check (public.is_admin_global_or_master());

-- Garante ausencia de policies UPDATE/DELETE nestas tabelas, mesmo se algum patch solto tiver criado uma.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('logs_acoes', 'logs_erros')
      and cmd in ('UPDATE', 'DELETE')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

-- Remove policies antigas fora do modelo versionado aprovado.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('logs_acoes', 'logs_erros')
      and not (
        (tablename = 'logs_acoes' and policyname in ('logs_acoes_select_self_or_admin', 'logs_acoes_insert_self_or_admin'))
        or (tablename = 'logs_erros' and policyname in ('logs_erros_admin_select', 'logs_erros_admin_insert'))
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;
