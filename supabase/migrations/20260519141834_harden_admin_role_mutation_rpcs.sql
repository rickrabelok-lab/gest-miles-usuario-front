begin;

-- admin_geral e um perfil admin vinculado a equipe podem ver partes operacionais
-- do painel, mas nao podem executar mutacoes globais por RPC direto.

create or replace function public.admin_create_user_profile(
  p_usuario_id uuid,
  p_slug text,
  p_nome_completo text,
  p_role text,
  p_equipe_id uuid default null,
  p_cliente_gestor_ids uuid[] default null,
  p_cliente_cs_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_role text := lower(trim(coalesce(p_role, '')));
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
  v_nome text := nullif(trim(coalesce(p_nome_completo, '')), '');
  v_allowed_roles text[] := array[
    'admin',
    'admin_equipe',
    'admin_geral',
    'cs',
    'gestor',
    'cliente',
    'cliente_gestao',
    'closer_baixo',
    'closer_alto',
    'closer_geral'
  ];
  v_team_roles text[] := array[
    'admin_equipe',
    'cs',
    'gestor',
    'cliente_gestao',
    'closer_baixo',
    'closer_alto',
    'closer_geral'
  ];
  v_gestor_id uuid;
  v_cs_id uuid;
begin
  if v_actor is null then
    raise exception 'admin_create_user_profile_unauthenticated' using errcode = '42501';
  end if;

  if p_usuario_id is null or v_slug is null or v_nome is null or v_role = '' then
    raise exception 'admin_create_user_profile_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_equipe') then
    raise exception 'admin_create_user_profile_forbidden' using errcode = '42501';
  end if;

  if not (v_role = any(v_allowed_roles)) or v_role = 'admin_master' then
    raise exception 'admin_create_user_profile_invalid_role' using errcode = '23514';
  end if;

  if v_role = any(v_team_roles) and p_equipe_id is null then
    raise exception 'admin_create_user_profile_equipe_required' using errcode = '23514';
  end if;

  if v_actor_role = 'admin_equipe' then
    if v_actor_equipe_id is null or p_equipe_id is distinct from v_actor_equipe_id then
      raise exception 'admin_create_user_profile_cross_team_forbidden' using errcode = '42501';
    end if;
    if v_role in ('admin', 'admin_geral') then
      raise exception 'admin_create_user_profile_role_forbidden' using errcode = '42501';
    end if;
  end if;

  if v_actor_role = 'admin' and v_actor_equipe_id is not null then
    raise exception 'admin_create_user_profile_global_admin_required' using errcode = '42501';
  end if;

  insert into public.perfis(usuario_id, slug, nome_completo, role, equipe_id)
  values (p_usuario_id, v_slug, v_nome, v_role, p_equipe_id);

  if v_role = 'gestor' and to_regclass('public.equipe_gestores') is not null then
    insert into public.equipe_gestores(equipe_id, gestor_id)
    values (p_equipe_id, p_usuario_id)
    on conflict do nothing;
  end if;

  if v_role = 'cs' and to_regclass('public.equipe_cs') is not null then
    insert into public.equipe_cs(equipe_id, cs_id)
    values (p_equipe_id, p_usuario_id)
    on conflict do nothing;
  end if;

  if v_role = 'cliente_gestao' then
    if p_cliente_gestor_ids is not null and to_regclass('public.cliente_gestores') is not null then
      foreach v_gestor_id in array coalesce(p_cliente_gestor_ids, array[]::uuid[]) loop
        if not exists (
          select 1
          from public.perfis p
          where p.usuario_id = v_gestor_id
            and lower(trim(coalesce(p.role::text, ''))) = 'gestor'
            and p.equipe_id = p_equipe_id
        ) then
          raise exception 'admin_create_user_profile_gestor_outside_team' using errcode = '23514';
        end if;

        insert into public.cliente_gestores(cliente_id, gestor_id)
        values (p_usuario_id, v_gestor_id)
        on conflict do nothing;
      end loop;
    end if;

    if p_cliente_cs_ids is not null and to_regclass('public.cliente_cs') is not null then
      foreach v_cs_id in array coalesce(p_cliente_cs_ids, array[]::uuid[]) loop
        if not exists (
          select 1
          from public.perfis p
          where p.usuario_id = v_cs_id
            and lower(trim(coalesce(p.role::text, ''))) = 'cs'
            and p.equipe_id = p_equipe_id
        ) then
          raise exception 'admin_create_user_profile_cs_outside_team' using errcode = '23514';
        end if;

        insert into public.cliente_cs(cliente_id, cs_id)
        values (p_usuario_id, v_cs_id)
        on conflict do nothing;
      end loop;
    end if;
  end if;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_user_profile.create',
      'perfis',
      p_usuario_id::text,
      jsonb_build_object(
        'role', v_role,
        'equipe_id', p_equipe_id,
        'cliente_gestor_ids_count', coalesce(array_length(p_cliente_gestor_ids, 1), 0),
        'cliente_cs_ids_count', coalesce(array_length(p_cliente_cs_ids, 1), 0)
      )
    );
  end if;

  return p_usuario_id;
