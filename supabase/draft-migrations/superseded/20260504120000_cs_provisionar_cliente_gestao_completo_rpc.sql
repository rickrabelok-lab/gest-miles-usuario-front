-- ============================================================================
-- Migration: cs_provisionar_cliente_gestao_completo
-- Data: 2026-05-04
--
-- Problema resolvido:
--   admin_equipe falhava ao cadastrar cliente_gestao porque o INSERT direto
--   em `gestor_clientes` (tabela legada) é bloqueado pelo RLS para esse role.
--   Isso deixava o auth.users criado mas as tabelas relacionais vazias
--   (usuário "órfão"), e a segunda tentativa recebia "e-mail já cadastrado".
--
-- Solução:
--   RPC SECURITY DEFINER que executa todas as inserções de forma atômica
--   em uma única transação Postgres:
--     1. perfis            — insert / on conflict update
--     2. cliente_gestores  — nacional + internacional
--     3. gestor_clientes   — idem (legada; SECURITY DEFINER bypassa RLS)
--     4. equipe_clientes   — nac/intl explícitos
--
--   O caller valida equipe (mesma lógica de cs_import_ensure_perfil_cliente_gestao).
-- ============================================================================

create or replace function public.cs_provisionar_cliente_gestao_completo(
  p_usuario_id         uuid,
  p_equipe_id          uuid,
  p_nome_completo      text,
  p_email              text,
  p_slug               text,
  p_gestor_nacional_id uuid,
  p_gestor_intl_id     uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_caller uuid;
  v_role   text;
begin
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'Sessão inválida.' using errcode = '28000';
  end if;

  -- Valida papel do operador
  select p.role into v_role
    from public.perfis p
   where p.usuario_id = v_caller
   limit 1;

  if coalesce(v_role, '') not in ('cs','admin_equipe','admin','admin_master','admin_geral') then
    raise exception
      'Apenas staff operacional pode provisionar clientes (role atual: %).',
      coalesce(v_role, '(sem perfil)');
  end if;

  -- Valida acesso à equipe (espelha cs_import_ensure_perfil_cliente_gestao)
  if not public.is_legacy_platform_admin() then
    if not (
      -- perfis.equipe_id bate (caminho mais comum quando perfil está bem configurado)
      exists (
        select 1 from public.perfis me
         where me.usuario_id = v_caller
           and me.equipe_id is not null
           and me.equipe_id = p_equipe_id
      )
      -- CS vinculado via equipe_cs
      or exists (
        select 1 from public.equipe_cs ec
         where ec.cs_id = v_caller
           and ec.equipe_id = p_equipe_id
      )
      -- admin_equipe vinculado via equipe_admin
      or (
        to_regclass('public.equipe_admin') is not null
        and exists (
          select 1 from public.equipe_admin ea
           where ea.equipe_id = p_equipe_id
             and coalesce(ea.ativo, true)
             and (   ea.admin_equipe_id_1 = v_caller
                  or ea.admin_equipe_id_2 = v_caller
                  or ea.admin_equipe_id_3 = v_caller)
        )
      )
    ) then
      raise exception
        'Você não tem acesso à equipe %. '
        'Verifique se perfis.equipe_id está preenchido com essa equipe, '
        'ou se há uma linha em equipe_admin / equipe_cs vinculando seu usuário a ela.',
        p_equipe_id;
    end if;
  end if;

  -- ── 1. perfis ─────────────────────────────────────────────────────────────
  -- on conflict: se o perfil já existe (órfão que foi detectado pelo frontend),
  -- completa os campos sem sobrescrever equipe_id já preenchido.
  insert into public.perfis (
    usuario_id, slug, nome_completo, email, role, configuracao_tema, equipe_id
  ) values (
    p_usuario_id,
    p_slug,
    trim(p_nome_completo),
    lower(trim(p_email)),
    'cliente_gestao',
    '{}'::jsonb,
    p_equipe_id
  )
  on conflict (usuario_id) do update set
    nome_completo = excluded.nome_completo,
    email         = excluded.email,
    role          = 'cliente_gestao',
    equipe_id     = coalesce(public.perfis.equipe_id, excluded.equipe_id);

  -- ── 2. cliente_gestores — gestor nacional ─────────────────────────────────
  if p_gestor_nacional_id is not null then
    insert into public.cliente_gestores (cliente_id, gestor_id)
    values (p_usuario_id, p_gestor_nacional_id)
    on conflict (cliente_id, gestor_id) do nothing;
  end if;

  -- ── 3. cliente_gestores — gestor internacional ────────────────────────────
  if p_gestor_intl_id is not null
     and p_gestor_intl_id is distinct from p_gestor_nacional_id then
    insert into public.cliente_gestores (cliente_id, gestor_id)
    values (p_usuario_id, p_gestor_intl_id)
    on conflict (cliente_id, gestor_id) do nothing;
  end if;

  -- ── 4. gestor_clientes (tabela legada) — SECURITY DEFINER bypassa RLS ────
  -- admin_equipe é bloqueado pelo RLS desta tabela via supabase-js direto.
  -- Inserções via exception handler para lidar com constraints variáveis
  -- dependendo do estado das migrations no ambiente remoto.
  if p_gestor_nacional_id is not null then
    begin
      insert into public.gestor_clientes (cliente_id, gestor_id)
      values (p_usuario_id, p_gestor_nacional_id);
    exception when unique_violation then null;
    end;
  end if;

  if p_gestor_intl_id is not null
     and p_gestor_intl_id is distinct from p_gestor_nacional_id then
    begin
      insert into public.gestor_clientes (cliente_id, gestor_id)
      values (p_usuario_id, p_gestor_intl_id);
    exception when unique_violation then null;
    end;
  end if;

  -- ── 5. equipe_clientes — gestor_nacional_id / gestor_internacional_id ─────
  insert into public.equipe_clientes (
    equipe_id, cliente_id, gestor_nacional_id, gestor_internacional_id
  ) values (
    p_equipe_id,
    p_usuario_id,
    p_gestor_nacional_id,
    p_gestor_intl_id
  )
  on conflict (cliente_id) do update set
    equipe_id               = excluded.equipe_id,
    gestor_nacional_id      = excluded.gestor_nacional_id,
    gestor_internacional_id = excluded.gestor_internacional_id;

end;
$$;

comment on function public.cs_provisionar_cliente_gestao_completo(uuid,uuid,text,text,text,uuid,uuid) is
  'Provisiona cliente_gestao de forma atômica: perfis + cliente_gestores + gestor_clientes (legada) + equipe_clientes. '
  'SECURITY DEFINER bypassa RLS do gestor_clientes (bloqueado para admin_equipe via JS direto). '
  'Valida papel do operador e acesso à equipe antes de qualquer insert.';

revoke all on function public.cs_provisionar_cliente_gestao_completo(uuid,uuid,text,text,text,uuid,uuid) from public;
grant execute on function public.cs_provisionar_cliente_gestao_completo(uuid,uuid,text,text,text,uuid,uuid) to authenticated;
