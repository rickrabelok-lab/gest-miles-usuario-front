-- Promoções automáticas (fase 1): tabela canônica + staging de dedup do pipeline n8n.
-- Escrita: só pipeline (conexão postgres do n8n, bypassa RLS) e service role (moderação via BFF).
-- Leitura pública (anon/authenticated): apenas aprovadas e vigentes — padrão bonus_offers.
-- Spec: docs/superpowers/specs/2026-07-11-promocoes-automaticas-design.md

create table if not exists public.promo_alerts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('transfer', 'shopping', 'miles', 'cards')),
  source_program text,
  target_program text,
  title text not null,
  bonus_value text,
  bonus_numeric numeric,
  tiers jsonb,
  valid_from date,
  valid_until date,
  details text,
  cta_url text,
  source_links jsonb not null default '[]'::jsonb,
  canonical_key text not null unique,
  confidence numeric,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  moderated_at timestamptz
);

create index if not exists promo_alerts_status_valid_idx
  on public.promo_alerts (status, valid_until);

create table if not exists public.promo_ingest_seen (
  source text not null,
  external_id text not null,
  seen_at timestamptz not null default now(),
  primary key (source, external_id)
);

alter table public.promo_alerts enable row level security;
alter table public.promo_ingest_seen enable row level security;

drop policy if exists "promo_alerts_select_public" on public.promo_alerts;
create policy "promo_alerts_select_public"
  on public.promo_alerts for select
  using (status = 'approved' and (valid_until is null or valid_until >= current_date));

-- Staging é interna do pipeline: RLS sem policy (deny) + revoke explícito de cinto e suspensório.
revoke all on public.promo_ingest_seen from anon, authenticated;
