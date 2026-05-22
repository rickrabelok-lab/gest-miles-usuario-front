drop policy if exists captacao_leads_anon_insert on public.captacao_leads;

create policy captacao_leads_anon_insert
on public.captacao_leads
for insert
to anon, authenticated
with check (
  nullif(trim(coalesce(slug, '')), '') is not null
  and equipe_id = public.resolver_equipe_por_captacao_slug(slug)
);
