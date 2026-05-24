begin;

do $$
begin
  if to_regclass('public.preferencias_usuario') is null then
    raise exception 'missing dependency: public.preferencias_usuario';
  end if;
  if to_regclass('public.alertas_dismissals') is null then
    raise exception 'missing dependency: public.alertas_dismissals';
  end if;
  if to_regprocedure('public.can_manage_client(uuid)') is null then
    raise exception 'missing dependency: public.can_manage_client(uuid)';
  end if;
end $$;

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

  insert into public.preferencias_usuario (
    usuario_id,
    preferencia_destino,
    preferencia_classe,
    updated_at
  )
  values (
    v_target_usuario_id,
    v_destinos,
    v_classe,
    now()
  )
  on conflict (usuario_id) do update
  set
    preferencia_destino = excluded.preferencia_destino,
    preferencia_classe = excluded.preferencia_classe,
    updated_at = now()
  where public.preferencias_usuario.usuario_id = v_target_usuario_id;

  return jsonb_build_object('ok', true, 'usuario_id', v_target_usuario_id);
end;
$$;

create or replace function public.manager_alerta_dismiss(
  p_alerta_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_alerta_id text := nullif(trim(coalesce(p_alerta_id, '')), '');
begin
  if v_actor is null then
    raise exception 'manager_alerta_dismiss_unauthenticated' using errcode = '42501';
  end if;

  if v_alerta_id is null or length(v_alerta_id) > 160 then
    raise exception 'manager_alerta_dismiss_invalid_alerta' using errcode = '23514';
  end if;

  insert into public.alertas_dismissals (
    usuario_id,
    alerta_id,
    dismissed_at
  )
  values (
    v_actor,
    v_alerta_id,
    now()
  )
  on conflict (usuario_id, alerta_id) do update
  set dismissed_at = now()
  where public.alertas_dismissals.usuario_id = v_actor
    and public.alertas_dismissals.alerta_id = v_alerta_id;

  return jsonb_build_object('ok', true, 'alerta_id', v_alerta_id);
end;
$$;

revoke all on function public.manager_preferencias_sugestoes_save(uuid, text[], text) from public, anon;
revoke all on function public.manager_alerta_dismiss(text) from public, anon;

grant execute on function public.manager_preferencias_sugestoes_save(uuid, text[], text) to authenticated, service_role;
grant execute on function public.manager_alerta_dismiss(text) to authenticated, service_role;

comment on function public.manager_preferencias_sugestoes_save(uuid, text[], text) is
  'Manager salva preferencias Smart Award do proprio usuario ou de cliente gerenciavel via RPC.';

comment on function public.manager_alerta_dismiss(text) is
  'Manager marca alerta calculado da UI como resolvido para o usuario autenticado via RPC.';

commit;
