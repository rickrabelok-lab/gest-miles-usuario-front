begin;

do $$
begin
  if to_regclass('public.perfis') is null then
    raise exception 'missing dependency: public.perfis';
  end if;
  if to_regclass('public.equipes') is null then
    raise exception 'missing dependency: public.equipes';
  end if;
  if to_regclass('public.cliente_gestores') is null then
    raise exception 'missing dependency: public.cliente_gestores';
  end if;
  if to_regclass('public.cliente_cs') is null then
    raise exception 'missing dependency: public.cliente_cs';
  end if;
  if to_regclass('public.equipe_gestores') is null then
    raise exception 'missing dependency: public.equipe_gestores';
  end if;
  if to_regclass('public.equipe_cs') is null then
    raise exception 'missing dependency: public.equipe_cs';
  end if;
end $$;

create or replace function public.admin_move_client_to_equipe(
  p_cliente_id uuid,
  p_equipe_id uuid
)
returns table(usuario_id uuid, role text, equipe_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_target_role text;
  v_target_equipe_id uuid;
begin
  if v_actor is null then
    raise exception 'admin_move_client_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null or p_equipe_id is null then
    raise exception 'admin_move_client_invalid_input' using errcode = '23502';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null
     or v_actor_role not in ('admin_master', 'admin', 'admin_geral', 'admin_equipe') then
    raise exception 'admin_move_client_forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.equipes e where e.id = p_equipe_id) then
    raise exception 'admin_move_client_equipe_not_found' using errcode = '23503';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_target_role, v_target_equipe_id
  from public.perfis p
  where p.usuario_id = p_cliente_id
  for update;

  if not found then
    raise exception 'admin_move_client_perfil_not_found' using errcode = '02000';
  end if;

  if v_target_role not in ('cliente', 'cliente_gestao') then
    raise exception 'admin_move_client_target_not_client' using errcode = '23514';
  end if;

  if v_actor_role = 'admin_equipe' then
    if v_actor_equipe_id is null or p_equipe_id is distinct from v_actor_equipe_id then
      raise exception 'admin_move_client_cross_team_forbidden' using errcode = '42501';
    end if;

    if v_target_equipe_id is not null and v_target_equipe_id is distinct from v_actor_equipe_id then
      raise exception 'admin_move_client_target_cross_team_forbidden' using errcode = '42501';
    end if;
  end if;

  delete from public.cliente_gestores where cliente_id = p_cliente_id;
  delete from public.cliente_cs where cliente_id = p_cliente_id;

  update public.perfis p
     set equipe_id = p_equipe_id,
         role = 'cliente_gestao'
   where p.usuario_id = p_cliente_id;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_membership.move_client_to_equipe',
      'perfis',
      p_cliente_id::text,
      jsonb_build_object(
        'equipe_id_before', v_target_equipe_id,
        'equipe_id_after', p_equipe_id,
        'role_before', v_target_role,
        'role_after', 'cliente_gestao'
      )
    );
  end if;

  return query
    select p.usuario_id, p.role::text, p.equipe_id
    from public.perfis p
    where p.usuario_id = p_cliente_id;
end;
$$;