end;
$$;

create or replace function public.admin_update_user_identity_links(
  p_usuario_id uuid,
  p_nome_completo text,
  p_role text,
  p_equipe_id uuid default null,
  p_cliente_gestor_ids uuid[] default null,
  p_cliente_cs_ids uuid[] default null
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
  v_role text := lower(trim(coalesce(p_role, '')));
  v_nome text := nullif(trim(coalesce(p_nome_completo, '')), '');
  v_allowed_roles text[] := array[
    'admin',
    'admin_equipe',
    'cs',
    'gestor',
    'cliente',
    'cliente_gestao',
    'closer_baixo',
    'closer_alto',
    'closer_geral',
    'admin_geral'
  ];
  v_team_roles text[] := array[
    'admin_equipe',
    'cs',
    'gestor',
    'cliente_gestao',
    'closer_baixo',
    'closer_alto',
    'closer_geral'
  ];
  v_gestor_id uuid;
  v_cs_id uuid;
begin
  if v_actor is null then
    raise exception 'admin_identity_unauthenticated' using errcode = '42501';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_equipe') then
    raise exception 'admin_identity_forbidden' using errcode = '42501';
  end if;

  if v_role = '' or not (v_role = any(v_allowed_roles)) then
    raise exception 'invalid_role' using errcode = '23514';
  end if;

  if v_role = 'admin_master' then
    raise exception 'admin_master_role_not_mutable_by_panel' using errcode = '42501';
  end if;

  if v_role = any(v_team_roles) and p_equipe_id is null then
    raise exception 'equipe_id_required_for_role' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, '')))
    into v_target_role
  from public.perfis p
  where p.usuario_id = p_usuario_id
  for update;

  if not found then
    raise exception 'perfil_not_found' using errcode = '02000';
  end if;

  if v_target_role = 'admin_master' then
    raise exception 'admin_master_role_not_mutable_by_panel' using errcode = '42501';
  end if;

  if v_actor_role in ('admin_equipe') or (v_actor_role = 'admin' and v_actor_equipe_id is not null) then
    if v_actor_equipe_id is null then
      raise exception 'admin_equipe_missing_scope' using errcode = '42501';
    end if;

    if p_equipe_id is distinct from v_actor_equipe_id then
      raise exception 'admin_equipe_cross_team_forbidden' using errcode = '42501';
    end if;

    if v_role in ('admin', 'admin_geral') or v_target_role in ('admin', 'admin_geral') then
      raise exception 'admin_equipe_role_forbidden' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.perfis p
      where p.usuario_id = p_usuario_id
        and p.equipe_id = v_actor_equipe_id
    ) then
      raise exception 'admin_equipe_target_forbidden' using errcode = '42501';
    end if;
  end if;

  update public.perfis p
     set nome_completo = v_nome,
         role = v_role,
         equipe_id = p_equipe_id
   where p.usuario_id = p_usuario_id;

  if to_regclass('public.equipe_gestores') is not null then
    delete from public.equipe_gestores where gestor_id = p_usuario_id;
    if v_role = 'gestor' then
      insert into public.equipe_gestores(equipe_id, gestor_id)
      values (p_equipe_id, p_usuario_id)
      on conflict do nothing;
    end if;
  end if;

  if to_regclass('public.equipe_cs') is not null then
    delete from public.equipe_cs where cs_id = p_usuario_id;
    if v_role = 'cs' then
      insert into public.equipe_cs(equipe_id, cs_id)
      values (p_equipe_id, p_usuario_id)
      on conflict do nothing;
    end if;
  end if;

  if v_role <> 'cliente_gestao' then
    if to_regclass('public.cliente_gestores') is not null then
      delete from public.cliente_gestores where cliente_id = p_usuario_id;
    end if;
    if to_regclass('public.cliente_cs') is not null then
      delete from public.cliente_cs where cliente_id = p_usuario_id;
    end if;
  else
    if p_cliente_gestor_ids is not null and to_regclass('public.cliente_gestores') is not null then
      delete from public.cliente_gestores where cliente_id = p_usuario_id;

      foreach v_gestor_id in array coalesce(p_cliente_gestor_ids, array[]::uuid[]) loop
        if p_equipe_id is not null and exists (
          select 1 from public.perfis p where p.usuario_id = v_gestor_id
        ) and not exists (
          select 1
          from public.perfis p
          where p.usuario_id = v_gestor_id
            and lower(trim(coalesce(p.role::text, ''))) = 'gestor'
            and p.equipe_id = p_equipe_id
        ) then
          raise exception 'gestor_outside_cliente_equipe' using errcode = '23514';
        end if;

        insert into public.cliente_gestores(cliente_id, gestor_id)
        values (p_usuario_id, v_gestor_id)
        on conflict do nothing;
      end loop;
    end if;

    if p_cliente_cs_ids is not null and to_regclass('public.cliente_cs') is not null then
      delete from public.cliente_cs where cliente_id = p_usuario_id;

      foreach v_cs_id in array coalesce(p_cliente_cs_ids, array[]::uuid[]) loop
        if p_equipe_id is not null and exists (
          select 1 from public.perfis p where p.usuario_id = v_cs_id
        ) and not exists (
          select 1
          from public.perfis p
          where p.usuario_id = v_cs_id
            and lower(trim(coalesce(p.role::text, ''))) = 'cs'
            and p.equipe_id = p_equipe_id
        ) then
          raise exception 'cs_outside_cliente_equipe' using errcode = '23514';
        end if;

        insert into public.cliente_cs(cliente_id, cs_id)
        values (p_usuario_id, v_cs_id)
        on conflict do nothing;
      end loop;
    end if;
  end if;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_user_identity_links.update',
      'perfis',
      p_usuario_id::text,
      jsonb_build_object(
        'role_before', v_target_role,
        'role_after', v_role,
        'equipe_id', p_equipe_id,
        'cliente_gestor_ids_count', coalesce(array_length(p_cliente_gestor_ids, 1), 0),
        'cliente_cs_ids_count', coalesce(array_length(p_cliente_cs_ids, 1), 0)
      )
    );
  end if;

  return query
    select p.usuario_id, p.role::text, p.equipe_id
    from public.perfis p
    where p.usuario_id = p_usuario_id;
