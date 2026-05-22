-- Wave 1: admin_planos_config, admin_feature_flags, registrar_emissao_atomico
-- Executar no Supabase SQL Editor (Dashboard → SQL Editor → New query)

begin;

-- ── Admin: catálogo de planos ─────────────────────────────────────────────
create table if not exists public.admin_planos_config (
  id           uuid primary key default gen_random_uuid(),
  payload      jsonb not null default '[]'::jsonb,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.admin_planos_config enable row level security;

drop policy if exists "admin_planos_config_master_all" on public.admin_planos_config;
create policy "admin_planos_config_master_all"
  on public.admin_planos_config
  for all
  using (
    exists (
      select 1 from public.perfis
      where usuario_id = auth.uid() and role = 'master'
    )
  );

-- ── Admin: feature flags ──────────────────────────────────────────────────
create table if not exists public.admin_feature_flags (
  id           uuid primary key default gen_random_uuid(),
  payload      jsonb not null default '{"flags":[],"overrides":[]}'::jsonb,
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now()
);

alter table public.admin_feature_flags enable row level security;

drop policy if exists "admin_feature_flags_master_all" on public.admin_feature_flags;
create policy "admin_feature_flags_master_all"
  on public.admin_feature_flags
  for all
  using (
    exists (
      select 1 from public.perfis
      where usuario_id = auth.uid() and role = 'master'
    )
  );

-- ── RPC: emissão atômica ──────────────────────────────────────────────────
-- Insert em emissoes + update em programas_cliente na mesma transação.
create or replace function public.registrar_emissao_atomico(
  p_cliente_id          uuid,
  p_programa            text,
  p_origem              text,
  p_destino             text,
  p_classe              text,
  p_data_ida            date,
  p_data_volta          date,
  p_milhas_utilizadas   integer,
  p_taxa_embarque       numeric,
  p_data_emissao        date,
  p_usuario_responsavel uuid,
  p_observacoes         text,
  p_programa_cliente_id uuid,
  p_novo_saldo          integer,
  p_novo_state          jsonb
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.emissoes (
    cliente_id, programa, origem, destino, classe,
    data_ida, data_volta, milhas_utilizadas, taxa_embarque,
    data_emissao, usuario_responsavel, observacoes
  ) values (
    p_cliente_id, p_programa, p_origem, p_destino, p_classe,
    p_data_ida, p_data_volta, p_milhas_utilizadas, p_taxa_embarque,
    p_data_emissao, p_usuario_responsavel, p_observacoes
  );

  update public.programas_cliente
  set
    saldo      = p_novo_saldo,
    state      = p_novo_state,
    updated_at = now()
  where id = p_programa_cliente_id;

  if not found then
    raise exception 'programas_cliente id % não encontrado', p_programa_cliente_id;
  end if;
end;
$$;

grant execute on function public.registrar_emissao_atomico to authenticated;

commit;
