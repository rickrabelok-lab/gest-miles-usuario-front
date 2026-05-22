-- =============================================================================
-- Migration: credenciais_programa_cliente
-- Credenciais de programas de milhas por cliente — senha criptografada (pgcrypto)
-- =============================================================================

begin;

-- ── 1. Tabela de secrets (inacessível para authenticated/anon) ────────────────

create table if not exists public._app_secrets (
  key   text primary key,
  value text not null
);

revoke all on public._app_secrets from public;
revoke all on public._app_secrets from anon;
revoke all on public._app_secrets from authenticated;
alter table public._app_secrets enable row level security;

-- ATENÇÃO: substitua a chave abaixo por uma string aleatória longa antes de rodar.
-- Após inserir, anote a chave em local seguro — sem ela os dados não podem ser decriptados.
-- A chave real NÃO deve entrar em migration/git. Configure fora do repo antes de usar:
-- insert into public._app_secrets(key, value)
-- values ('credenciais_key', '<chave-aleatoria-longa>')
-- on conflict (key) do update set value = excluded.value;

-- ── 2. Tabela principal ───────────────────────────────────────────────────────

create table if not exists public.credenciais_programa_cliente (
  id             uuid        primary key default gen_random_uuid(),
  cliente_id     uuid        not null references auth.users(id) on delete cascade,
  programa       text        not null,
  login          text        not null default '',
  senha_enc      text        not null default '',
  criado_por     uuid        references auth.users(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists idx_cred_programa_cliente_id
  on public.credenciais_programa_cliente(cliente_id);

alter table public.credenciais_programa_cliente enable row level security;

-- ── 3. Tabela de auditoria ────────────────────────────────────────────────────

create table if not exists public.credenciais_auditoria (
  id             uuid        primary key default gen_random_uuid(),
  credencial_id  uuid        references public.credenciais_programa_cliente(id) on delete set null,
  gestor_id      uuid        not null,
  cliente_id     uuid        not null,
  programa       text        not null,
  acao           text        not null check (acao in ('revelou', 'copiou')),
  criado_em      timestamptz not null default now()
);

alter table public.credenciais_auditoria enable row level security;

-- ── 4. RLS: credenciais_programa_cliente ─────────────────────────────────────

drop policy if exists "cred_select_can_manage" on public.credenciais_programa_cliente;
create policy "cred_select_can_manage"
  on public.credenciais_programa_cliente for select
  using (public.can_manage_client(cliente_id));

drop policy if exists "cred_insert_can_manage" on public.credenciais_programa_cliente;
create policy "cred_insert_can_manage"
  on public.credenciais_programa_cliente for insert
  with check (public.can_manage_client(cliente_id));

drop policy if exists "cred_update_can_manage" on public.credenciais_programa_cliente;
create policy "cred_update_can_manage"
  on public.credenciais_programa_cliente for update
  using (public.can_manage_client(cliente_id));

drop policy if exists "cred_delete_can_manage" on public.credenciais_programa_cliente;
create policy "cred_delete_can_manage"
  on public.credenciais_programa_cliente for delete
  using (public.can_manage_client(cliente_id));

-- ── 5. RLS: credenciais_auditoria ────────────────────────────────────────────

drop policy if exists "audit_cred_select_admin" on public.credenciais_auditoria;
create policy "audit_cred_select_admin"
  on public.credenciais_auditoria for select
  using (
    exists (
      select 1 from public.perfis
      where usuario_id = auth.uid()
        and role in ('admin', 'master', 'admin_master', 'admin_geral')
    )
  );

-- ── 6. Funções auxiliares de criptografia ────────────────────────────────────
-- Não conceder execute para 'authenticated': só chamadas internas SECURITY DEFINER.

create or replace function public.encrypt_credencial(plain text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_key text;
begin
  select value into v_key from public._app_secrets where key = 'credenciais_key';
  if v_key is null then
    raise exception 'Chave de criptografia não configurada em _app_secrets';
  end if;
  return encode(pgp_sym_encrypt(coalesce(plain, ''), v_key)::bytea, 'base64');
end;
$$;

create or replace function public.decrypt_credencial(enc text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_key text;
begin
  select value into v_key from public._app_secrets where key = 'credenciais_key';
  if v_key is null then
    raise exception 'Chave de criptografia não configurada em _app_secrets';
  end if;
  return pgp_sym_decrypt(decode(enc, 'base64')::bytea, v_key);
end;
$$;

-- ── 7. RPC: revelar senha (validação + decrypt + auditoria) ──────────────────

create or replace function public.reveal_credencial_programa(
  p_credencial_id uuid,
  p_acao          text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_row public.credenciais_programa_cliente%rowtype;
begin
  select * into v_row
  from public.credenciais_programa_cliente
  where id = p_credencial_id;

  if not found then
    raise exception 'Credencial não encontrada';
  end if;

  if not public.can_manage_client(v_row.cliente_id) then
    raise exception 'Acesso negado';
  end if;

  insert into public.credenciais_auditoria
    (credencial_id, gestor_id, cliente_id, programa, acao)
  values (
    p_credencial_id,
    auth.uid(),
    v_row.cliente_id,
    v_row.programa,
    case when p_acao in ('revelou', 'copiou') then p_acao else 'revelou' end
  );

  return public.decrypt_credencial(v_row.senha_enc);
end;
$$;

grant execute on function public.reveal_credencial_programa to authenticated;

-- ── 8. RPC: criar ou atualizar credencial ────────────────────────────────────

create or replace function public.upsert_credencial_programa(
  p_id          uuid,
  p_cliente_id  uuid,
  p_programa    text,
  p_login       text,
  p_senha       text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_id uuid;
begin
  if not public.can_manage_client(p_cliente_id) then
    raise exception 'Acesso negado';
  end if;

  if p_id is null then
    insert into public.credenciais_programa_cliente
      (cliente_id, programa, login, senha_enc, criado_por)
    values (
      p_cliente_id,
      p_programa,
      coalesce(p_login, ''),
      public.encrypt_credencial(coalesce(p_senha, '')),
      auth.uid()
    )
    returning id into v_id;
  else
    update public.credenciais_programa_cliente
    set
      programa      = p_programa,
      login         = coalesce(p_login, login),
      senha_enc     = case
                        when p_senha is not null and p_senha <> ''
                        then public.encrypt_credencial(p_senha)
                        else senha_enc
                      end,
      atualizado_em = now()
    where id = p_id
      and cliente_id = p_cliente_id;

    if not found then
      raise exception 'Credencial não encontrada ou sem permissão';
    end if;
    v_id := p_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.upsert_credencial_programa to authenticated;

-- ── 9. Migration de dados existentes (JSONB → tabela) ────────────────────────

insert into public.credenciais_programa_cliente
  (id, cliente_id, programa, login, senha_enc, criado_por, criado_em)
select
  case
    when (acesso->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (acesso->>'id')::uuid
    else gen_random_uuid()
  end,
  p.usuario_id,
  coalesce(nullif(trim(acesso->>'programa'), ''), 'Desconhecido'),
  coalesce(acesso->>'login', ''),
  public.encrypt_credencial(coalesce(acesso->>'senha', '')),
  p.usuario_id,
  now()
from public.perfis p,
     jsonb_array_elements(
       coalesce(p.configuracao_tema->'clientePerfil'->'acessos', '[]'::jsonb)
     ) as acesso
where jsonb_array_length(
        coalesce(p.configuracao_tema->'clientePerfil'->'acessos', '[]'::jsonb)
      ) > 0
on conflict (id) do nothing;

-- Após verificar a migration, execute manualmente para limpar senhas do JSONB:
--
-- UPDATE public.perfis
-- SET configuracao_tema = jsonb_set(
--   configuracao_tema,
--   '{clientePerfil,acessos}',
--   '[]'::jsonb
-- )
-- WHERE configuracao_tema->'clientePerfil'->'acessos' IS NOT NULL
--   AND jsonb_array_length(
--         coalesce(configuracao_tema->'clientePerfil'->'acessos', '[]'::jsonb)
--       ) > 0;

commit;
