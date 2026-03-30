-- Emissões de milhas registradas pelo gestor para um cliente (resgate de voo).
create table if not exists public.emissoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references auth.users(id) on delete cascade,
  programa text not null,
  origem text not null default '',
  destino text not null default '',
  classe text not null default '',
  data_ida date,
  data_volta date,
  milhas_utilizadas numeric not null default 0 check (milhas_utilizadas >= 0),
  taxa_embarque numeric not null default 0,
  data_emissao date not null default current_date,
  usuario_responsavel uuid not null references auth.users(id) on delete restrict,
  observacoes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_emissoes_cliente_id on public.emissoes(cliente_id);
create index if not exists idx_emissoes_data_emissao on public.emissoes(data_emissao desc);
create index if not exists idx_emissoes_usuario_responsavel on public.emissoes(usuario_responsavel);

alter table public.emissoes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'emissoes' and policyname = 'emissoes_select_can_manage'
  ) then
    create policy emissoes_select_can_manage on public.emissoes
      for select using (public.can_manage_client(cliente_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'emissoes' and policyname = 'emissoes_insert_gestor_or_admin'
  ) then
    create policy emissoes_insert_gestor_or_admin on public.emissoes
      for insert
      with check (
        public.can_manage_client(cliente_id)
        and auth.uid() = usuario_responsavel
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'emissoes' and policyname = 'emissoes_update_can_manage'
  ) then
    create policy emissoes_update_can_manage on public.emissoes
      for update using (public.can_manage_client(cliente_id))
      with check (public.can_manage_client(cliente_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'emissoes' and policyname = 'emissoes_delete_can_manage'
  ) then
    create policy emissoes_delete_can_manage on public.emissoes
      for delete using (public.can_manage_client(cliente_id));
  end if;
end $$;
