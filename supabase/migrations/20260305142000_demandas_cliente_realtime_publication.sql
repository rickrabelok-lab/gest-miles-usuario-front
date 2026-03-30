-- Enable realtime INSERT events for demandas_cliente.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'demandas_cliente'
  ) then
    execute 'alter publication supabase_realtime add table public.demandas_cliente';
  end if;
end $$;