end;
$$;

create or replace function public.admin_update_equipe_nome(
  p_equipe_id uuid,
  p_nome text
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
  v_nome text := nullif(trim(coalesce(p_nome, '')), '');
  v_nome_before text;
begin
  if v_actor is null then
    raise exception 'admin_equipe_unauthenticated' using errcode = '42501';
  end if;

  if p_equipe_id is null or v_nome is null then
    raise exception 'admin_equipe_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_equipe') then
    raise exception 'admin_equipe_forbidden' using errcode = '42501';
  end if;

  if v_actor_role = 'admin' and v_actor_equipe_id is not null and p_equipe_id is distinct from v_actor_equipe_id then
    raise exception 'admin_equipe_cross_team_forbidden' using errcode = '42501';
  end if;

  if v_actor_role = 'admin_equipe' and (v_actor_equipe_id is null or p_equipe_id is distinct from v_actor_equipe_id) then
    raise exception 'admin_equipe_cross_team_forbidden' using errcode = '42501';
  end if;

  select e.nome
    into v_nome_before
  from public.equipes e
  where e.id = p_equipe_id
  for update;

  if not found then
    raise exception 'admin_equipe_not_found' using errcode = '02000';
  end if;

  update public.equipes
     set nome = v_nome,
         updated_at = now()
   where id = p_equipe_id;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_equipe.update_nome',
      'equipes',
      p_equipe_id::text,
      jsonb_build_object('nome_before', v_nome_before, 'nome_after', v_nome)
    );
  end if;

  return jsonb_build_object('ok', true, 'equipe_id', p_equipe_id, 'nome', v_nome);
end;
$$;

