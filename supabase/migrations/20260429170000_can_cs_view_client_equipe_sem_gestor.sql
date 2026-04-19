-- CS deve ver clientes `cliente_gestao` da mesma equipe mesmo sem linha em `cliente_gestores`
-- (import JSON com semVinculoGestores). Sem isto, `can_cs_view_client` só permitia via gestor.

create or replace function public.can_cs_view_client(target_cliente_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_legacy_platform_admin() then
    return true;
  end if;

  if public.team_admin_sees_user(target_cliente_id) then
    return true;
  end if;

  if exists (
    select 1
    from public.perfis pcs
    join public.perfis pgest on pgest.equipe_id is not distinct from pcs.equipe_id and pgest.role = 'gestor'
    join public.cliente_gestores cg2 on cg2.gestor_id = pgest.usuario_id
    where pcs.usuario_id = auth.uid()
      and pcs.role = 'cs'
      and pcs.equipe_id is not null
      and cg2.cliente_id = target_cliente_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.cs_gestores cg
    join public.cliente_gestores cg2 on cg2.gestor_id = cg.gestor_id
    where cg.cs_id = auth.uid()
      and cg2.cliente_id = target_cliente_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.equipe_cs ec
    join public.equipe_gestores eg on eg.equipe_id = ec.equipe_id
    join public.cliente_gestores cg2 on cg2.gestor_id = eg.gestor_id
    where ec.cs_id = auth.uid()
      and cg2.cliente_id = target_cliente_id
  ) then
    return true;
  end if;

  if to_regclass('public.gestor_clientes') is not null then
    if exists (
      select 1
      from public.cs_gestores cg
      join public.gestor_clientes gc on gc.gestor_id = cg.gestor_id
      where cg.cs_id = auth.uid()
        and gc.cliente_id = target_cliente_id
    ) then
      return true;
    end if;
    if exists (
      select 1
      from public.equipe_cs ec
      join public.equipe_gestores eg on eg.equipe_id = ec.equipe_id
      join public.gestor_clientes gc on gc.gestor_id = eg.gestor_id
      where ec.cs_id = auth.uid()
        and gc.cliente_id = target_cliente_id
    ) then
      return true;
    end if;
  end if;

  -- Mesma equipe operacional que o CS (perfis.equipe_id), cliente ainda sem gestor vinculado.
  if exists (
    select 1
    from public.perfis p_cli
    join public.perfis p_me on p_me.usuario_id = auth.uid()
      and p_me.role = 'cs'
      and p_me.equipe_id is not null
      and p_cli.equipe_id = p_me.equipe_id
    where p_cli.usuario_id = target_cliente_id
      and p_cli.role = 'cliente_gestao'
  ) then
    return true;
  end if;

  -- CS listado só em equipe_cs (perfis.equipe_id null) — mesma equipe que o cliente.
  if exists (
    select 1
    from public.perfis p_cli
    join public.equipe_cs ec on ec.equipe_id = p_cli.equipe_id and ec.cs_id = auth.uid()
    where p_cli.usuario_id = target_cliente_id
      and p_cli.role = 'cliente_gestao'
      and p_cli.equipe_id is not null
  ) then
    return true;
  end if;

  return false;
end;
$$;

comment on function public.can_cs_view_client(uuid) is
  'CS vê cliente via gestores supervisionados ou cliente_gestao na mesma equipe (import sem vínculo).';
