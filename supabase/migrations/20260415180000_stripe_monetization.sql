-- Monetização Stripe: planos locais (metadados + limites) e estado de assinatura em perfis.

alter table public.perfis
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists subscription_plan_slug text,
  add column if not exists subscription_current_period_end timestamptz;

create index if not exists idx_perfis_stripe_customer_id on public.perfis(stripe_customer_id);
create index if not exists idx_perfis_stripe_subscription_id on public.perfis(stripe_subscription_id);

comment on column public.perfis.stripe_customer_id is 'Stripe Customer id (cus_...)';
comment on column public.perfis.stripe_subscription_id is 'Stripe Subscription id (sub_...)';
comment on column public.perfis.subscription_status is 'Stripe subscription.status (active, canceled, past_due, paused, trialing, ...)';
comment on column public.perfis.subscription_plan_slug is 'Slug local do plano em subscription_plans';
comment on column public.perfis.subscription_current_period_end is 'Fim do período de faturação atual';

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  stripe_product_id text not null unique,
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  active boolean not null default true,
  sort_order int not null default 0,
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscription_plans_active on public.subscription_plans(active);
create index if not exists idx_subscription_plans_sort on public.subscription_plans(sort_order);

alter table public.subscription_plans enable row level security;

-- Leitura pública dos planos ativos (preços na landing / utilizadores autenticados)
drop policy if exists subscription_plans_select_active on public.subscription_plans;
create policy subscription_plans_select_active on public.subscription_plans
  for select
  to authenticated, anon
  using (active = true);

-- Utilizadores autenticados podem ver planos inativos? Não — só via API admin (service role)