create or replace function public.admin_extend_subscription_by_days(
  p_subscription_id uuid,
  p_days integer
)
returns table(subscription_id uuid, end_column text, ends_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_row public.subscriptions%rowtype;
  v_end_column text;
  v_current_end timestamptz;
  v_base timestamptz;
  v_next timestamptz;
begin
  if v_actor is null then
    raise exception 'admin_subscription_unauthenticated' using errcode = '42501';
  end if;

  if p_subscription_id is null or p_days is null or p_days <= 0 or p_days > 3660 then
    raise exception 'admin_subscription_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin') then
    raise exception 'admin_subscription_forbidden' using errcode = '42501';
  end if;

  if v_actor_role = 'admin' and v_actor_equipe_id is not null then
    raise exception 'admin_subscription_global_admin_required' using errcode = '42501';
  end if;

  select *
    into v_row
  from public.subscriptions s
  where s.id = p_subscription_id
  for update;

  if not found then
    raise exception 'admin_subscription_not_found' using errcode = '02000';
  end if;

  v_end_column := case
    when v_row.expires_at is not null then 'expires_at'
    when v_row.end_at is not null then 'end_at'
    when v_row.current_period_end is not null then 'current_period_end'
    when v_row.valid_until is not null then 'valid_until'
    when v_row.data_fim is not null then 'data_fim'
    else 'expires_at'
  end;

  v_current_end := coalesce(v_row.expires_at, v_row.end_at, v_row.current_period_end, v_row.valid_until, v_row.data_fim);
  v_base := greatest(coalesce(v_current_end, now()), now());
  v_next := v_base + make_interval(days => p_days);

  execute format('update public.subscriptions set %I = $1, updated_at = now() where id = $2', v_end_column)
    using v_next, p_subscription_id;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_subscription.extend_days',
      'subscriptions',
      p_subscription_id::text,
      jsonb_build_object(
        'days', p_days,
        'end_column', v_end_column,
        'previous_end', v_current_end,
        'next_end', v_next
      )
    );
  end if;

  return query select p_subscription_id, v_end_column, v_next;
end;
$$;

