begin;

do $$
begin
  if to_regclass('public.captacao_leads') is null then
    raise exception 'missing_table_public_captacao_leads';
  end if;
end;
$$;

-- Public capture pages can run with an existing authenticated session on the
-- manager domain. Keep INSERT available for that case; RLS still scopes writes.
grant insert on table public.captacao_leads to authenticated;

commit;
