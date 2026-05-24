create or replace function public.cliente_perfil_save_self(
  p_nome_completo text,
  p_email_contato text,
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
  v_nome text := nullif(trim(coalesce(p_nome_completo, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email_contato, ''))), '');
  v_slug text := nullif(trim(coalesce(p_slug, '')), '');
  v_cliente_perfil jsonb := coalesce(p_cliente_perfil, '{}'::jsonb);
  v_existing_config jsonb := '{}'::jsonb;
  v_next_config jsonb;
  v_forbidden_key text;
  v_created boolean := false;
begin
  if v_actor is null then
    raise exception 'cliente_perfil_unauthenticated' using errcode = '42501';
  end if;

  if v_nome is null or v_slug is null or jsonb_typeof(v_cliente_perfil) <> 'object' then
    raise exception 'cliente_perfil_invalid_input' using errcode = '23514';
  end if;

  select k
    into v_forbidden_key
  from jsonb_object_keys(v_cliente_perfil) as k
  where k not in (
    'cpf',
    'rg',
    'dataNascimento',
    'emailContato',
    'passaporte',
    'informacoesFamiliares',
    'endereco',
    'inicioGestao',
    'planoAcao',
    'cartaoPrincipal',
    'hub',
    'clubesAssinados',
    'gestoresResponsaveis',
    'pauta'
  )
  limit 1;

  if v_forbidden_key is not null then
    raise exception 'cliente_perfil_forbidden_key:%', v_forbidden_key using errcode = '23514';
  end if;

  if v_cliente_perfil ? 'planoAcao' and jsonb_typeof(v_cliente_perfil->'planoAcao') <> 'object' then
    raise exception 'cliente_perfil_invalid_plano_acao' using errcode = '23514';
  end if;

  v_cliente_perfil := v_cliente_perfil - 'acessos';

  select coalesce(p.configuracao_tema, '{}'::jsonb)
    into v_existing_config
  from public.perfis p
  where p.usuario_id = v_actor
  for update;

  v_next_config := coalesce(v_existing_config, '{}'::jsonb)
    || jsonb_build_object('clientePerfil', v_cliente_perfil);

  update public.perfis p
     set nome_completo = v_nome,
         email = v_email,
         configuracao_tema = v_next_config
   where p.usuario_id = v_actor;

  if not found then
    if not exists (select 1 from auth.users u where u.id = v_actor) then
      raise exception 'cliente_perfil_auth_user_not_found' using errcode = '23503';
    end if;

    insert into public.perfis(usuario_id, slug, nome_completo, role, email, configuracao_tema)
    values (v_actor, v_slug, v_nome, 'cliente', v_email, v_next_config);

    v_created := true;
  end if;

  if to_regclass('public.logs_acoes') is not null then
    insert into public.logs_acoes(user_id, tipo_acao, entidade_afetada, entidade_id, details)
    values (
      v_actor,
      'cliente_perfil.save_self',
      'perfis',
      v_actor::text,
      jsonb_build_object('created', v_created)
    );
  end if;

  return jsonb_build_object('ok', true, 'usuario_id', v_actor, 'created', v_created);
end;
$$;

revoke all on function public.cliente_perfil_save_self(text, text, text, jsonb) from public;
revoke all on function public.cliente_perfil_save_self(text, text, text, jsonb) from anon;
grant execute on function public.cliente_perfil_save_self(text, text, text, jsonb) to authenticated;
grant execute on function public.cliente_perfil_save_self(text, text, text, jsonb) to service_role;

comment on function public.cliente_perfil_save_self(text, text, text, jsonb) is
  'Cliente autenticado salva apenas o proprio perfil via RPC com whitelist de clientePerfil e sem acessos/credenciais.';
