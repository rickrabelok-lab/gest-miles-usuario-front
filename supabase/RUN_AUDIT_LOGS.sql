-- =============================================================================
-- Executar UMA VEZ no Supabase: SQL Editor → New query → colar tudo → Run.
-- Cria public.audit_logs, índices, RLS, audit_log_write, audit_log_trigger e equipe_id.
-- Depois: reiniciar o backend Express e recarregar a aba Logs no manager.
-- =============================================================================

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Parte 1 (equivalente a 20260416120000_audit_logs.sql)
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

create table if not exists public.audit_logs (
  id         uuid          not null default gen_random_uuid(),
  user_id    uuid          null,
  acao       text          not null,
  tabela     text          not null,
  antes      jsonb         null,
  depois     jsonb         null,
  created_at timestamptz   not null default now(),

  constraint audit_logs_pkey primary key (id),
  constraint audit_logs_user_id_fkey foreign key (user_id)
    references auth.users (id) on delete set null
);

comment on table  public.audit_logs                is 'Registo central de ações auditáveis da plataforma.';
comment on column public.audit_logs.id             is 'PK UUID gerado automaticamente.';
comment on column public.audit_logs.user_id        is 'auth.users(id) responsável pela ação (NULL = sistema/service role).';
comment on column public.audit_logs.acao           is 'Tipo da ação: INSERT, UPDATE, DELETE, LOGIN, CHECKOUT, etc.';
comment on column public.audit_logs.tabela         is 'Tabela ou recurso afetado (ex: perfis, emissoes, subscription_plans).';
comment on column public.audit_logs.antes          is 'Snapshot JSONB do registo antes da alteração (NULL em INSERT).';
comment on column public.audit_logs.depois         is 'Snapshot JSONB do registo após a alteração (NULL em DELETE).';
comment on column public.audit_logs.created_at     is 'Timestamp UTC do evento.';

create index if not exists idx_audit_logs_created_at_desc
  on public.audit_logs (created_at desc);

create index if not exists idx_audit_logs_user_id
  on public.audit_logs (user_id);

create index if not exists idx_audit_logs_tabela
  on public.audit_logs (tabela);

create index if not exists idx_audit_logs_user_created
  on public.audit_logs (user_id, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select
  to authenticated
  using ( public.is_legacy_platform_admin() );

create or replace function public.audit_log_write(
  p_user_id  uuid,
  p_acao     text,
  p_tabela   text,
  p_antes    jsonb default null,
  p_depois   jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (user_id, acao, tabela, antes, depois)
  values (p_user_id, p_acao, p_tabela, p_antes, p_depois)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.audit_log_write(uuid, text, text, jsonb, jsonb)
  to authenticated;

create or replace function public.audit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.audit_log_write(
      auth.uid(),
      'DELETE',
      tg_table_name::text,
      to_jsonb(old),
      null
    );
    return old;
  elsif tg_op = 'UPDATE' then
    perform public.audit_log_write(
      auth.uid(),
      'UPDATE',
      tg_table_name::text,
      to_jsonb(old),
      to_jsonb(new)
    );
    return new;
  elsif tg_op = 'INSERT' then
    perform public.audit_log_write(
      auth.uid(),
      'INSERT',
      tg_table_name::text,
      null,
      to_jsonb(new)
    );
    return new;
  end if;

  return null;
end;
$$;

grant execute on function public.audit_log_trigger()
  to authenticated;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- Parte 2 (equivalente a 20260416130000_audit_logs_equipe_id.sql)
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

alter table public.audit_logs
  add column if not exists equipe_id uuid references public.equipes (id) on delete set null;

comment on column public.audit_logs.equipe_id
  is 'Equipe (tenant) do user_id no momento da ação — desnormalizado para filtragem eficiente.';

create index if not exists idx_audit_logs_equipe_id
  on public.audit_logs (equipe_id);

create index if not exists idx_audit_logs_equipe_created
  on public.audit_logs (equipe_id, created_at desc);

create or replace function public.audit_log_write(
  p_user_id  uuid,
  p_acao     text,
  p_tabela   text,
  p_antes    jsonb default null,
  p_depois   jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_equipe uuid;
begin
  if p_user_id is not null then
    select p.equipe_id into v_equipe
    from public.perfis p
    where p.usuario_id = p_user_id
    limit 1;
  end if;

  insert into public.audit_logs (user_id, acao, tabela, antes, depois, equipe_id)
  values (p_user_id, p_acao, p_tabela, p_antes, p_depois, v_equipe)
  returning id into v_id;

  return v_id;
end;
$$;

drop policy if exists audit_logs_select_team_admin on public.audit_logs;
create policy audit_logs_select_team_admin on public.audit_logs
  for select
  to authenticated
  using (
    equipe_id is not null
    and exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role = 'admin'
        and p.equipe_id is not null
        and p.equipe_id = audit_logs.equipe_id
    )
  );
