-- Phase A: introduce configuracoes RPC access without closing legacy direct table access.
-- Rollout order: apply this only before the app deploy/smoke that moves clients to RPC/refresh-only.
-- Safety: this phase intentionally does not revoke table grants and does not drop/replace existing table policies.
-- Local migration draft only. Do not apply without explicit Rick approval per project_ref.


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

create or replace function public.public_app_config()
returns table (
  chave text,
  valor jsonb,
  versao integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.chave, c.valor, c.versao
  from public.configuracoes c
  where c.chave in (
    'sistema.app_nome',
    'sistema.url_base',
    'sistema.logo_url',
    'sistema.cor_primaria',
    'sistema.cor_secundaria',
    'sistema.cor_accent',
    'sistema.timezone',
    'sistema.locale',
    'sistema.currency',
    'sistema.manutencao',
    'negocio.score',
    'negocio.economia',
    'negocio.limites',
    'negocio.regras_negocio',
    'financeiro.categorias',
    'financeiro.taxas',
    'viagens.status_padrao',
    'viagens.alertas',
    'notificacoes.templates'
  )
  order by c.chave asc;
$$;

revoke execute on function public.public_app_config() from public;
grant execute on function public.public_app_config() to anon, authenticated;

create or replace function public.admin_list_configuracoes()
returns table (
  id uuid,
  chave text,
  valor jsonb,
  descricao text,
  versao integer,
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin_global_or_master() then
    raise exception 'forbidden';
  end if;

  return query
  select c.id, c.chave, c.valor, c.descricao, c.versao, c.updated_at, c.updated_by
  from public.configuracoes c
  order by c.chave asc;
end;
$$;

revoke execute on function public.admin_list_configuracoes() from public, anon;
grant execute on function public.admin_list_configuracoes() to authenticated;

create or replace function public.admin_list_configuracoes_historico(p_limit integer default 120)
returns table (
  id uuid,
  configuracao_id uuid,
  chave text,
  valor_anterior jsonb,
  valor_novo jsonb,
  versao integer,
  alterado_em timestamptz,
  alterado_por uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  safe_limit integer := least(greatest(coalesce(p_limit, 120), 1), 500);
begin
  if not public.is_admin_global_or_master() then
    raise exception 'forbidden';
  end if;

  return query
  select h.id, h.configuracao_id, h.chave, h.valor_anterior, h.valor_novo, h.versao, h.alterado_em, h.alterado_por
  from public.configuracoes_historico h
  order by h.alterado_em desc
  limit safe_limit;
end;
$$;

revoke execute on function public.admin_list_configuracoes_historico(integer) from public, anon;
grant execute on function public.admin_list_configuracoes_historico(integer) to authenticated;

create or replace function public.admin_update_config_public(
  p_chave text,
  p_valor jsonb,
  p_descricao text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  k text := trim(coalesce(p_chave, ''));
begin
  if not public.is_admin_global_or_master() then
    raise exception 'forbidden';
  end if;
  if k = '' then
    raise exception 'empty_config_key';
  end if;

  insert into public.configuracoes (chave, valor, descricao, updated_by, updated_at)
  values (k, p_valor, p_descricao, auth.uid(), now())
  on conflict (chave) do update
    set valor = excluded.valor,
        descricao = excluded.descricao,
        updated_by = auth.uid(),
        updated_at = now();
end;
$$;

revoke execute on function public.admin_update_config_public(text, jsonb, text) from public, anon;
grant execute on function public.admin_update_config_public(text, jsonb, text) to authenticated;

create or replace function public.admin_queue_reprocess(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_global_or_master() then
    raise exception 'forbidden';
  end if;

  update public.fila_processos
  set status = 'pendente',
      tentativas = coalesce(tentativas, 0) + 1,
      updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'queue_process_not_found';
  end if;
end;
$$;

revoke execute on function public.admin_queue_reprocess(uuid) from public, anon;
grant execute on function public.admin_queue_reprocess(uuid) to authenticated;

create or replace function public.admin_cancel_queue_process(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_global_or_master() then
    raise exception 'forbidden';
  end if;

  delete from public.fila_processos
  where id = p_id;

  if not found then
    raise exception 'queue_process_not_found';
  end if;
end;
$$;

revoke execute on function public.admin_cancel_queue_process(uuid) from public, anon;
grant execute on function public.admin_cancel_queue_process(uuid) to authenticated;
