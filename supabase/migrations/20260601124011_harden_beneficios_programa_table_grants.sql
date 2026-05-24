begin;

do $$
begin
  if to_regclass('public.beneficios_programa_cliente') is null then
    raise exception 'missing_table_public_beneficios_programa_cliente';
  end if;
end;
$$;

revoke all privileges on table public.beneficios_programa_cliente from anon;
revoke all privileges on table public.beneficios_programa_cliente from authenticated;

grant select on table public.beneficios_programa_cliente to authenticated;
grant all privileges on table public.beneficios_programa_cliente to service_role;

commit;

