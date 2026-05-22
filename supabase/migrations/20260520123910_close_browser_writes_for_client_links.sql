begin;

do $$
declare
  v_policy text;
begin
  if to_regclass('public.cliente_gestores') is not null then
    foreach v_policy in array array[
      'cliente_gestores_insert',
      'cliente_gestores_insert_cs',
      'cliente_gestores_insert_staff',
      'cliente_gestores_insert_scoped',
      'cliente_gestores_update',
      'cliente_gestores_update_scoped',
      'cliente_gestores_delete',
      'cliente_gestores_delete_cs',
      'cliente_gestores_delete_admin_equipe',
      'cliente_gestores_delete_scoped'
    ] loop
      execute format('drop policy if exists %I on public.cliente_gestores', v_policy);
    end loop;

    revoke insert, update, delete on table public.cliente_gestores from public, anon, authenticated;
  end if;

  if to_regclass('public.cliente_cs') is not null then
    foreach v_policy in array array[
      'cliente_cs_insert_admin_panel',
      'cliente_cs_insert_scoped',
      'cliente_cs_update_admin_panel',
      'cliente_cs_update_scoped',
      'cliente_cs_delete_admin_panel',
      'cliente_cs_delete_scoped'
    ] loop
      execute format('drop policy if exists %I on public.cliente_cs', v_policy);
    end loop;

    revoke insert, update, delete on table public.cliente_cs from public, anon, authenticated;
  end if;

  if to_regclass('public.gestor_funcoes') is not null then
    foreach v_policy in array array[
      'gestor_funcoes_insert_scoped',
      'gestor_funcoes_update_scoped',
      'gestor_funcoes_delete_scoped'
    ] loop
      execute format('drop policy if exists %I on public.gestor_funcoes', v_policy);
    end loop;

    revoke insert, update, delete on table public.gestor_funcoes from public, anon, authenticated;
  end if;

  if to_regclass('public.equipe_clientes') is not null then
    foreach v_policy in array array[
      'equipe_clientes_insert_admin_cs',
      'equipe_clientes_update_participantes',
      'equipe_clientes_delete_admin'
    ] loop
      execute format('drop policy if exists %I on public.equipe_clientes', v_policy);
    end loop;

    revoke insert, update, delete on table public.equipe_clientes from public, anon, authenticated;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.cliente_gestores') is not null then
    comment on table public.cliente_gestores is
      'Vinculos cliente-gestor. Writes de browser bloqueados; usar RPCs SECURITY DEFINER validadas.';
  end if;
end;
$$;

commit;
