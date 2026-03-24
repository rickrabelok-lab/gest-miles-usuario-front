-- =============================================================================
-- Carteira unificada por equipe (mesmos clientes para todos os gestores do grupo)
--
-- Regra: para cada equipe, pega a UNIÃO de todos os cliente_id que já aparecem em
-- cliente_gestores para qualquer gestor daquela equipe (equipe_gestores) e cria
-- as linhas faltantes para que CADA gestor da equipe tenha vínculo a CADA cliente
-- dessa união.
--
-- Ex.: Rick tem 4 clientes, Silmara tem 1 → a equipe passa a ter 5 clientes e os
-- dois gestores ficam com 5 linhas em cliente_gestores (após este script).
--
-- Rode no Supabase → SQL Editor (precisa INSERT em cliente_gestores; use service
-- role ou política que permita; em geral admin / migração).
--
-- Idempotente: ON CONFLICT DO NOTHING na PK (cliente_id, gestor_id).
-- =============================================================================

insert into public.cliente_gestores (cliente_id, gestor_id)
select distinct c.cliente_id, g.gestor_id
from (
  select distinct eg.equipe_id, cg.cliente_id
  from public.equipe_gestores eg
  inner join public.cliente_gestores cg on cg.gestor_id = eg.gestor_id
) c
inner join public.equipe_gestores g on g.equipe_id = c.equipe_id
on conflict (cliente_id, gestor_id) do nothing;

-- Verificação: por equipe, quantos clientes distintos e quantos vínculos gestor↔cliente
select
  e.nome as equipe,
  count(distinct cg.cliente_id) as clientes_distintos,
  count(*) as linhas_cliente_gestores
from public.equipe_gestores eg
join public.equipes e on e.id = eg.equipe_id
join public.cliente_gestores cg on cg.gestor_id = eg.gestor_id
group by e.id, e.nome
order by e.nome;
