-- Compat: captacao_leads tracking columns (idempotente)
-- Garante schema alinhado com CalcPublicaPage + edge function track-lead-conversion

begin;

alter table public.captacao_leads
  add column if not exists captured_host text,
  add column if not exists fbclid text,
  add column if not exists gclid text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists fbc text,
  add column if not exists fbp text,
  add column if not exists user_agent text,
  add column if not exists ip_address text,
  add column if not exists event_id text,
  add column if not exists tracking_errors jsonb;

create index if not exists idx_captacao_leads_created_at
  on public.captacao_leads(created_at desc);

create index if not exists idx_captacao_leads_event_id
  on public.captacao_leads(event_id)
  where event_id is not null;

create index if not exists idx_captacao_leads_fbclid
  on public.captacao_leads(fbclid)
  where fbclid is not null;

create index if not exists idx_captacao_leads_gclid
  on public.captacao_leads(gclid)
  where gclid is not null;

comment on column public.captacao_leads.captured_host is
  'Host de origem da captura pública (domínio customizado ou domínio principal).';

comment on column public.captacao_leads.tracking_errors is
  'Erros de envio para plataformas de tracking (Meta CAPI, Google Ads etc.).';

-- Role anon precisa de INSERT para visitantes da calculadora pública conseguirem salvar leads.
-- A política RLS captacao_leads_anon_insert (with check true) existe mas não basta sem este grant.
grant insert on table public.captacao_leads to anon;

commit;
