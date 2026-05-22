begin;

do $$
begin
  if to_regprocedure('public.is_legacy_platform_admin()') is null then
    raise exception 'missing_function_public_is_legacy_platform_admin';
  end if;

  if to_regprocedure('public.can_admin_equipe(uuid)') is null then
    raise exception 'missing_function_public_can_admin_equipe';
  end if;

  if to_regclass('public.crm_receitas') is null then
    raise exception 'missing_table_public_crm_receitas';
  end if;

  if to_regclass('public.crm_despesas') is null then
    raise exception 'missing_table_public_crm_despesas';
  end if;

  if to_regclass('public.crm_fornecedores') is null then
    raise exception 'missing_table_public_crm_fornecedores';
  end if;

  if to_regclass('public.crm_funcionarios') is null then
    raise exception 'missing_table_public_crm_funcionarios';
  end if;
end;
$$;

create or replace function public.manager_crm_financeiro_save(
  p_table text,
  p_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_table text := lower(trim(coalesce(p_table, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_equipe_id uuid;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'manager_crm_unauthenticated' using errcode = '42501';
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'manager_crm_payload_must_be_object' using errcode = '23514';
  end if;

  if v_table not in ('crm_receitas', 'crm_despesas', 'crm_fornecedores', 'crm_funcionarios') then
    raise exception 'manager_crm_invalid_table' using errcode = '23514';
  end if;

  v_equipe_id := nullif(v_payload->>'equipe_id', '')::uuid;
  if v_equipe_id is null then
    raise exception 'manager_crm_missing_equipe_id' using errcode = '23514';
  end if;

  if not (public.is_legacy_platform_admin() or public.can_admin_equipe(v_equipe_id)) then
    raise exception 'manager_crm_forbidden_equipe' using errcode = '42501';
  end if;

  if v_table = 'crm_receitas' then
    if p_id is null then
      insert into public.crm_receitas(
        equipe_id, created_by, pagador_id, pagador_nome, valor, forma_pagamento,
        status, parcelas, data_lancamento, data_primeiro_vencimento, data_pagamento, detalhes
      )
      values (
        v_equipe_id,
        v_actor,
        coalesce(v_payload->>'pagador_id', ''),
        coalesce(v_payload->>'pagador_nome', ''),
        coalesce(nullif(v_payload->>'valor', '')::numeric, 0),
        coalesce(v_payload->>'forma_pagamento', 'PIX'),
        coalesce(v_payload->>'status', 'pendente'),
        coalesce(nullif(v_payload->>'parcelas', '')::integer, 0),
        coalesce(nullif(v_payload->>'data_lancamento', '')::date, current_date),
        nullif(v_payload->>'data_primeiro_vencimento', '')::date,
        nullif(v_payload->>'data_pagamento', '')::date,
        coalesce(v_payload->>'detalhes', '')
      )
      returning id into v_id;
    else
      update public.crm_receitas
      set
        pagador_id = coalesce(v_payload->>'pagador_id', ''),
        pagador_nome = coalesce(v_payload->>'pagador_nome', ''),
        valor = coalesce(nullif(v_payload->>'valor', '')::numeric, 0),
        forma_pagamento = coalesce(v_payload->>'forma_pagamento', 'PIX'),
        status = coalesce(v_payload->>'status', 'pendente'),
        parcelas = coalesce(nullif(v_payload->>'parcelas', '')::integer, 0),
        data_lancamento = coalesce(nullif(v_payload->>'data_lancamento', '')::date, current_date),
        data_primeiro_vencimento = nullif(v_payload->>'data_primeiro_vencimento', '')::date,
        data_pagamento = nullif(v_payload->>'data_pagamento', '')::date,
        detalhes = coalesce(v_payload->>'detalhes', '')
      where id = p_id
        and equipe_id = v_equipe_id
      returning id into v_id;
    end if;
  elsif v_table = 'crm_despesas' then
    if p_id is null then
      insert into public.crm_despesas(
        equipe_id, created_by, descricao, valor, categoria, fornecedor_nome,
        status, parcelas, data_lancamento, data_primeiro_vencimento, data_pagamento, detalhes
      )
      values (
        v_equipe_id,
        v_actor,
        coalesce(v_payload->>'descricao', ''),
        coalesce(nullif(v_payload->>'valor', '')::numeric, 0),
        coalesce(v_payload->>'categoria', ''),
        coalesce(v_payload->>'fornecedor_nome', ''),
        coalesce(v_payload->>'status', 'pendente'),
        coalesce(nullif(v_payload->>'parcelas', '')::integer, 1),
        coalesce(nullif(v_payload->>'data_lancamento', '')::date, current_date),
        nullif(v_payload->>'data_primeiro_vencimento', '')::date,
        nullif(v_payload->>'data_pagamento', '')::date,
        coalesce(v_payload->>'detalhes', '')
      )
      returning id into v_id;
    else
      update public.crm_despesas
      set
        descricao = coalesce(v_payload->>'descricao', ''),
        valor = coalesce(nullif(v_payload->>'valor', '')::numeric, 0),
        categoria = coalesce(v_payload->>'categoria', ''),
        fornecedor_nome = coalesce(v_payload->>'fornecedor_nome', ''),
        status = coalesce(v_payload->>'status', 'pendente'),
        parcelas = coalesce(nullif(v_payload->>'parcelas', '')::integer, 1),
        data_lancamento = coalesce(nullif(v_payload->>'data_lancamento', '')::date, current_date),
        data_primeiro_vencimento = nullif(v_payload->>'data_primeiro_vencimento', '')::date,
        data_pagamento = nullif(v_payload->>'data_pagamento', '')::date,
        detalhes = coalesce(v_payload->>'detalhes', '')
      where id = p_id
        and equipe_id = v_equipe_id
      returning id into v_id;
    end if;
  elsif v_table = 'crm_fornecedores' then
    if p_id is null then
      insert into public.crm_fornecedores(
        equipe_id, created_by, razao_social, tipo, cnpj, telefone, email, pais, cep,
        endereco, bairro, complemento, numero, estado, cidade, observacoes,
        contato_nome, contato_email, contato_telefone
      )
      values (
        v_equipe_id,
        v_actor,
        coalesce(v_payload->>'razao_social', ''),
        coalesce(v_payload->>'tipo', 'Pessoa jurídica'),
        coalesce(v_payload->>'cnpj', ''),
        coalesce(v_payload->>'telefone', ''),
        coalesce(v_payload->>'email', ''),
        coalesce(v_payload->>'pais', 'Brasil'),
        coalesce(v_payload->>'cep', ''),
        coalesce(v_payload->>'endereco', ''),
        coalesce(v_payload->>'bairro', ''),
        coalesce(v_payload->>'complemento', ''),
        coalesce(v_payload->>'numero', ''),
        coalesce(v_payload->>'estado', ''),
        coalesce(v_payload->>'cidade', ''),
        coalesce(v_payload->>'observacoes', ''),
        coalesce(v_payload->>'contato_nome', ''),
        coalesce(v_payload->>'contato_email', ''),
        coalesce(v_payload->>'contato_telefone', '')
      )
      returning id into v_id;
    else
      update public.crm_fornecedores
      set
        razao_social = coalesce(v_payload->>'razao_social', ''),
        tipo = coalesce(v_payload->>'tipo', 'Pessoa jurídica'),
        cnpj = coalesce(v_payload->>'cnpj', ''),
        telefone = coalesce(v_payload->>'telefone', ''),
        email = coalesce(v_payload->>'email', ''),
        pais = coalesce(v_payload->>'pais', 'Brasil'),
        cep = coalesce(v_payload->>'cep', ''),
        endereco = coalesce(v_payload->>'endereco', ''),
        bairro = coalesce(v_payload->>'bairro', ''),
        complemento = coalesce(v_payload->>'complemento', ''),
        numero = coalesce(v_payload->>'numero', ''),
        estado = coalesce(v_payload->>'estado', ''),
        cidade = coalesce(v_payload->>'cidade', ''),
        observacoes = coalesce(v_payload->>'observacoes', ''),
        contato_nome = coalesce(v_payload->>'contato_nome', ''),
        contato_email = coalesce(v_payload->>'contato_email', ''),
        contato_telefone = coalesce(v_payload->>'contato_telefone', '')
      where id = p_id
        and equipe_id = v_equipe_id
      returning id into v_id;
    end if;
  elsif v_table = 'crm_funcionarios' then
    if p_id is null then
      insert into public.crm_funcionarios(
        equipe_id, created_by, nome, papel, papel_exibicao, cpf, telefone, email,
        status, nascimento, pais, cep, endereco, bairro, complemento, numero,
        estado, cidade, setor
      )
      values (
        v_equipe_id,
        v_actor,
        coalesce(v_payload->>'nome', ''),
        coalesce(v_payload->>'papel', 'admin'),
        coalesce(v_payload->>'papel_exibicao', 'Administrador'),
        coalesce(v_payload->>'cpf', ''),
        coalesce(v_payload->>'telefone', ''),
        coalesce(v_payload->>'email', ''),
        coalesce(v_payload->>'status', 'ativo'),
        coalesce(v_payload->>'nascimento', ''),
        coalesce(v_payload->>'pais', 'Brasil'),
        coalesce(v_payload->>'cep', ''),
        coalesce(v_payload->>'endereco', ''),
        coalesce(v_payload->>'bairro', ''),
        coalesce(v_payload->>'complemento', ''),
        coalesce(v_payload->>'numero', ''),
        coalesce(v_payload->>'estado', ''),
        coalesce(v_payload->>'cidade', ''),
        coalesce(v_payload->>'setor', '')
      )
      returning id into v_id;
    else
      update public.crm_funcionarios
      set
        nome = coalesce(v_payload->>'nome', ''),
        papel = coalesce(v_payload->>'papel', 'admin'),
        papel_exibicao = coalesce(v_payload->>'papel_exibicao', 'Administrador'),
        cpf = coalesce(v_payload->>'cpf', ''),
        telefone = coalesce(v_payload->>'telefone', ''),
        email = coalesce(v_payload->>'email', ''),
        status = coalesce(v_payload->>'status', 'ativo'),
        nascimento = coalesce(v_payload->>'nascimento', ''),
        pais = coalesce(v_payload->>'pais', 'Brasil'),
        cep = coalesce(v_payload->>'cep', ''),
        endereco = coalesce(v_payload->>'endereco', ''),
        bairro = coalesce(v_payload->>'bairro', ''),
        complemento = coalesce(v_payload->>'complemento', ''),
        numero = coalesce(v_payload->>'numero', ''),
        estado = coalesce(v_payload->>'estado', ''),
        cidade = coalesce(v_payload->>'cidade', ''),
        setor = coalesce(v_payload->>'setor', '')
      where id = p_id
        and equipe_id = v_equipe_id
      returning id into v_id;
    end if;
  end if;

  if v_id is null then
    raise exception 'manager_crm_row_not_found_or_forbidden' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.manager_crm_financeiro_save(text, uuid, jsonb) from public, anon;
grant execute on function public.manager_crm_financeiro_save(text, uuid, jsonb) to authenticated, service_role;

create or replace function public.manager_crm_financeiro_delete(
  p_table text,
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_table text := lower(trim(coalesce(p_table, '')));
  v_equipe_id uuid;
  v_deleted_id uuid;
begin
  if v_actor is null then
    raise exception 'manager_crm_unauthenticated' using errcode = '42501';
  end if;

  if p_id is null then
    raise exception 'manager_crm_missing_id' using errcode = '23514';
  end if;

  if v_table not in ('crm_receitas', 'crm_despesas', 'crm_fornecedores', 'crm_funcionarios') then
    raise exception 'manager_crm_invalid_table' using errcode = '23514';
  end if;

  if v_table = 'crm_receitas' then
    select equipe_id into v_equipe_id from public.crm_receitas where id = p_id;
  elsif v_table = 'crm_despesas' then
    select equipe_id into v_equipe_id from public.crm_despesas where id = p_id;
  elsif v_table = 'crm_fornecedores' then
    select equipe_id into v_equipe_id from public.crm_fornecedores where id = p_id;
  elsif v_table = 'crm_funcionarios' then
    select equipe_id into v_equipe_id from public.crm_funcionarios where id = p_id;
  end if;

  if v_equipe_id is null then
    raise exception 'manager_crm_row_not_found' using errcode = 'P0002';
  end if;

  if not (public.is_legacy_platform_admin() or public.can_admin_equipe(v_equipe_id)) then
    raise exception 'manager_crm_forbidden_equipe' using errcode = '42501';
  end if;

  if v_table = 'crm_receitas' then
    delete from public.crm_receitas where id = p_id returning id into v_deleted_id;
  elsif v_table = 'crm_despesas' then
    delete from public.crm_despesas where id = p_id returning id into v_deleted_id;
  elsif v_table = 'crm_fornecedores' then
    delete from public.crm_fornecedores where id = p_id returning id into v_deleted_id;
  elsif v_table = 'crm_funcionarios' then
    delete from public.crm_funcionarios where id = p_id returning id into v_deleted_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_deleted_id);
end;
$$;

revoke all on function public.manager_crm_financeiro_delete(text, uuid) from public, anon;
grant execute on function public.manager_crm_financeiro_delete(text, uuid) to authenticated, service_role;

commit;
