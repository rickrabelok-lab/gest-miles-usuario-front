-- =============================================================================
-- Fase 1 — Fonte canônica de "cliente ativo/inativo" em perfis.cliente_status.
--
-- Motivação: hoje "ativo" é decidido em N lugares com regras diferentes
-- (front lê contratos_cliente; snapshot dupla_scores aplica outra; equipe_clientes.ativo
-- nunca é usado). RLS em contratos_cliente bloqueia gestor de ler contratos, fazendo
-- o KPI da carteira do gestor mostrar 100% ativos sempre.
--
-- Esta migration cria UM ÚNICO local autoritativo:
--   perfis.cliente_status text in ('ativo','inativo')
-- Atualizado por trigger sempre que contratos_cliente ou perfis.subscription_status
-- mudam.
--
-- Regras (decididas com o produto em 2026-04-30):
--   contrato.status_cliente = 'ativo'    → ATIVO
--   contrato.status_cliente = 'inativo'  → INATIVO
--   contrato.status_cliente = 'pendente' OU sem contrato:
--       if perfis.subscription_status in ('active','trialing') → ATIVO
--       else (incluindo NULL enquanto Stripe não está ativo)   → ATIVO por padrão
--
-- Nota: enquanto Stripe não está rodando, todo "pendente"/"sem contrato" cai como
-- ATIVO por default. Quando Stripe estiver sincronizado, o trigger passa a refletir
-- automaticamente cancelamentos.
-- =============================================================================

-- 1) Coluna canônica
alter table public.perfis
  add column if not exists cliente_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'perfis_cliente_status_check'
      and conrelid = 'public.perfis'::regclass
  ) then
    alter table public.perfis
      add constraint perfis_cliente_status_check
      check (cliente_status is null or cliente_status in ('ativo','inativo'));
  end if;
end $$;

create index if not exists idx_perfis_cliente_status
  on public.perfis (cliente_status)
  where role = 'cliente_gestao';

comment on column public.perfis.cliente_status is
  'Fonte canônica de ATIVO/INATIVO para clientes de gestão. Atualizada por trigger a partir de contratos_cliente.status_cliente e perfis.subscription_status. Regras: contrato ativo→ativo; contrato inativo→inativo; pendente/sem contrato + subscription active/trialing→ativo; pendente/sem contrato + sem assinatura/canceled→ativo (default enquanto Stripe não estiver ativo). Veja migration 20260430140000.';

-- 2) Função pura: dado o contrato + subscription, computa o status
create or replace function public.compute_cliente_status(
  p_contrato_status text,
  p_subscription_status text
) returns text
language sql
immutable
as $$
  select case
    when lower(trim(coalesce(p_contrato_status,''))) in ('ativo','active') then 'ativo'
    when lower(trim(coalesce(p_contrato_status,''))) in ('inativo','inactive') then 'inativo'
    -- pendente OU contrato vazio
    else case
      when lower(trim(coalesce(p_subscription_status,''))) in ('active','trialing') then 'ativo'
      -- enquanto Stripe não está em produção, default otimista:
      else 'ativo'
    end
  end;
$$;

comment on function public.compute_cliente_status(text, text) is
  'Aplica a regra canônica de ativo/inativo para um cliente de gestão. Veja migration 20260430140000.';

