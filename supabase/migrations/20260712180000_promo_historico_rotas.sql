-- Fase 4 (browse): lista o histórico de bônus por rota de transferência.
-- SECURITY DEFINER (a RLS de promo_alerts esconde as expiradas, que SÃO o histórico);
-- devolve só agregados (público). Agrupa pelos slugs materializados (source/target_program_id).
-- NÃO aplicar aqui: rollout com OK do owner (banco compartilhado).
-- Rollback: drop function public.promo_historico_rotas();
create or replace function public.promo_historico_rotas()
returns table (
  source_id text, target_id text, source_nome text, target_nome text,
  vezes int, bonus_medio numeric, bonus_max numeric, bonus_min numeric,
  primeira date, ultima date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    source_program_id, target_program_id,
    (array_agg(source_program order by created_at desc) filter (where source_program is not null))[1],
    (array_agg(target_program order by created_at desc) filter (where target_program is not null))[1],
    count(*)::int,
    round(avg(bonus_numeric), 0), max(bonus_numeric), min(bonus_numeric),
    min(coalesce(valid_from, created_at::date)), max(coalesce(valid_from, created_at::date))
  from public.promo_alerts
  where category = 'transfer'
    and status in ('approved', 'expired')
    and bonus_numeric is not null
    and source_program_id is not null
    and target_program_id is not null
  group by source_program_id, target_program_id
  order by max(coalesce(valid_from, created_at::date)) desc;
$$;

revoke all on function public.promo_historico_rotas() from public;
grant execute on function public.promo_historico_rotas() to anon, authenticated;
