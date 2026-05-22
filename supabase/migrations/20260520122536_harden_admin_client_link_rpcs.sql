begin;

create or replace function public.admin_set_gestor_funcao(
  p_gestor_id uuid,
  p_funcao text default null
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
  v_funcao text := nullif(lower(trim(coalesce(p_funcao, ''))), '');
  v_removed_count integer := 0;
  v_upserted_count integer := 0;
begin
  if v_actor is null then
    raise exception 'admin_set_gestor_funcao_unauthenticated' using errcode = '42501';
  end if;

  if p_gestor_id is null then
    raise exception 'admin_set_gestor_funcao_invalid_input' using errcode = '23514';
  end if;

  if v_funcao is not null and v_funcao not in ('nacional', 'internacional') then
    raise exception 'admin_set_gestor_funcao_invalid_funcao' using errcode = '23514';
  end if;

  if to_regclass('public.gestor_funcoes') is null then
    raise exception 'admin_set_gestor_funcao_table_missing' using errcode = '42P01';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_geral', 'admin_equipe') then
    raise exception 'admin_set_gestor_funcao_forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.perfis p
    where p.usuario_id = p_gestor_id
      and lower(trim(coalesce(p.role::text, ''))) = 'gestor'
  ) then
    raise exception 'admin_set_gestor_funcao_gestor_not_found' using errcode = '23503';
  end if;

  if (v_actor_role = 'admin_equipe' or (v_actor_role = 'admin' and v_actor_equipe_id is not null))
     and not exists (
       select 1
       from public.perfis p
       where p.usuario_id = p_gestor_id
         and p.equipe_id = v_actor_equipe_id
       union
       select 1
       from public.equipe_gestores eg
       where eg.gestor_id = p_gestor_id
         and eg.equipe_id = v_actor_equipe_id
     ) then
    raise exception 'admin_set_gestor_funcao_cross_team_forbidden' using errcode = '42501';
  end if;

  if v_funcao is null then
    delete from public.gestor_funcoes gf
    where gf.gestor_id = p_gestor_id;
    get diagnostics v_removed_count = row_count;
  else
    insert into public.gestor_funcoes(gestor_id, funcao, updated_at)
    values (p_gestor_id, v_funcao, now())
    on conflict (gestor_id) do update
      set funcao = excluded.funcao,
          updated_at = excluded.updated_at;
    get diagnostics v_upserted_count = row_count;
  end if;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_membership.set_gestor_funcao',
      'gestor_funcoes',
      p_gestor_id::text,
      jsonb_build_object('funcao', v_funcao, 'removed_count', v_removed_count, 'upserted_count', v_upserted_count)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'gestor_id', p_gestor_id,
    'funcao', v_funcao,
    'removed_count', v_removed_count,
    'upserted_count', v_upserted_count
  );
end;
$$;

