-- Ofertas de bônus, preços de calendário e voos demo: fonte única para BFF + leitura direta no browser (RLS público leitura).
-- Cópia consolidada para deploy manual: ../../MIGRATION_TOTAL_DATA.sql (manter em sincronia).

create table if not exists public.bonus_offers (
  id text primary key,
  program text not null,
  store text not null,
  multiplier numeric not null,
  valid_until date not null,
  conditions text not null default '',
  offer_url text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_prices (
  id bigint generated always as identity primary key,
  origin_code text not null,
  destination_code text not null,
  mode text not null check (mode in ('money', 'points')),
  year_month text not null,
  prices jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (origin_code, destination_code, mode, year_month)
);

create table if not exists public.demo_flights (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  origin_code text not null,
  destination_code text not null,
  origin_name text not null,
  destination_name text not null,
  airline text not null,
  points integer not null,
  money numeric(12, 2) not null
);

alter table public.bonus_offers enable row level security;
alter table public.calendar_prices enable row level security;
alter table public.demo_flights enable row level security;

drop policy if exists "bonus_offers_select_public" on public.bonus_offers;
create policy "bonus_offers_select_public"
  on public.bonus_offers for select
  using (active = true);

drop policy if exists "calendar_prices_select_public" on public.calendar_prices;
create policy "calendar_prices_select_public"
  on public.calendar_prices for select
  using (true);

drop policy if exists "demo_flights_select_public" on public.demo_flights;
create policy "demo_flights_select_public"
  on public.demo_flights for select
  using (true);

-- Seed inicial (mesmo conteúdo que era mock no repositório)
insert into public.bonus_offers (id, program, store, multiplier, valid_until, conditions, offer_url)
values
  ('offer-1', 'Livelo', 'Nike', 10, '2026-04-30', 'Válido para compras acima de R$ 199 via hotsite oficial.', 'https://example.com/oferta/livelo-nike'),
  ('offer-2', 'Smiles', 'Magazine Luiza', 12, '2026-04-18', 'Pontuação em até 45 dias para produtos vendidos e entregues pelo parceiro.', 'https://example.com/oferta/smiles-magalu'),
  ('offer-3', 'LATAM Pass', 'Netshoes', 8, '2026-04-12', 'Exclusivo para clientes logados com CPF vinculado ao programa.', 'https://example.com/oferta/latam-netshoes'),
  ('offer-4', 'Azul Fidelidade', 'Casas Bahia', 15, '2026-05-05', 'Não cumulativo com cupom externo. Bonificação limitada a 20 mil pontos.', 'https://example.com/oferta/azul-casasbahia'),
  ('offer-5', 'Livelo', 'Amazon', 7, '2026-04-22', 'Apenas categorias elegíveis conforme regulamento da campanha.', 'https://example.com/oferta/livelo-amazon'),
  ('offer-6', 'LATAM Pass', 'Centauro', 16, '2026-04-25', 'Oferta em destaque para app e site. Não válido para gift card.', 'https://example.com/oferta/latam-centauro')
on conflict (id) do nothing;

insert into public.demo_flights (external_id, origin_code, destination_code, origin_name, destination_name, airline, points, money)
values
  ('f1', 'GRU', 'CWB', 'São Paulo', 'Curitiba', 'G3', 4000, 286.90),
  ('f2', 'CNF', 'SDU', 'Belo Horizonte', 'Rio de Janeiro', 'LA', 4863, 312.50),
  ('f3', 'CGH', 'POA', 'São Paulo', 'Porto Alegre', 'AD', 4878, 355.20),
  ('f4', 'BSB', 'REC', 'Brasília', 'Recife', 'LA', 8200, 499.00),
  ('f5', 'GIG', 'LIS', 'Rio de Janeiro', 'Lisboa', 'TP', 38500, 2890.00),
  ('f6', 'GRU', 'JFK', 'São Paulo', 'Nova York', 'AA', 45200, 3210.00)
on conflict (external_id) do nothing;

-- Exemplo de linha de calendário (editável no Supabase); rotas sem linha usam estimativa no BFF.
insert into public.calendar_prices (origin_code, destination_code, mode, year_month, prices)
values
  ('SAO', 'RIO', 'money', '2026-04', '{"5":320,"6":315,"12":298,"18":305,"25":330}'::jsonb),
  ('SAO', 'RIO', 'points', '2026-04', '{"5":4200,"6":4100,"12":3900,"18":4000,"25":4300}'::jsonb)
on conflict (origin_code, destination_code, mode, year_month) do nothing;
