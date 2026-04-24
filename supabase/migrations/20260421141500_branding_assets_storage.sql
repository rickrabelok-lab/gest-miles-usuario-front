-- Branding global (Gestor + Admin): logos rail/wordmark, logos de companhias, imagens de destinos.
-- Colunas em pesquisa_passagens_config + bucket público branding-assets (RLS: só admin_master escreve).

alter table if exists public.pesquisa_passagens_config
  add column if not exists brand_assets jsonb not null default '{}'::jsonb,
  add column if not exists airline_logos jsonb not null default '{}'::jsonb;

insert into public.pesquisa_passagens_config (id)
values (1)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('branding-assets', 'branding-assets', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists branding_assets_public_read on storage.objects;
create policy branding_assets_public_read on storage.objects
  for select
  to public
  using (bucket_id = 'branding-assets');

drop policy if exists branding_assets_admin_master_insert on storage.objects;
create policy branding_assets_admin_master_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'branding-assets'
    and exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and lower(trim(coalesce(p.role, ''))) = 'admin_master'
    )
  );

drop policy if exists branding_assets_admin_master_update on storage.objects;
create policy branding_assets_admin_master_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'branding-assets'
    and exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and lower(trim(coalesce(p.role, ''))) = 'admin_master'
    )
  )
  with check (
    bucket_id = 'branding-assets'
    and exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and lower(trim(coalesce(p.role, ''))) = 'admin_master'
    )
  );

drop policy if exists branding_assets_admin_master_delete on storage.objects;
create policy branding_assets_admin_master_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'branding-assets'
    and exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and lower(trim(coalesce(p.role, ''))) = 'admin_master'
    )
  );