create or replace function public.admin_set_equipe_role_members(
  p_equipe_id uuid,
  p_member_role text,
  p_usuario_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_member_role text := lower(trim(coalesce(p_member_role, '')));
  v_ids uuid[] := coalesce(p_usuario_ids, array[]::uuid[]);
  v_missing_count integer;
  v_role_mismatch_count integer;
  v_removed_count integer := 0;
  v_inserted_count integer := 0;
begin
  if v_actor is null then
    raise exception 'admin_set_equipe_members_unauthenticated' using errcode = '42501';
  end if;

  if p_equipe_id is null or v_member_role not in ('gestor', 'cs') then
    raise exception 'admin_set_equipe_members_invalid_input' using errcode = '23514';
  end if;

  select coalesce(array_agg(distinct x), array[]::uuid[])
    into v_ids
  from unnest(v_ids) as x
  where x is not null;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null
     or v_actor_role not in ('admin_master', 'admin', 'admin_geral', 'admin_equipe') then
    raise exception 'admin_set_equipe_members_forbidden' using errcode = '42501';
  end if;

  if v_actor_role = 'admin_equipe'
     and (v_actor_equipe_id is null or p_equipe_id is distinct from v_actor_equipe_id) then
    raise exception 'admin_set_equipe_members_cross_team_forbidden' using errcode = '42501';
  end if;

  if not exists (select 1 from public.equipes e where e.id = p_equipe_id) then
    raise exception 'admin_set_equipe_members_equipe_not_found' using errcode = '23503';
  end if;

  select count(*)
    into v_missing_count
  from unnest(v_ids) as ids(usuario_id)
  left join public.perfis p on p.usuario_id = ids.usuario_id
  where p.usuario_id is null;

  if v_missing_count > 0 then
    raise exception 'admin_set_equipe_members_perfil_not_found' using errcode = '23503';
  end if;

  select count(*)
    into v_role_mismatch_count
  from unnest(v_ids) as ids(usuario_id)
  join public.perfis p on p.usuario_id = ids.usuario_id
  where lower(trim(coalesce(p.role::text, ''))) <> v_member_role;

  if v_role_mismatch_count > 0 then
    raise exception 'admin_set_equipe_members_role_mismatch' using errcode = '23514';
  end if;

  if v_member_role = 'gestor' then
    delete from public.equipe_gestores eg
    where eg.equipe_id = p_equipe_id
      and not exists (
        select 1 from unnest(v_ids) as ids(usuario_id)
        where ids.usuario_id = eg.gestor_id
      );
    get diagnostics v_removed_count = row_count;

    delete from public.equipe_gestores eg
    using unnest(v_ids) as ids(usuario_id)
    where eg.gestor_id = ids.usuario_id;

    insert into public.equipe_gestores(equipe_id, gestor_id)
    select p_equipe_id, ids.usuario_id
    from unnest(v_ids) as ids(usuario_id)
    on conflict (equipe_id, gestor_id) do nothing;
    get diagnostics v_inserted_count = row_count;

    update public.perfis p
       set equipe_id = p_equipe_id
     where p.usuario_id = any(v_ids)
       and lower(trim(coalesce(p.role::text, ''))) = 'gestor';

    update public.perfis p
       set equipe_id = null
     where lower(trim(coalesce(p.role::text, ''))) = 'gestor'
       and p.equipe_id = p_equipe_id
       and not exists (
         select 1 from unnest(v_ids) as ids(usuario_id)
         where ids.usuario_id = p.usuario_id
       );
  else
    delete from public.equipe_cs ec
    where ec.equipe_id = p_equipe_id
      and not exists (
        select 1 from unnest(v_ids) as ids(usuario_id)
        where ids.usuario_id = ec.cs_id
      );
    get diagnostics v_removed_count = row_count;

    delete from public.equipe_cs ec
    using unnest(v_ids) as ids(usuario_id)
    where ec.cs_id = ids.usuario_id;

    insert into public.equipe_cs(equipe_id, cs_id)
    select p_equipe_id, ids.usuario_id
    from unnest(v_ids) as ids(usuario_id)
    on conflict (equipe_id, cs_id) do nothing;
    get diagnostics v_inserted_count = row_count;

    update public.perfis p
       set equipe_id = p_equipe_id
     where p.usuario_id = any(v_ids)
       and lower(trim(coalesce(p.role::text, ''))) = 'cs';

    update public.perfis p
       set equipe_id = null
     where lower(trim(coalesce(p.role::text, ''))) = 'cs'
       and p.equipe_id = p_equipe_id
       and not exists (
         select 1 from unnest(v_ids) as ids(usuario_id)
         where ids.usuario_id = p.usuario_id
       );
  end if;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_membership.set_equipe_role_members',
      case when v_member_role = 'gestor' then 'equipe_gestores' else 'equipe_cs' end,
      p_equipe_id::text,
      jsonb_build_object(
        'member_role', v_member_role,
        'member_count', coalesce(array_length(v_ids, 1), 0),
        'removed_count', v_removed_count,
        'inserted_count', v_inserted_count
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'equipe_id', p_equipe_id,
    'member_role', v_member_role,
    'member_count', coalesce(array_length(v_ids, 1), 0),
    'removed_count', v_removed_count,
    'inserted_count', v_inserted_count
  );
end;
$$;

revoke all on function public.admin_move_client_to_equipe(uuid, uuid) from public, anon;
grant execute on function public.admin_move_client_to_equipe(uuid, uuid) to authenticated, service_role;

revoke all on function public.admin_set_equipe_role_members(uuid, text, uuid[]) from public, anon;
grant execute on function public.admin_set_equipe_role_members(uuid, text, uuid[]) to authenticated, service_role;

commit;
