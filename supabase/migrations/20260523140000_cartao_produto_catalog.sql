-- Catálogo de nomes "Cartão / produto" (opcional no painel; reforçado com lista estática no app).
-- UI de gestão do catálogo é provisória; ao removê-la, os dados nesta tabela e nos perfis dos clientes permanecem.

create table if not exists public.cartao_produto_catalog (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create unique index if not exists cartao_produto_catalog_nome_lower_idx
  on public.cartao_produto_catalog (lower(nome));

comment on table public.cartao_produto_catalog is
  'Nomes de produto de cartão oferecidos no perfil; complementa a lista estática no frontend.';

create or replace function public.cartao_produto_catalog_normalize_nome()
returns trigger
language plpgsql
as $$
begin
  new.nome := trim(new.nome);
  if new.nome = '' then
    raise exception 'cartao_produto_catalog: nome nao pode ser vazio';
  end if;
  if length(new.nome) > 200 then
    raise exception 'cartao_produto_catalog: nome muito longo';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cartao_produto_catalog_normalize on public.cartao_produto_catalog;
create trigger trg_cartao_produto_catalog_normalize
  before insert or update of nome on public.cartao_produto_catalog
  for each row
  execute function public.cartao_produto_catalog_normalize_nome();

alter table public.cartao_produto_catalog enable row level security;

-- Leitura: contas com perfil operacional (incl. gestor, CS, admin, admin equipe, admin global).
create policy "cartao_produto_catalog_select_operacional"
  on public.cartao_produto_catalog
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role in (
          'gestor', 'cs', 'admin', 'admin_equipe', 'admin_master',
          'admin_geral'
        )
    )
  );

-- Escrita: admin da equipe ou administradores.
create policy "cartao_produto_catalog_insert_staff_catalogo"
  on public.cartao_produto_catalog
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role in ('admin_equipe', 'admin', 'admin_master', 'admin_geral')
    )
  );

create policy "cartao_produto_catalog_update_staff_catalogo"
  on public.cartao_produto_catalog
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role in ('admin_equipe', 'admin', 'admin_master', 'admin_geral')
    )
  )
  with check (
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role in ('admin_equipe', 'admin', 'admin_master', 'admin_geral')
    )
  );

create policy "cartao_produto_catalog_delete_staff_catalogo"
  on public.cartao_produto_catalog
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.perfis p
      where p.usuario_id = auth.uid()
        and p.role in ('admin_equipe', 'admin', 'admin_master', 'admin_geral')
    )
  );
