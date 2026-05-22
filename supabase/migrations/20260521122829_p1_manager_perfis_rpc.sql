begin;

create or replace function public.manager_perfil_save(
  p_usuario_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_cliente_perfil_patch jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_allowed_keys text[] := array[
    'slug',
    'nome_completo',
    'email',
    'cpf',
    'data_nascimento',
    'endereco',
    'numero_telefone',
    'equipe_id',
    'configuracao_tema'
  ];
  v_forbidden_key text;
  v_exists boolean;
  v_allowed boolean;
  v_base_config jsonb;
  v_cliente_perfil jsonb;
  v_next_config jsonb;
  v_row public.perfis%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;

  if p_usuario_id is null then
    raise exception 'usuario_id é obrigatório.';
  end if;

  select k
    into v_forbidden_key
  from jsonb_object_keys(v_payload) as k
  where not k = any(v_allowed_keys)
  limit 1;

  if v_forbidden_key is not null then
    raise exception 'Campo não permitido em perfis: %', v_forbidden_key;
  end if;

  v_allowed := coalesce(public.is_legacy_platform_admin(), false)
    or auth.uid() = p_usuario_id
    or coalesce(public.can_manage_client(p_usuario_id), false);

  if not v_allowed then
    raise exception 'Sem permissão para alterar este perfil.';
  end if;

  select exists(select 1 from public.perfis p where p.usuario_id = p_usuario_id)
    into v_exists;

  if v_payload ? 'configuracao_tema' then
    v_base_config := coalesce(v_payload->'configuracao_tema', '{}'::jsonb);
  else
    select coalesce(p.configuracao_tema, '{}'::jsonb)
      into v_base_config
    from public.perfis p
    where p.usuario_id = p_usuario_id
    limit 1;
    v_base_config := coalesce(v_base_config, '{}'::jsonb);
  end if;

  if p_cliente_perfil_patch is not null then
    v_cliente_perfil := coalesce(v_base_config->'clientePerfil', '{}'::jsonb);
    v_next_config := v_base_config || jsonb_build_object(
      'clientePerfil',
      v_cliente_perfil || coalesce(p_cliente_perfil_patch, '{}'::jsonb)
    );
  else
    v_next_config := v_base_config;
  end if;

  if v_exists then
    update public.perfis p
    set
      slug = case when v_payload ? 'slug' then nullif(trim(v_payload->>'slug'), '') else p.slug end,
      nome_completo = case when v_payload ? 'nome_completo' then nullif(trim(v_payload->>'nome_completo'), '') else p.nome_completo end,
      email = case when v_payload ? 'email' then nullif(lower(trim(v_payload->>'email')), '') else p.email end,
      cpf = case when v_payload ? 'cpf' then nullif(trim(v_payload->>'cpf'), '') else p.cpf end,
      data_nascimento = case when v_payload ? 'data_nascimento' and nullif(v_payload->>'data_nascimento', '') is not null then (v_payload->>'data_nascimento')::date when v_payload ? 'data_nascimento' then null else p.data_nascimento end,
      endereco = case when v_payload ? 'endereco' then nullif(trim(v_payload->>'endereco'), '') else p.endereco end,
      numero_telefone = case when v_payload ? 'numero_telefone' then nullif(trim(v_payload->>'numero_telefone'), '') else p.numero_telefone end,
      equipe_id = case when v_payload ? 'equipe_id' and nullif(v_payload->>'equipe_id', '') is not null then (v_payload->>'equipe_id')::uuid when v_payload ? 'equipe_id' then null else p.equipe_id end,
      configuracao_tema = case when v_payload ? 'configuracao_tema' or p_cliente_perfil_patch is not null then v_next_config else p.configuracao_tema end
    where p.usuario_id = p_usuario_id
    returning p.* into v_row;
  else
    if not exists (select 1 from auth.users u where u.id = p_usuario_id) then
      raise exception 'Utilizador não encontrado em auth.users.';
    end if;

    if nullif(trim(v_payload->>'slug'), '') is null then
      raise exception 'slug é obrigatório para criar perfil.';
    end if;

    insert into public.perfis (
      usuario_id,
      slug,
      nome_completo,
      email,
      cpf,
      data_nascimento,
      endereco,
      numero_telefone,
      equipe_id,
      configuracao_tema
    )
    values (
      p_usuario_id,
      nullif(trim(v_payload->>'slug'), ''),
      nullif(trim(v_payload->>'nome_completo'), ''),
      nullif(lower(trim(v_payload->>'email')), ''),
      nullif(trim(v_payload->>'cpf'), ''),
      case when nullif(v_payload->>'data_nascimento', '') is not null then (v_payload->>'data_nascimento')::date else null end,
      nullif(trim(v_payload->>'endereco'), ''),
      nullif(trim(v_payload->>'numero_telefone'), ''),
      case when nullif(v_payload->>'equipe_id', '') is not null then (v_payload->>'equipe_id')::uuid else null end,
      v_next_config
    )
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'usuario_id', v_row.usuario_id,
    'slug', v_row.slug,
    'configuracao_tema', coalesce(v_row.configuracao_tema, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.manager_perfil_save(uuid, jsonb, jsonb) from public;
revoke all on function public.manager_perfil_save(uuid, jsonb, jsonb) from anon;
grant execute on function public.manager_perfil_save(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.manager_perfil_save(uuid, jsonb, jsonb) to service_role;

commit;