-- 3) Função: pega último contrato do cliente (por email/nome) e recalcula status
create or replace function public.refresh_cliente_status(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contrato_status text;
  v_sub_status text;
  v_email text;
  v_email_alt1 text;
  v_email_alt2 text;
  v_nome_norm text;
  v_new_status text;
begin
  select
    lower(trim(coalesce(p.email,''))),
    lower(trim(coalesce(p.configuracao_tema->'clientePerfil'->>'emailContato',''))),
    lower(trim(coalesce(p.configuracao_tema->'clientePerfil'->>'email',''))),
    regexp_replace(lower(trim(coalesce(p.nome_completo,''))), '\s+', ' ', 'g'),
    p.subscription_status
  into v_email, v_email_alt1, v_email_alt2, v_nome_norm, v_sub_status
  from public.perfis p
  where p.usuario_id = p_cliente_id;

  -- pega o contrato mais recente que casa por email ou nome normalizado
  select c.status_cliente
  into v_contrato_status
  from public.contratos_cliente c
  where (
    (nullif(lower(trim(coalesce(c.cliente_email,''))),'') is not null
     and lower(trim(c.cliente_email)) in (
       nullif(v_email,''),
       nullif(v_email_alt1,''),
       nullif(v_email_alt2,'')
     ))
    or (
      nullif(v_nome_norm,'') is not null
      and regexp_replace(lower(trim(coalesce(c.cliente_nome,''))),'\s+',' ','g') = v_nome_norm
    )
  )
  order by coalesce(c.updated_at, c.created_at) desc nulls last
  limit 1;

  v_new_status := public.compute_cliente_status(v_contrato_status, v_sub_status);

  update public.perfis
  set cliente_status = v_new_status
  where usuario_id = p_cliente_id
    and (cliente_status is distinct from v_new_status);
end;
$$;

comment on function public.refresh_cliente_status(uuid) is
  'Recalcula perfis.cliente_status para um cliente específico, casando contratos por email/nome.';

-- 4) Trigger em contratos_cliente: ao inserir/atualizar/apagar, refaz o status do cliente
create or replace function public.trg_contratos_refresh_cliente_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_id uuid;
  v_email text;
  v_nome_norm text;
begin
  -- O contrato não tem cliente_id, casa por email/nome com perfis
  v_email := lower(trim(coalesce(coalesce(new.cliente_email, old.cliente_email),'')));
  v_nome_norm := regexp_replace(lower(trim(coalesce(coalesce(new.cliente_nome, old.cliente_nome),''))),'\s+',' ','g');

  for v_cliente_id in
    select p.usuario_id
    from public.perfis p
    where p.role = 'cliente_gestao'
      and (
        (v_email <> '' and (
          lower(trim(coalesce(p.email,''))) = v_email
          or lower(trim(coalesce(p.configuracao_tema->'clientePerfil'->>'emailContato',''))) = v_email
          or lower(trim(coalesce(p.configuracao_tema->'clientePerfil'->>'email',''))) = v_email
        ))
        or (v_nome_norm <> '' and regexp_replace(lower(trim(coalesce(p.nome_completo,''))),'\s+',' ','g') = v_nome_norm)
      )
  loop
    perform public.refresh_cliente_status(v_cliente_id);
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_contratos_refresh_cliente_status on public.contratos_cliente;
create trigger trg_contratos_refresh_cliente_status
after insert or update or delete on public.contratos_cliente
for each row execute function public.trg_contratos_refresh_cliente_status();

-- 5) Trigger em perfis: quando subscription_status muda, recalcula cliente_status
create or replace function public.trg_perfis_subscription_refresh_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'cliente_gestao'
     and (tg_op = 'INSERT'
          or new.subscription_status is distinct from old.subscription_status
          or new.email is distinct from old.email
          or new.nome_completo is distinct from old.nome_completo) then
    perform public.refresh_cliente_status(new.usuario_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_perfis_subscription_refresh_status on public.perfis;
create trigger trg_perfis_subscription_refresh_status
after insert or update on public.perfis
for each row execute function public.trg_perfis_subscription_refresh_status();

-- 6) Backfill inicial: aplicar a todos os cliente_gestao
do $$
declare
  v_id uuid;
begin
  for v_id in select usuario_id from public.perfis where role = 'cliente_gestao'
  loop
    perform public.refresh_cliente_status(v_id);
  end loop;
end $$;

-- 7) Permissões
grant execute on function public.compute_cliente_status(text, text) to authenticated;
grant execute on function public.refresh_cliente_status(uuid) to authenticated;
