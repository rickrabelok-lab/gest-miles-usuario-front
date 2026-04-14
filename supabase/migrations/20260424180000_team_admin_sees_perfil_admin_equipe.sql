-- perfis_select_team_scoped usa team_admin_sees_perfil(usuario_id). A função só
-- testava me.role = 'admin', pelo que quem tem role = 'admin_equipe' não conseguia
-- ler perfis de clientes da mesma equipe — KPIs, nomes e fluxos que dependem de
-- SELECT em perfis falhavam mesmo com can_manage_client corrigido.

create or replace function public.team_admin_sees_perfil(target_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.perfis me
      join public.perfis them on them.equipe_id is not distinct from me.equipe_id
      where me.usuario_id = auth.uid()
        and me.role in ('admin', 'admin_equipe')
        and me.equipe_id is not null
        and them.usuario_id = target_usuario_id
        and them.equipe_id is not null
    ),
    false
  );
$$;

comment on function public.team_admin_sees_perfil(uuid) is
  'Admin ou admin_equipe na mesma equipe (perfis.equipe_id) vê o perfil do utilizador alvo.';