create or replace function public.admin_set_cliente_gestores(
  p_cliente_id uuid,
  p_gestor_ids uuid[] default array[]::uuid[]
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
  v_cliente_equipe_id uuid;
  v_ids uuid[] := coalesce(p_gestor_ids, array[]::uuid[]);
  v_missing_count integer;
  v_outside_team_count integer;
  v_removed_count integer := 0;
  v_inserted_count integer := 0;
begin
  if v_actor is null then
    raise exception 'admin_set_cliente_gestores_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'admin_set_cliente_gestores_invalid_input' using errcode = '23514';
  end if;

  if to_regclass('public.cliente_gestores') is null then
    raise exception 'admin_set_cliente_gestores_table_missing' using errcode = '42P01';
  end if;

  select coalesce(array_agg(distinct x), array[]::uuid[])
    into v_ids
  from unnest(v_ids) as x
  where x is not null;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_geral', 'admin_equipe') then
    raise exception 'admin_set_cliente_gestores_forbidden' using errcode = '42501';
  end if;

  select p.equipe_id
    into v_cliente_equipe_id
  from public.perfis p
  where p.usuario_id = p_cliente_id
    and lower(trim(coalesce(p.role::text, ''))) in ('cliente', 'cliente_gestao');

  if v_cliente_equipe_id is null then
    raise exception 'admin_set_cliente_gestores_cliente_not_found_or_without_team' using errcode = '23503';
  end if;

  if (v_actor_role = 'admin_equipe' or (v_actor_role = 'admin' and v_actor_equipe_id is not null))
     and v_cliente_equipe_id is distinct from v_actor_equipe_id then
    raise exception 'admin_set_cliente_gestores_cross_team_forbidden' using errcode = '42501';
  end if;

  select count(*)
    into v_missing_count
  from unnest(v_ids) as ids(usuario_id)
  left join public.perfis p
    on p.usuario_id = ids.usuario_id
   and lower(trim(coalesce(p.role::text, ''))) = 'gestor'
  where p.usuario_id is null;

  if v_missing_count > 0 then
    raise exception 'admin_set_cliente_gestores_gestor_not_found' using errcode = '23503';
  end if;

  select count(*)
    into v_outside_team_count
  from unnest(v_ids) as ids(usuario_id)
  where not exists (
      select 1
      from public.perfis p
      where p.usuario_id = ids.usuario_id
        and p.equipe_id = v_cliente_equipe_id
    )
    and not exists (
      select 1
      from public.equipe_gestores eg
      where eg.gestor_id = ids.usuario_id
        and eg.equipe_id = v_cliente_equipe_id
    );

  if v_outside_team_count > 0 then
    raise exception 'admin_set_cliente_gestores_gestor_outside_team' using errcode = '23514';
  end if;

  delete from public.cliente_gestores cg
  where cg.cliente_id = p_cliente_id
    and not exists (
      select 1 from unnest(v_ids) as ids(usuario_id)
      where ids.usuario_id = cg.gestor_id
    );
  get diagnostics v_removed_count = row_count;

  insert into public.cliente_gestores(cliente_id, gestor_id)
  select p_cliente_id, ids.usuario_id
  from unnest(v_ids) as ids(usuario_id)
  on conflict (cliente_id, gestor_id) do nothing;
  get diagnostics v_inserted_count = row_count;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_membership.set_cliente_gestores',
      'cliente_gestores',
      p_cliente_id::text,
      jsonb_build_object(
        'gestor_count', coalesce(array_length(v_ids, 1), 0),
        'removed_count', v_removed_count,
        'inserted_count', v_inserted_count
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'cliente_id', p_cliente_id,
    'gestor_count', coalesce(array_length(v_ids, 1), 0),
    'removed_count', v_removed_count,
    'inserted_count', v_inserted_count
  );
end;
$$;

create or replace function public.admin_set_cliente_cs(
  p_cliente_id uuid,
  p_cs_ids uuid[] default array[]::uuid[]
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
  v_cliente_equipe_id uuid;
  v_ids uuid[] := coalesce(p_cs_ids, array[]::uuid[]);
  v_missing_count integer;
  v_outside_team_count integer;
  v_removed_count integer := 0;
  v_inserted_count integer := 0;
begin
  if v_actor is null then
    raise exception 'admin_set_cliente_cs_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'admin_set_cliente_cs_invalid_input' using errcode = '23514';
  end if;

  if to_regclass('public.cliente_cs') is null then
    raise exception 'admin_set_cliente_cs_table_missing' using errcode = '42P01';
  end if;

  select coalesce(array_agg(distinct x), array[]::uuid[])
    into v_ids
  from unnest(v_ids) as x
  where x is not null;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_geral', 'admin_equipe') then
    raise exception 'admin_set_cliente_cs_forbidden' using errcode = '42501';
  end if;

  select p.equipe_id
    into v_cliente_equipe_id
  from public.perfis p
  where p.usuario_id = p_cliente_id
    and lower(trim(coalesce(p.role::text, ''))) in ('cliente', 'cliente_gestao');

  if v_cliente_equipe_id is null then
    raise exception 'admin_set_cliente_cs_cliente_not_found_or_without_team' using errcode = '23503';
  end if;

  if (v_actor_role = 'admin_equipe' or (v_actor_role = 'admin' and v_actor_equipe_id is not null))
     and v_cliente_equipe_id is distinct from v_actor_equipe_id then
    raise exception 'admin_set_cliente_cs_cross_team_forbidden' using errcode = '42501';
  end if;

  select count(*)
    into v_missing_count
  from unnest(v_ids) as ids(usuario_id)
  left join public.perfis p
    on p.usuario_id = ids.usuario_id
   and lower(trim(coalesce(p.role::text, ''))) = 'cs'
  where p.usuario_id is null;

  if v_missing_count > 0 then
    raise exception 'admin_set_cliente_cs_not_found' using errcode = '23503';
  end if;

  select count(*)
    into v_outside_team_count
  from unnest(v_ids) as ids(usuario_id)
  where not exists (
      select 1
      from public.perfis p
      where p.usuario_id = ids.usuario_id
        and p.equipe_id = v_cliente_equipe_id
    )
    and not exists (
      select 1
      from public.equipe_cs ec
      where ec.cs_id = ids.usuario_id
        and ec.equipe_id = v_cliente_equipe_id
    );

  if v_outside_team_count > 0 then
    raise exception 'admin_set_cliente_cs_outside_team' using errcode = '23514';
  end if;

  delete from public.cliente_cs cc
  where cc.cliente_id = p_cliente_id
    and not exists (
      select 1 from unnest(v_ids) as ids(usuario_id)
      where ids.usuario_id = cc.cs_id
    );
  get diagnostics v_removed_count = row_count;

  insert into public.cliente_cs(cliente_id, cs_id)
  select p_cliente_id, ids.usuario_id
  from unnest(v_ids) as ids(usuario_id)
  on conflict (cliente_id, cs_id) do nothing;
  get diagnostics v_inserted_count = row_count;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_membership.set_cliente_cs',
      'cliente_cs',
      p_cliente_id::text,
      jsonb_build_object(
        'cs_count', coalesce(array_length(v_ids, 1), 0),
        'removed_count', v_removed_count,
        'inserted_count', v_inserted_count
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'cliente_id', p_cliente_id,
    'cs_count', coalesce(array_length(v_ids, 1), 0),
    'removed_count', v_removed_count,
    'inserted_count', v_inserted_count
  );
end;
$$;

create or replace function public.gestor_vincular_cliente(
  p_cliente_id uuid
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
  v_cliente_equipe_id uuid;
  v_inserted_count integer := 0;
begin
  if v_actor is null then
    raise exception 'gestor_vincular_cliente_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'gestor_vincular_cliente_invalid_input' using errcode = '23514';
  end if;

  if to_regclass('public.cliente_gestores') is null then
    raise exception 'gestor_vincular_cliente_table_missing' using errcode = '42P01';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role <> 'gestor' then
    raise exception 'gestor_vincular_cliente_forbidden' using errcode = '42501';
  end if;

  select p.equipe_id
    into v_cliente_equipe_id
  from public.perfis p
  where p.usuario_id = p_cliente_id
    and lower(trim(coalesce(p.role::text, ''))) in ('cliente', 'cliente_gestao');

  if v_cliente_equipe_id is null then
    raise exception 'gestor_vincular_cliente_cliente_not_found_or_without_team' using errcode = '23503';
  end if;

  if not exists (
      select 1
      from public.perfis p
      where p.usuario_id = v_actor
        and p.equipe_id = v_cliente_equipe_id
    )
    and not exists (
      select 1
      from public.equipe_gestores eg
      where eg.gestor_id = v_actor
        and eg.equipe_id = v_cliente_equipe_id
    ) then
    raise exception 'gestor_vincular_cliente_cross_team_forbidden' using errcode = '42501';
  end if;

  insert into public.cliente_gestores(cliente_id, gestor_id)
  values (p_cliente_id, v_actor)
  on conflict (cliente_id, gestor_id) do nothing;
  get diagnostics v_inserted_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'cliente_id', p_cliente_id,
    'gestor_id', v_actor,
    'inserted_count', v_inserted_count
  );
end;
$$;

create or replace function public.gestor_desvincular_cliente(
  p_cliente_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_deleted_count integer := 0;
begin
  if v_actor is null then
    raise exception 'gestor_desvincular_cliente_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'gestor_desvincular_cliente_invalid_input' using errcode = '23514';
  end if;

  if to_regclass('public.cliente_gestores') is null then
    raise exception 'gestor_desvincular_cliente_table_missing' using errcode = '42P01';
  end if;

  select lower(trim(coalesce(p.role::text, '')))
    into v_actor_role
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role <> 'gestor' then
    raise exception 'gestor_desvincular_cliente_forbidden' using errcode = '42501';
  end if;

  delete from public.cliente_gestores cg
  where cg.cliente_id = p_cliente_id
    and cg.gestor_id = v_actor;
  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object(
    'ok', true,
    'cliente_id', p_cliente_id,
    'gestor_id', v_actor,
    'deleted_count', v_deleted_count
  );
end;
$$;

create or replace function public.cs_vincular_cliente_gestores(
  p_cliente_id uuid,
  p_gestor_ids uuid[]
)
returns table(linked integer, skipped integer, total integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_actor_equipe_id uuid;
  v_cliente_equipe_id uuid;
  v_ids uuid[] := coalesce(p_gestor_ids, array[]::uuid[]);
  v_total integer := 0;
  v_linked integer := 0;
  v_missing_count integer := 0;
  v_outside_team_count integer := 0;
begin
  if v_actor is null then
    raise exception 'cs_vincular_cliente_gestores_unauthenticated' using errcode = '42501';
  end if;

  if p_cliente_id is null then
    raise exception 'cs_vincular_cliente_gestores_invalid_cliente' using errcode = '23514';
  end if;

  select coalesce(array_agg(distinct x), array[]::uuid[])
    into v_ids
  from unnest(v_ids) as x
  where x is not null;

  v_total := coalesce(array_length(v_ids, 1), 0);

  if v_total = 0 then
    raise exception 'cs_vincular_cliente_gestores_empty_gestores' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_geral', 'admin_equipe', 'cs') then
    raise exception 'cs_vincular_cliente_gestores_forbidden' using errcode = '42501';
  end if;

  select p.equipe_id
    into v_cliente_equipe_id
  from public.perfis p
  where p.usuario_id = p_cliente_id
    and lower(trim(coalesce(p.role::text, ''))) in ('cliente', 'cliente_gestao');

  if v_cliente_equipe_id is null then
    raise exception 'cs_vincular_cliente_gestores_cliente_not_found_or_without_team' using errcode = '23503';
  end if;

  if (v_actor_role = 'admin_equipe' or (v_actor_role = 'admin' and v_actor_equipe_id is not null))
     and v_cliente_equipe_id is distinct from v_actor_equipe_id then
    raise exception 'cs_vincular_cliente_gestores_cross_team_forbidden' using errcode = '42501';
  end if;

  if v_actor_role = 'cs'
     and v_cliente_equipe_id is distinct from v_actor_equipe_id
     and not exists (
       select 1
       from public.equipe_cs ec
       where ec.cs_id = v_actor
         and ec.equipe_id = v_cliente_equipe_id
     ) then
    raise exception 'cs_vincular_cliente_gestores_cross_team_forbidden' using errcode = '42501';
  end if;

  select count(*)
    into v_missing_count
  from unnest(v_ids) as ids(usuario_id)
  left join public.perfis p
    on p.usuario_id = ids.usuario_id
   and lower(trim(coalesce(p.role::text, ''))) = 'gestor'
  where p.usuario_id is null;

  if v_missing_count > 0 then
    raise exception 'cs_vincular_cliente_gestores_gestor_not_found' using errcode = '23503';
  end if;

  select count(*)
    into v_outside_team_count
  from unnest(v_ids) as ids(usuario_id)
  where not exists (
      select 1
      from public.perfis p
      where p.usuario_id = ids.usuario_id
        and p.equipe_id = v_cliente_equipe_id
    )
    and not exists (
      select 1
      from public.equipe_gestores eg
      where eg.gestor_id = ids.usuario_id
        and eg.equipe_id = v_cliente_equipe_id
    );

  if v_outside_team_count > 0 then
    raise exception 'cs_vincular_cliente_gestores_gestor_outside_team' using errcode = '23514';
  end if;

  insert into public.cliente_gestores(cliente_id, gestor_id)
  select p_cliente_id, ids.usuario_id
  from unnest(v_ids) as ids(usuario_id)
  on conflict (cliente_id, gestor_id) do nothing;
  get diagnostics v_linked = row_count;

  return query select v_linked, v_total - v_linked, v_total;
end;
$$;

revoke all on function public.admin_set_gestor_funcao(uuid, text) from public, anon;
revoke all on function public.admin_set_cliente_gestores(uuid, uuid[]) from public, anon;
revoke all on function public.admin_set_cliente_cs(uuid, uuid[]) from public, anon;
revoke all on function public.gestor_vincular_cliente(uuid) from public, anon;
revoke all on function public.gestor_desvincular_cliente(uuid) from public, anon;
revoke all on function public.cs_vincular_cliente_gestores(uuid, uuid[]) from public, anon;

grant execute on function public.admin_set_gestor_funcao(uuid, text) to authenticated, service_role;
grant execute on function public.admin_set_cliente_gestores(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.admin_set_cliente_cs(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.gestor_vincular_cliente(uuid) to authenticated, service_role;
grant execute on function public.gestor_desvincular_cliente(uuid) to authenticated, service_role;
grant execute on function public.cs_vincular_cliente_gestores(uuid, uuid[]) to authenticated, service_role;

comment on function public.admin_set_gestor_funcao(uuid, text) is
  'Admin RPC para substituir write direto em gestor_funcoes. Valida role do operador e escopo de equipe.';

comment on function public.admin_set_cliente_gestores(uuid, uuid[]) is
  'Admin RPC para substituir todos os vinculos cliente_gestores de um cliente. Valida role do operador, cliente, gestores e escopo de equipe.';

comment on function public.admin_set_cliente_cs(uuid, uuid[]) is
  'Admin RPC para substituir todos os vinculos cliente_cs de um cliente. Valida role do operador, cliente, CS e escopo de equipe.';

comment on function public.gestor_vincular_cliente(uuid) is
  'Gestor RPC para substituir insert direto em cliente_gestores. Vincula apenas o gestor autenticado a cliente da mesma equipe.';

comment on function public.gestor_desvincular_cliente(uuid) is
  'Gestor RPC para substituir delete direto em cliente_gestores. Remove apenas o vinculo do gestor autenticado.';

comment on function public.cs_vincular_cliente_gestores(uuid, uuid[]) is
  'CS/admin RPC para substituir insert direto em cliente_gestores. Valida papel do operador, cliente, gestores e escopo de equipe.';

commit;
