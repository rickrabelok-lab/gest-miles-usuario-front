-- Fase 4b — RLS canônica em public.perfis (hierarquia funcional + reuniões compartilhadas).
--
-- Hierarquia funcional (para a tabela perfis):
--   admin global (admin_master, admin sem equipe)  -> tudo
--   admin_equipe                                   -> tudo da MESMA equipe (cs, gestor, cliente_gestao)
--   cs                                             -> gestor + cliente_gestao da MESMA equipe
--   gestor                                         -> seus cliente_gestao (cliente_gestores) da MESMA equipe
--   cliente_gestao                                 -> a si mesmo + gestores vinculados a ele (mesma equipe)
--
-- Adicional — reuniões compartilhadas:
--   Qualquer usuário autenticado vê o perfil de quem participa de uma reuniao_onboarding
--   onde ele também participa (criador, cliente convidado ou linha em
--   reunioes_onboarding_participantes).
--
-- Esta migration:
--   1. Cria índices de suporte
--   2. Cria helpers SECURITY DEFINER (can_view_perfil, shares_reuniao_with)
--   3. Substitui as duas policies SELECT públicas por duas restritivas
--   4. Limpa policies UPDATE/INSERT redundantes (sem mudar comportamento)
--   5. Revoga grants de anon em public.perfis

------------------------------------------------------------
-- 1) Índices de suporte
------------------------------------------------------------
create index if not exists idx_reunioes_onboarding_created_by
  on public.reunioes_onboarding(created_by);

-- Acelera lookups laterais por (equipe_id, role) usadas pelas helpers
create index if not exists idx_perfis_equipe_id_role
  on public.perfis(equipe_id, role)
  where equipe_id is not null;

------------------------------------------------------------
-- 2) Helpers
------------------------------------------------------------
-- Compartilho alguma reunião com o target?
create or replace function public.shares_reuniao_with(target_usuario_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.reunioes_onboarding r
    where (
      r.created_by  = auth.uid()
      or r.cliente_id = auth.uid()
      or exists (
        select 1 from public.reunioes_onboarding_participantes p
        where p.reuniao_id = r.id and p.usuario_id = auth.uid()
      )
    )
    and (
      r.created_by  = target_usuario_id
      or r.cliente_id = target_usuario_id
      or exists (
        select 1 from public.reunioes_onboarding_participantes p
        where p.reuniao_id = r.id and p.usuario_id = target_usuario_id
      )
    )
  );
$$;

comment on function public.shares_reuniao_with(uuid) is
  'Retorna true se o usuário corrente compartilha pelo menos uma reuniao_onboarding com o target.';

-- Hierarquia funcional canônica para SELECT em public.perfis
create or replace function public.can_view_perfil(target_usuario_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    -- O próprio usuário
    auth.uid() = target_usuario_id

    -- Admin global (admin_master, ou admin sem equipe)
    or public.is_legacy_platform_admin()

    -- admin_equipe: tudo da mesma equipe
    or exists (
      select 1
      from public.perfis me
      join public.perfis them on them.equipe_id = me.equipe_id
      where me.usuario_id   = auth.uid()
        and me.role         = 'admin_equipe'
        and me.equipe_id    is not null
        and them.usuario_id = target_usuario_id
        and them.equipe_id  is not null
    )

    -- cs: gestor + cliente_gestao da mesma equipe
    or exists (
      select 1
      from public.perfis me
      join public.perfis them on them.equipe_id = me.equipe_id
      where me.usuario_id   = auth.uid()
        and me.role         = 'cs'
        and me.equipe_id    is not null
        and them.usuario_id = target_usuario_id
        and them.equipe_id  is not null
        and them.role in ('gestor','cliente_gestao')
    )

    -- gestor: seus clientes_gestao (cliente_gestores) na mesma equipe
    or exists (
      select 1
      from public.perfis me
      join public.cliente_gestores cg on cg.gestor_id = me.usuario_id
      join public.perfis them on them.usuario_id = cg.cliente_id
      where me.usuario_id  = auth.uid()
        and me.role        = 'gestor'
        and me.equipe_id   is not null
        and them.usuario_id = target_usuario_id
        and them.role      = 'cliente_gestao'
        and them.equipe_id is not null
        and them.equipe_id = me.equipe_id
    )

    -- cliente_gestao: gestores vinculados a ele (cliente_gestores) na mesma equipe
    or exists (
      select 1
      from public.perfis me
      join public.cliente_gestores cg on cg.cliente_id = me.usuario_id
      join public.perfis them on them.usuario_id = cg.gestor_id
      where me.usuario_id  = auth.uid()
        and me.role        = 'cliente_gestao'
        and me.equipe_id   is not null
        and them.usuario_id = target_usuario_id
        and them.role      = 'gestor'
        and them.equipe_id is not null
        and them.equipe_id = me.equipe_id
    ),
    false
  );
$$;

comment on function public.can_view_perfil(uuid) is
  'Hierarquia funcional canônica para SELECT em public.perfis. Não inclui visibilidade via reuniões compartilhadas (essa fica em policy separada).';

------------------------------------------------------------
-- 3) Policies SELECT
------------------------------------------------------------
-- Drop policies SELECT antigas (qual = true)
drop policy if exists "Perfis são públicos para leitura" on public.perfis;
drop policy if exists "perfis_select_public"            on public.perfis;

-- Policy 1: hierarquia funcional
drop policy if exists perfis_select_hierarquia on public.perfis;
create policy perfis_select_hierarquia
  on public.perfis
  for select
  to authenticated
  using ( public.can_view_perfil(usuario_id) );

-- Policy 2: reuniões compartilhadas (todos veem todos nas reuniões em comum)
drop policy if exists perfis_select_via_reuniao on public.perfis;
create policy perfis_select_via_reuniao
  on public.perfis
  for select
  to authenticated
  using ( public.shares_reuniao_with(usuario_id) );

------------------------------------------------------------
-- 4) Limpar policies UPDATE/INSERT redundantes (não muda comportamento)
------------------------------------------------------------
-- UPDATE: a policy "perfis_update_own_or_gestor_or_admin" já cobre
-- "Usuário só atualiza seu perfil" e "perfis_update_own_or_admin".
drop policy if exists "Usuário só atualiza seu perfil"      on public.perfis;
drop policy if exists "perfis_update_own_or_admin"          on public.perfis;

-- INSERT: a policy "perfis_insert_own" é idêntica a "Usuário cria apenas seu perfil".
drop policy if exists "Usuário cria apenas seu perfil"       on public.perfis;

------------------------------------------------------------
-- 5) Revogar grants de anon
------------------------------------------------------------
-- Anon não deve nem tentar ler/escrever perfis. (Service_role e authenticated
-- continuam funcionando — authenticated obedece às policies acima.)
revoke select, insert, update, delete on public.perfis from anon;
