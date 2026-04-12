-- =============================================================================
-- Audit Logs — registo central de ações relevantes na plataforma.
--
-- Escrita: apenas via service role (backend / Edge Functions) ou funções
--          SECURITY DEFINER (triggers). Nenhum role autenticado insere diretamente.
-- Leitura: restrita a admins e, futuramente, filtrada por hierarquia/tenant
--          (refinamento na Prompt 2 / endpoint de API).
-- =============================================================================

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

-- -------------------------------------------------------------------------
-- Comentários nas colunas
-- -------------------------------------------------------------------------
comment on table  public.audit_logs                is 'Registo central de ações auditáveis da plataforma.';
comment on column public.audit_logs.id             is 'PK UUID gerado automaticamente.';
comment on column public.audit_logs.user_id        is 'auth.users(id) responsável pela ação (NULL = sistema/service role).';
comment on column public.audit_logs.acao           is 'Tipo da ação: INSERT, UPDATE, DELETE, LOGIN, CHECKOUT, etc.';
comment on column public.audit_logs.tabela         is 'Tabela ou recurso afetado (ex: perfis, emissoes, subscription_plans).';
comment on column public.audit_logs.antes          is 'Snapshot JSONB do registo antes da alteração (NULL em INSERT).';
comment on column public.audit_logs.depois         is 'Snapshot JSONB do registo após a alteração (NULL em DELETE).';
comment on column public.audit_logs.created_at     is 'Timestamp UTC do evento.';

-- -------------------------------------------------------------------------
-- Índices para listagem, filtragem e paginação
-- -------------------------------------------------------------------------

-- Listagem cronológica (DESC) — a query mais comum no painel de logs.
create index if not exists idx_audit_logs_created_at_desc
  on public.audit_logs (created_at desc);

-- Filtro por utilizador que executou a ação.
create index if not exists idx_audit_logs_user_id
  on public.audit_logs (user_id);

-- Filtro por tabela/recurso afetado.
create index if not exists idx_audit_logs_tabela
  on public.audit_logs (tabela);

-- Composto para listagem filtrada por utilizador + cronologia.
create index if not exists idx_audit_logs_user_created
  on public.audit_logs (user_id, created_at desc);

-- -------------------------------------------------------------------------
-- RLS — políticas mínimas seguras (Prompt 1)
--
-- INSERT: bloqueado para todos os roles normais. O backend insere com
--         service_role key (bypassa RLS) ou via função SECURITY DEFINER.
-- SELECT: apenas admin master (is_legacy_platform_admin) por agora.
--         Refinamento por hierarquia/tenant será feito no Prompt 2 via API
--         + políticas adicionais.
-- UPDATE / DELETE: proibido (logs são imutáveis).
-- -------------------------------------------------------------------------

alter table public.audit_logs enable row level security;

-- Nenhuma política de INSERT → inserts só passam com service_role (bypassa RLS).

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select
  to authenticated
  using ( public.is_legacy_platform_admin() );

-- Sem políticas de UPDATE/DELETE → imutáveis para qualquer role autenticado.

-- -------------------------------------------------------------------------
-- Função utilitária para escrita de logs (SECURITY DEFINER)
--
-- Pode ser chamada por triggers ou pelo backend autenticado.
-- Não depende de RLS porque é SECURITY DEFINER com search_path fixo.
-- -------------------------------------------------------------------------

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

-- Só service role e funções SECURITY DEFINER devem chamar; autenticados
-- recebem permissão de EXECUTE para que triggers (SECURITY DEFINER) que
-- rodam "em nome" do utilizador consigam invocar.
grant execute on function public.audit_log_write(uuid, text, text, jsonb, jsonb)
  to authenticated;

-- -------------------------------------------------------------------------
-- Trigger genérico reutilizável
--
-- Anexar a qualquer tabela para gerar audit log automático em INSERT,
-- UPDATE ou DELETE. Exemplo de uso:
--
--   CREATE TRIGGER trg_audit_perfis
--   AFTER INSERT OR UPDATE OR DELETE ON public.perfis
--   FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
--
-- O trigger captura OLD/NEW como JSONB e regista a ação.
-- -------------------------------------------------------------------------

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
