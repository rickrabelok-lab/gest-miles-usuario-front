begin;

do $$
begin
  if to_regclass('public.cartao_produto_catalog') is null then
    raise exception 'missing_table_public_cartao_produto_catalog';
  end if;
end;
$$;

create or replace function public.manager_cartao_produto_catalog_can_manage()
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.perfis p
    where p.usuario_id = auth.uid()
      and p.role = any (array['admin_equipe', 'admin', 'admin_master', 'admin_geral'])
  );
$$;

create or replace function public.manager_cartao_produto_catalog_add(p_nome text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_nome text := nullif(trim(p_nome), '');
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'manager_cartao_produto_catalog_unauthenticated' using errcode = '42501';
  end if;

  if not public.manager_cartao_produto_catalog_can_manage() then
    raise exception 'manager_cartao_produto_catalog_forbidden' using errcode = '42501';
  end if;

  if v_nome is null or length(v_nome) < 2 or length(v_nome) > 200 then
    raise exception 'manager_cartao_produto_catalog_invalid_nome' using errcode = '23514';
  end if;

  insert into public.cartao_produto_catalog(nome, created_by)
  values (v_nome, v_actor)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.manager_cartao_produto_catalog_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'manager_cartao_produto_catalog_unauthenticated' using errcode = '42501';
  end if;

  if not public.manager_cartao_produto_catalog_can_manage() then
    raise exception 'manager_cartao_produto_catalog_forbidden' using errcode = '42501';
  end if;

  delete from public.cartao_produto_catalog
  where id = p_id;

  if not found then
    raise exception 'manager_cartao_produto_catalog_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

revoke all on function public.manager_cartao_produto_catalog_can_manage() from public, anon;
revoke all on function public.manager_cartao_produto_catalog_can_manage() from authenticated, service_role;
revoke all on function public.manager_cartao_produto_catalog_add(text) from public, anon;
revoke all on function public.manager_cartao_produto_catalog_delete(uuid) from public, anon;
grant execute on function public.manager_cartao_produto_catalog_add(text) to authenticated, service_role;
grant execute on function public.manager_cartao_produto_catalog_delete(uuid) to authenticated, service_role;

commit;
