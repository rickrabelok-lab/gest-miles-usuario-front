begin;

create or replace function public.cs_provisionar_gestor_completo(
  p_usuario_id uuid,
  p_equipe_id uuid,
  p_nome_completo text,
  p_email text,
  p_slug text,
  p_escopo text default 'nacional'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_actor uuid := auth.uid();
  v_escopo text := lower(trim(coalesce(p_escopo, 'nacional')));
  v_config jsonb;
begin
  if v_actor is null then
    raise exception 'cs_provisionar_gestor_unauthenticated' using errcode = '42501';
  end if;

  if p_usuario_id is null then
    raise exception 'cs_provisionar_gestor_usuario_required' using errcode = '23514';
  end if;

  if p_equipe_id is null then
    raise exception 'cs_provisionar_gestor_equipe_required' using errcode = '23514';
  end if;

  if nullif(trim(coalesce(p_nome_completo, '')), '') is null then
    raise exception 'cs_provisionar_gestor_nome_required' using errcode = '23514';
  end if;

  if nullif(trim(coalesce(p_slug, '')), '') is null then
    raise exception 'cs_provisionar_gestor_slug_required' using errcode = '23514';
  end if;

  if v_escopo not in ('nacional', 'internacional') then
    raise exception 'cs_provisionar_gestor_escopo_invalid' using errcode = '23514';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_usuario_id) then
    raise exception 'cs_provisionar_gestor_auth_user_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.perfis p
    where p.usuario_id = p_usuario_id
      and lower(trim(coalesce(p.role, ''))) <> 'gestor'
  ) then
    raise exception 'cs_provisionar_gestor_existing_profile_not_gestor' using errcode = '23505';
  end if;

  if not (
    public.is_legacy_platform_admin()
    or exists (
      select 1
      from public.perfis me
      where me.usuario_id = v_actor
        and me.equipe_id = p_equipe_id
        and lower(trim(coalesce(me.role, ''))) in ('cs', 'admin_equipe', 'admin', 'admin_master')
    )
    or exists (
      select 1
      from public.equipe_cs ec
      where ec.equipe_id = p_equipe_id
        and ec.cs_id = v_actor
    )
    or (
      to_regclass('public.equipe_admin') is not null
      and exists (
        select 1
        from public.equipe_admin ea
        where ea.equipe_id = p_equipe_id
          and coalesce(ea.ativo, true)
          and (
            ea.admin_equipe_id_1 = v_actor
            or ea.admin_equipe_id_2 = v_actor
            or ea.admin_equipe_id_3 = v_actor
          )
      )
    )
  ) then
    raise exception 'cs_provisionar_gestor_forbidden' using errcode = '42501';
  end if;

  v_config := jsonb_build_object(
    'gestorPerfilDemanda', v_escopo,
    'especialidadeGestor', v_escopo,
    'gestorPerfil', v_escopo
  );

  insert into public.perfis (
    usuario_id,
    slug,
    nome_completo,
    email,
    role,
    configuracao_tema,
    equipe_id
  )
  values (
    p_usuario_id,
    trim(p_slug),
    trim(p_nome_completo),
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    'gestor',
    v_config,
    p_equipe_id
  )
  on conflict (usuario_id) do update
  set
    slug = excluded.slug,
    nome_completo = excluded.nome_completo,
    email = excluded.email,
    role = 'gestor',
    configuracao_tema = excluded.configuracao_tema,
    equipe_id = excluded.equipe_id;

  insert into public.cs_gestores (cs_id, gestor_id)
  values (v_actor, p_usuario_id)
  on conflict (cs_id, gestor_id) do nothing;

  return jsonb_build_object('ok', true, 'userId', p_usuario_id);
end;
$function$;

revoke all on function public.cs_provisionar_gestor_completo(uuid, uuid, text, text, text, text)
from public, anon;
grant execute on function public.cs_provisionar_gestor_completo(uuid, uuid, text, text, text, text)
to authenticated, service_role;

revoke insert, update, delete on public.cs_gestores from authenticated;

commit;
