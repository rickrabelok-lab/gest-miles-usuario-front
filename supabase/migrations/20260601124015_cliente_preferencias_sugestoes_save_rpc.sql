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

  insert into public.preferencias_usuario (
    usuario_id,
    preferencia_destino,
    preferencia_classe,
    updated_at
  )
  values (
    v_actor,
    v_destinos,
    v_classe,
    now()
  )
  on conflict (usuario_id) do update
  set
    preferencia_destino = excluded.preferencia_destino,
    preferencia_classe = excluded.preferencia_classe,
    updated_at = now()
  where public.preferencias_usuario.usuario_id = v_actor;

  return jsonb_build_object('ok', true, 'usuario_id', v_actor);
end;
$$;

revoke all on function public.cliente_preferencias_sugestoes_save_self(text[], text) from public;
revoke all on function public.cliente_preferencias_sugestoes_save_self(text[], text) from anon;
grant execute on function public.cliente_preferencias_sugestoes_save_self(text[], text) to authenticated;
grant execute on function public.cliente_preferencias_sugestoes_save_self(text[], text) to service_role;

comment on function public.cliente_preferencias_sugestoes_save_self(text[], text) is
  'Cliente autenticado salva apenas as proprias preferencias de sugestoes Smart Award via RPC.';
