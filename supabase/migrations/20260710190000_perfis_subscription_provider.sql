-- Origem da assinatura B2C (IAP via RevenueCat). Aditiva; coberta pelas
-- policies existentes de perfis. Aplicar SÓ no rollout do IAP (com OK do owner).
alter table public.perfis add column if not exists subscription_provider text;

comment on column public.perfis.subscription_provider is
  'Origem da assinatura B2C: play | apple (escrito pelo webhook RevenueCat no BFF). null = legado Stripe ou sem assinatura.';
