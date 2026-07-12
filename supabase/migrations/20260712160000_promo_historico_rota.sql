-- Fase 4: histórico de bônus por rota. RPC SECURITY DEFINER agrega approved+expired
-- (a RLS de promo_alerts esconde expiradas do cliente); devolve só agregados (público).
-- NÃO aplicar aqui: rollout com OK do owner (banco compartilhado).
-- Rollback: drop function public.promo_historico_rota(text, text);
create or replace function public.promo_historico_rota(p_source text, p_target text)
returns table (
  vezes int, bonus_medio numeric, bonus_max numeric, bonus_min numeric,
  primeira date, ultima date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int,
         round(avg(bonus_numeric), 0),
         max(bonus_numeric), min(bonus_numeric),
         min(coalesce(valid_from, created_at::date)),
         max(coalesce(valid_from, created_at::date))
  from public.promo_alerts
  where category = 'transfer'
    and status in ('approved', 'expired')
    and bonus_numeric is not null
    and promo_norm(source_program) = promo_norm(p_source)
    and promo_norm(target_program) = promo_norm(p_target);
$$;

revoke all on function public.promo_historico_rota(text, text) from public;
grant execute on function public.promo_historico_rota(text, text) to anon, authenticated;
