-- Permite que usuários com role CS leiam (e atualizem demandas de) clientes
-- vinculados a gestores atribuídos em public.cs_gestores.
-- Rode no Supabase SQL Editor ou via CLI de migrations.

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

-- programas_cliente
drop policy if exists programas_cliente_select_cs_supervision on public.programas_cliente;
create policy programas_cliente_select_cs_supervision on public.programas_cliente
  for select
  using (public.can_cs_view_client(cliente_id));

-- movimentos_programa
drop policy if exists movimentos_programa_select_cs_supervision on public.movimentos_programa;
create policy movimentos_programa_select_cs_supervision on public.movimentos_programa
  for select
  using (public.can_cs_view_client(cliente_id));

-- lotes_programa
drop policy if exists lotes_programa_select_cs_supervision on public.lotes_programa;
create policy lotes_programa_select_cs_supervision on public.lotes_programa
  for select
  using (public.can_cs_view_client(cliente_id));

-- demandas_cliente
drop policy if exists demandas_cliente_select_cs_supervision on public.demandas_cliente;
create policy demandas_cliente_select_cs_supervision on public.demandas_cliente
  for select
  using (public.can_cs_view_client(cliente_id));

drop policy if exists demandas_cliente_update_cs_supervision on public.demandas_cliente;
create policy demandas_cliente_update_cs_supervision on public.demandas_cliente
  for update
  using (public.can_cs_view_client(cliente_id))
  with check (public.can_cs_view_client(cliente_id));

-- logs_acoes: CS vê ações registradas pelos gestores supervisionados
drop policy if exists logs_acoes_select_cs_supervision on public.logs_acoes;
create policy logs_acoes_select_cs_supervision on public.logs_acoes
  for select
  using (
    exists (
      select 1
      from public.cs_gestores cg
      where cg.cs_id = auth.uid()
        and cg.gestor_id = logs_acoes.user_id
    )
  );
