-- Milheiro efetivo (fase 1.1): custo em R$ por 1.000 pontos/milhas no programa de
-- destino, EXTRAÍDO do artigo (nunca calculado) + nota de como chegar no custo.
-- Aditiva: a policy de select existente (approved + vigente) já cobre as colunas novas.
-- Spec: docs/superpowers/specs/2026-07-12-milheiro-efetivo-design.md

alter table public.promo_alerts
  add column if not exists milheiro_cost numeric,
  add column if not exists milheiro_note text;

comment on column public.promo_alerts.milheiro_cost is
  'Custo em R$ por 1.000 pontos/milhas no programa de destino, melhor caso publicado pelo artigo (extraído, nunca calculado).';
comment on column public.promo_alerts.milheiro_note is
  'Como o artigo diz que se chega no custo (carrinho, clube, Pix, transferência com bônus). Nunca presente sem milheiro_cost.';
