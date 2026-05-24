begin;

do $$
begin
  if to_regclass('public.preferencias_usuario') is null then
    raise exception 'missing dependency: public.preferencias_usuario';
  end if;

  if to_regprocedure('public.can_manage_client(uuid)') is null then
    raise exception 'missing dependency: public.can_manage_client(uuid)';
  end if;
end $$;

alter table public.preferencias_usuario
  add column if not exists preferencias jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'preferencias_usuario'
      and column_name = 'preferencia_destino'
  ) or exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'preferencias_usuario'
      and column_name = 'preferencia_classe'
  ) then
    execute $sql$
      update public.preferencias_usuario
      set preferencias = coalesce(preferencias, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'preferencia_destino',
          case
            when to_jsonb(preferencia_destino) = 'null'::jsonb then null
            else to_jsonb(preferencia_destino)
          end,
          'preferencia_classe',
          preferencia_classe
        ))
      where coalesce(preferencias, '{}'::jsonb) = '{}'::jsonb
    $sql$;
  end if;
end $$;

create or replace function public.cliente_preferencias_sugestoes_save_self(
  p_preferencia_destino text[],
  p_preferencia_classe text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_destinos text[] := coalesce(p_preferencia_destino, array[]::text[]);
  v_classe text := nullif(trim(coalesce(p_preferencia_classe, '')), '');
  v_destino text;
  v_preferencias jsonb;
begin
  if v_actor is null then
    raise exception 'preferencias_sugestoes_unauthenticated' using errcode = '42501';
  end if;

  if v_classe is null or v_classe not in ('Todas', 'Executiva', 'Econômica', 'Primeira Classe') then
    raise exception 'preferencias_sugestoes_invalid_classe' using errcode = '23514';
  end if;

  if array_length(v_destinos, 1) is null then
    v_destinos := array['Todos']::text[];
  end if;

  foreach v_destino in array v_destinos loop
    if v_destino not in (
      'Todos',
      'Brasil',
      'Sudeste',
      'Nordeste',
      'Centro-Oeste',
      'Sul',
      'América do Sul',
      'Estados Unidos',
      'América do Norte',
      'Europa',
      'Oriente Médio',
      'Ásia',
      'África',
      'Oceania'
    ) then
      raise exception 'preferencias_sugestoes_invalid_destino:%', v_destino using errcode = '23514';
    end if;
  end loop;

  v_preferencias := jsonb_build_object(
    'preferencia_destino', to_jsonb(v_destinos),
    'preferencia_classe', v_classe
  );

  insert into public.preferencias_usuario (
    usuario_id,
    preferencias,
    updated_at
  )
  values (
    v_actor,
    v_preferencias,
    now()
  )
  on conflict (usuario_id) do update
  set
    preferencias = coalesce(public.preferencias_usuario.preferencias, '{}'::jsonb) || excluded.preferencias,
    updated_at = now()
  where public.preferencias_usuario.usuario_id = v_actor;

  return jsonb_build_object('ok', true, 'usuario_id', v_actor);
end;
$$;

create or replace function public.manager_preferencias_sugestoes_save(
  p_usuario_id uuid,
  p_preferencia_destino text[],
  p_preferencia_classe text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_target_usuario_id uuid := coalesce(p_usuario_id, auth.uid());
  v_destinos text[] := coalesce(p_preferencia_destino, array[]::text[]);
  v_classe text := nullif(trim(coalesce(p_preferencia_classe, '')), '');
  v_destino text;
  v_preferencias jsonb;
begin
  if v_actor is null then
    raise exception 'manager_preferencias_sugestoes_unauthenticated' using errcode = '42501';
  end if;

  if v_target_usuario_id is null then
    raise exception 'manager_preferencias_sugestoes_invalid_usuario' using errcode = '23514';
  end if;

  if v_actor is distinct from v_target_usuario_id
     and not coalesce(public.can_manage_client(v_target_usuario_id), false) then
    raise exception 'manager_preferencias_sugestoes_forbidden' using errcode = '42501';
  end if;

  if v_classe is null or v_classe not in ('Todas', 'Executiva', 'Econômica', 'Primeira Classe') then
    raise exception 'manager_preferencias_sugestoes_invalid_classe' using errcode = '23514';
  end if;

  if array_length(v_destinos, 1) is null then
    v_destinos := array['Todos']::text[];
  end if;

  foreach v_destino in array v_destinos loop
    if v_destino not in (
      'Todos',
      'Brasil',
      'Sudeste',
      'Nordeste',
      'Centro-Oeste',
      'Sul',
      'América do Sul',
      'Estados Unidos',
      'América do Norte',
      'Europa',
      'Oriente Médio',
      'Ásia',
      'África',
      'Oceania'
    ) then
      raise exception 'manager_preferencias_sugestoes_invalid_destino:%', v_destino using errcode = '23514';
    end if;
  end loop;

  v_preferencias := jsonb_build_object(
    'preferencia_destino', to_jsonb(v_destinos),
    'preferencia_classe', v_classe
  );

  insert into public.preferencias_usuario (
    usuario_id,
    preferencias,
    updated_at
  )
  values (
    v_target_usuario_id,
    v_preferencias,
    now()
  )
  on conflict (usuario_id) do update
  set
    preferencias = coalesce(public.preferencias_usuario.preferencias, '{}'::jsonb) || excluded.preferencias,
    updated_at = now()
  where public.preferencias_usuario.usuario_id = v_target_usuario_id;

  return jsonb_build_object('ok', true, 'usuario_id', v_target_usuario_id);
end;
$$;

revoke all on function public.cliente_preferencias_sugestoes_save_self(text[], text) from public, anon;
grant execute on function public.cliente_preferencias_sugestoes_save_self(text[], text) to authenticated, service_role;

revoke all on function public.manager_preferencias_sugestoes_save(uuid, text[], text) from public, anon;
grant execute on function public.manager_preferencias_sugestoes_save(uuid, text[], text) to authenticated, service_role;

comment on function public.cliente_preferencias_sugestoes_save_self(text[], text) is
  'Cliente autenticado salva preferencias de sugestoes Smart Award em preferencias_usuario.preferencias jsonb.';

comment on function public.manager_preferencias_sugestoes_save(uuid, text[], text) is
  'Manager salva preferencias Smart Award do proprio usuario ou de cliente gerenciavel em preferencias_usuario.preferencias jsonb.';

commit;
