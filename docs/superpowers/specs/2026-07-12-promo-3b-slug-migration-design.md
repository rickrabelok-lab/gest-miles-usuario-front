# Design: migrar o cross do 3-B pro slug materializado `source_program_id`

**Data:** 2026-07-12
**Status:** Aprovado pelo owner (brainstorm). Refactor equivalente (mesmo comportamento, SQL mais simples) + fecha o gap de monitoramento dos 3-B.

---

## Problema

Os 2 workflows do 3-B (proativo WhatsApp) cruzam promo × carteira via `join program_aliases al on al.alias_norm = promo_norm(source_program)` + `al.program_id = pc.program_id` — recomputando o slug a cada linha. Desde o PR #89, o slug vive **materializado** em `promo_alerts.source_program_id` (trigger `promo_alerts_set_program_ids`, populado de `program_aliases`). Migrar pro slug: um join a menos, sem `promo_norm` em runtime, e **fonte única** (a coluna) em vez de recomputar. Além disso, os 2 workflows 3-B **não têm `errorWorkflow`** (o PR #90 só fiou os 4 produtores/sink/housekeeping) → falha deles é silenciosa hoje.

## Decisões (owner)

- **RPC per-rota `promo_historico_rota` fica como está** (name-based; `promo_norm` é barato numa view; o RPC de LISTA já usa slug; migrar exigiria plumbing no front pra ganho marginal).
- **Fiar `errorWorkflow=gm-promo-error-alert` (`pHo9Ic6AMY0YpXEn`) nos 2 workflows 3-B** junto (já vou dar PUT neles).

## Prova de equivalência (a chave do refactor)

O swap `join program_aliases … al.program_id = pc.program_id` → `source_program_id = pc.program_id` é equivalente **sse** `source_program_id` == a lookup do alias pra TODA linha de `promo_alerts`. Verifico direto (deve dar **0**):
```sql
select count(*) filter (
  where source_program_id is distinct from
    (select program_id from public.program_aliases where alias_norm = public.promo_norm(source_program))
) as mismatches
from public.promo_alerts;
```
Se 0, o join swap é provadamente equivalente em todas as linhas (inclusive nulls: `x = null` não casa, igual ao alias join sem match). Belt-and-suspenders: rodar o cross do digest OLD × NEW e conferir linhas idênticas.

---

## Escopo (2 arquivos)

### `gm-promo-personalizado` (`QsUlfY0g9ZPw8Oz5`) — nó `gmpp-cross`

CTE `promo` passa a selecionar `source_program_id` (mantém `source_program`/`target_program` pro texto); troca os 2 joins pelo direto:
- **De:** `join public.program_aliases al on al.alias_norm = public.promo_norm(p.source_program)` + `join public.programas_cliente pc on pc.program_id = al.program_id and pc.saldo > 0`
- **Para:** `join public.programas_cliente pc on pc.program_id = p.source_program_id and pc.saldo > 0`
- CTE ganha `and source_program_id is not null` (explicita: origem não-mapeada não gera envio — igual hoje).

### `gm-promo-digest-interno` (`qU7ibNSMtfhLrIfK`) — nó `gmpd-cross`

Remove a linha `join public.program_aliases al on al.alias_norm = public.promo_norm(p.source_program) and al.program_id = pc.program_id`; adiciona `and p.source_program_id = pc.program_id` às condições do join de `promo_alerts`.

### Settings dos 2

`settings.errorWorkflow = "pHo9Ic6AMY0YpXEn"` (via PUT preservando nodes/connections).

---

## Rollout (ordem)

1. **Prova de equivalência** (SQL acima): `mismatches = 0`. Se ≠ 0, PARAR (a materialização divergiu — investigar antes).
2. **Editar os 2 JSONs** (SQL + settings). Sanidade local (`require` parseia).
3. **Digest OLD × NEW** contra prod (rodar as 2 queries, diff de linhas idênticas) — belt-and-suspenders além da prova de coluna.
4. **Push + re-ativar** `gm-promo-personalizado` (webhook; PUT desativa → re-ativar). Round-trip: active + errorWorkflow + SQL novo.
5. **Push + re-ativar** `gm-promo-digest-interno` (cron 09:00). Round-trip idem.
6. Commit + PR + memória.

## Riscos

- **Comportamento:** equivalente (prova de coluna + diff do digest). Se a prova falhar, não migra.
- **Pipelines vivos:** personalizado = webhook (disparado pelo pg trigger na aprovação); digest = cron 09:00. PUT desativa → re-ativar na hora (gap de segundos).
- **0 transfer aprovadas em prod hoje** → o cross retorna vazio nos 2 (OLD e NEW) com dado real atual; a prova de equivalência não depende disso (é sobre a coluna vs alias em TODAS as linhas).

## Fora de escopo

- RPC per-rota (fica name-based).
- `target_program_id` (não usado nesses crosses; só `source`).
- Migrar outros consumidores de `promo_norm` (não há neste escopo).
