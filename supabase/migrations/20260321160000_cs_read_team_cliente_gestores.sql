-- CS: permitir ler vínculos cliente↔gestor dos gestores da equipe (dashboard /cs, useCsGestores).
-- Antes só existia SELECT para gestor_id = auth.uid() | cliente_id = auth.uid(), então o CS
-- recebia "permission denied" / erro PostgREST ao buscar cliente_gestores por gestor_id.
--
-- can_cs_view_client: SECURITY DEFINER para subconsultas em cliente_gestores/gestor_clientes
-- não ficarem presas no RLS (padrão Supabase para funções usadas em policies).

create or replace function public.can_cs_view_client(target_cliente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_admin()
    or exists (
      select 1
      from public.cs_gestores cg
      inner join public.cliente_gestores cg2 on cg2.gestor_id = cg.gestor_id
      where cg.cs_id = auth.uid()
        and cg2.cliente_id = target_cliente_id
    )
    or exists (
      select 1
      from public.cs_gestores cg
      inner join public.gestor_clientes gc on gc.gestor_id = cg.gestor_id
      where cg.cs_id = auth.uid()
        and gc.cliente_id = target_cliente_id
    ),
    false
  );
$$;

grant execute on function public.can_cs_view_client(uuid) to authenticated;

drop policy if exists cliente_gestores_select_cs_team on public.cliente_gestores;
create policy cliente_gestores_select_cs_team on public.cliente_gestores
  for select
  using (
    exists (
      select 1
      from public.cs_gestores cg
      where cg.cs_id = auth.uid()
        and cg.gestor_id = gestor_id
    )
  );

-- gestor_clientes é opcional (alguns projetos só usam cliente_gestores)
do $m$
begin
  if to_regclass('public.gestor_clientes') is not null then
    execute 'drop policy if exists gestor_clientes_select_cs_team on public.gestor_clientes';
    execute 'create policy gestor_clientes_select_cs_team on public.gestor_clientes
      for select
      using (
        exists (
          select 1
          from public.cs_gestores cg
          where cg.cs_id = auth.uid()
            and cg.gestor_id = gestor_id
        )
      )';
  end if;
end $m$;
