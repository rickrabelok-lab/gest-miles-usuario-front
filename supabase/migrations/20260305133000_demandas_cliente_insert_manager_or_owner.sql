-- Allow gestor/admin to open demands for managed clients as well.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'demandas_cliente'
      and policyname = 'demandas_cliente_insert_manager_or_owner'
  ) then
    create policy demandas_cliente_insert_manager_or_owner
      on public.demandas_cliente
      for insert
      with check (public.can_manage_client(cliente_id));
  end if;
end $$;