create or replace function public.admin_insert_audit_log(
  p_tipo_acao text,
  p_entidade_afetada text,
  p_entidade_id text,
  p_details jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_tipo_acao text := nullif(trim(coalesce(p_tipo_acao, '')), '');
  v_entidade_afetada text := nullif(trim(coalesce(p_entidade_afetada, '')), '');
  v_entidade_id text := nullif(trim(coalesce(p_entidade_id, '')), '');
begin
  if v_actor is null then
    raise exception 'admin_audit_log_unauthenticated' using errcode = '42501';
  end if;

  if v_tipo_acao is null or v_entidade_afetada is null or v_entidade_id is null then
    raise exception 'admin_audit_log_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, '')))
    into v_actor_role
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin') then
    raise exception 'admin_audit_log_forbidden' using errcode = '42501';
  end if;

  insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
  values (v_actor, v_tipo_acao, v_entidade_afetada, v_entidade_id, coalesce(p_details, '{}'::jsonb));

  return jsonb_build_object('ok', true);
end;
$$;

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
     or v_actor_role not in ('admin_master', 'admin', 'admin_equipe') then
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

  if v_actor_role in ('admin_equipe') or (v_actor_role = 'admin' and v_actor_equipe_id is not null) then
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
     or v_actor_role not in ('admin_master', 'admin', 'admin_equipe') then
    raise exception 'admin_set_equipe_members_forbidden' using errcode = '42501';
  end if;

  if (v_actor_role = 'admin_equipe' or (v_actor_role = 'admin' and v_actor_equipe_id is not null))
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
    on conflict do nothing;
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
    on conflict do nothing;
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

create or replace function public.admin_save_cliente_perfil_config(
  p_usuario_id uuid,
  p_nome_completo text,
  p_slug text,
  p_cliente_perfil jsonb
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
  v_target_role text;
  v_target_equipe_id uuid;
  v_existing_config jsonb;
  v_next_config jsonb;
  v_nome text := nullif(trim(coalesce(p_nome_completo, '')), '');
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
  v_exists boolean := false;
begin
  if v_actor is null then
    raise exception 'admin_cliente_perfil_unauthenticated' using errcode = '42501';
  end if;

  if p_usuario_id is null or v_nome is null or p_cliente_perfil is null or jsonb_typeof(p_cliente_perfil) <> 'object' then
    raise exception 'admin_cliente_perfil_invalid_input' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_equipe') then
    raise exception 'admin_cliente_perfil_forbidden' using errcode = '42501';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id, coalesce(p.configuracao_tema::jsonb, '{}'::jsonb), true
    into v_target_role, v_target_equipe_id, v_existing_config, v_exists
  from public.perfis p
  where p.usuario_id = p_usuario_id
  for update;

  if v_exists then
    if v_target_role not in ('cliente', 'cliente_gestao') then
      raise exception 'admin_cliente_perfil_target_not_client' using errcode = '23514';
    end if;

    if v_actor_role = 'admin' and v_actor_equipe_id is not null and v_target_equipe_id is distinct from v_actor_equipe_id then
      raise exception 'admin_cliente_perfil_cross_team_forbidden' using errcode = '42501';
    end if;

    if v_actor_role = 'admin_equipe' then
      if v_actor_equipe_id is null then
        raise exception 'admin_cliente_perfil_cross_team_forbidden' using errcode = '42501';
      end if;

      if v_target_equipe_id is distinct from v_actor_equipe_id
         and not exists (
           select 1 from public.cliente_gestores cg
           join public.equipe_gestores eg on eg.gestor_id = cg.gestor_id
           where cg.cliente_id = p_usuario_id and eg.equipe_id = v_actor_equipe_id
         )
         and not exists (
           select 1 from public.cliente_cs cc
           join public.equipe_cs ec on ec.cs_id = cc.cs_id
           where cc.cliente_id = p_usuario_id and ec.equipe_id = v_actor_equipe_id
         ) then
        raise exception 'admin_cliente_perfil_cross_team_forbidden' using errcode = '42501';
      end if;
    end if;

    v_next_config := v_existing_config || jsonb_build_object('clientePerfil', p_cliente_perfil);

    update public.perfis
       set nome_completo = v_nome,
           configuracao_tema = v_next_config
     where usuario_id = p_usuario_id;
  else
    if v_actor_role <> 'admin_master' and not (v_actor_role = 'admin' and v_actor_equipe_id is null) then
      raise exception 'admin_cliente_perfil_create_forbidden' using errcode = '42501';
    end if;

    if v_slug is null then
      raise exception 'admin_cliente_perfil_slug_required' using errcode = '23514';
    end if;

    v_next_config := jsonb_build_object('clientePerfil', p_cliente_perfil);

    insert into public.perfis(usuario_id, slug, nome_completo, role, configuracao_tema)
    values (p_usuario_id, v_slug, v_nome, 'cliente', v_next_config);
  end if;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_cliente_perfil.save',
      'perfis',
      p_usuario_id::text,
      jsonb_build_object('created', not v_exists)
    );
  end if;

  return jsonb_build_object('ok', true, 'usuario_id', p_usuario_id, 'created', not v_exists);
end;
$$;

revoke all on function public.admin_create_user_profile(uuid, text, text, text, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_create_user_profile(uuid, text, text, text, uuid, uuid[], uuid[]) to authenticated, service_role;

revoke all on function public.admin_update_user_identity_links(uuid, text, text, uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.admin_update_user_identity_links(uuid, text, text, uuid, uuid[], uuid[]) to authenticated, service_role;

revoke all on function public.admin_update_equipe_nome(uuid, text) from public, anon;
grant execute on function public.admin_update_equipe_nome(uuid, text) to authenticated, service_role;

revoke all on function public.admin_extend_subscription_by_days(uuid, integer) from public, anon;
grant execute on function public.admin_extend_subscription_by_days(uuid, integer) to authenticated, service_role;

revoke all on function public.admin_insert_audit_log(text, text, text, jsonb) from public, anon;
grant execute on function public.admin_insert_audit_log(text, text, text, jsonb) to authenticated, service_role;

revoke all on function public.admin_move_client_to_equipe(uuid, uuid) from public, anon;
grant execute on function public.admin_move_client_to_equipe(uuid, uuid) to authenticated, service_role;

revoke all on function public.admin_set_equipe_role_members(uuid, text, uuid[]) from public, anon;
grant execute on function public.admin_set_equipe_role_members(uuid, text, uuid[]) to authenticated, service_role;

revoke all on function public.admin_save_cliente_perfil_config(uuid, text, text, jsonb) from public, anon;
grant execute on function public.admin_save_cliente_perfil_config(uuid, text, text, jsonb) to authenticated, service_role;

-- A exclusao completa de usuario agora passa pela Edge Function admin-delete-user,
-- que remove Auth + perfil no mesmo fluxo. Evita chamada direta que apaga apenas o perfil.
revoke all on function public.admin_delete_user_profile(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_user_profile(uuid) to service_role;

commit;
