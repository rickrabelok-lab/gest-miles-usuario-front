begin;

create or replace function public.admin_create_equipe(
  p_nome text,
  p_parent_id uuid default null
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
  v_nome text := nullif(trim(coalesce(p_nome, '')), '');
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'admin_equipe_unauthenticated' using errcode = '42501';
  end if;

  if v_nome is null then
    raise exception 'admin_equipe_invalid_name' using errcode = '23514';
  end if;

  select lower(trim(coalesce(p.role::text, ''))), p.equipe_id
    into v_actor_role, v_actor_equipe_id
  from public.perfis p
  where p.usuario_id = v_actor;

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin') then
    raise exception 'admin_equipe_forbidden' using errcode = '42501';
  end if;

  if v_actor_role = 'admin' and v_actor_equipe_id is not null then
    raise exception 'admin_equipe_global_admin_required' using errcode = '42501';
  end if;

  if p_parent_id is not null and not exists (select 1 from public.equipes e where e.id = p_parent_id) then
    raise exception 'admin_equipe_parent_not_found' using errcode = '23503';
  end if;

  insert into public.equipes(nome, parent_id)
  values (v_nome, p_parent_id)
  returning id into v_id;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'admin_equipe.create',
      'equipes',
      v_id::text,
      jsonb_build_object('nome', v_nome, 'parent_id', p_parent_id)
    );
  end if;

  return v_id;
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

  if v_actor_role is null or v_actor_role not in ('admin_master', 'admin', 'admin_geral', 'admin_equipe') then
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

revoke all on function public.admin_create_equipe(text, uuid) from public, anon;
grant execute on function public.admin_create_equipe(text, uuid) to authenticated, service_role;

revoke all on function public.admin_update_equipe_nome(uuid, text) from public, anon;
grant execute on function public.admin_update_equipe_nome(uuid, text) to authenticated, service_role;

commit;
