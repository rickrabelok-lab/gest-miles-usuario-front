# Design: `source_program_id` materializado (aposenta a duplicação de alias)

**Data:** 2026-07-12
**Status:** Aprovado pelo owner; spec enxuto (cleanup de dívida técnica)

---

## Problema

O mapeamento nome-de-programa → slug (`Livelo`→`livelo`, `Inter`→`inter-loop`…) vive em **2 lugares**:
- **Front:** `src/lib/promo-alerts/matching.ts` — `ALIASES` + `normalizeProgramToId` (usado pela 3-A `crossPromosWithWallet`).
- **DB:** `program_aliases` + `promo_norm()` (da 3-B; usado pelo cross do WhatsApp + RPC de histórico).

As duas tabelas precisam ficar em sincronia. Verificado 2026-07-12: são idênticas (17 program_ids, 40 aliases).

## Solução (materializar no banco)

Guardar o slug direto em `promo_alerts` (`source_program_id` / `target_program_id`), computado por um **trigger** a partir de `program_aliases`. O front passa a ler o slug pronto e **deleta seu próprio alias**. `program_aliases` (DB) vira a **fonte única**.

**Por que trigger (não mexer nos workflows):** um `before insert or update of source_program/target_program` popula as colunas pra QUALQUER escrita (RSS, Esfera, moderação, backfill). **Zero mudança nos 4 workflows n8n vivos** — risco mínimo.

---

## Escopo

### Banco (migration nova — SQL + OK do owner antes de aplicar)

```sql
alter table public.promo_alerts add column if not exists source_program_id text;
alter table public.promo_alerts add column if not exists target_program_id text;

create or replace function public.promo_alerts_set_program_ids()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.source_program_id := (select program_id from public.program_aliases where alias_norm = public.promo_norm(new.source_program));
  new.target_program_id := (select program_id from public.program_aliases where alias_norm = public.promo_norm(new.target_program));
  return new;
end; $$;

drop trigger if exists trg_promo_alerts_set_program_ids on public.promo_alerts;
create trigger trg_promo_alerts_set_program_ids
  before insert or update of source_program, target_program on public.promo_alerts
  for each row execute function public.promo_alerts_set_program_ids();

-- backfill (direto, não depende do trigger)
update public.promo_alerts pa set
  source_program_id = (select program_id from public.program_aliases where alias_norm = public.promo_norm(pa.source_program)),
  target_program_id = (select program_id from public.program_aliases where alias_norm = public.promo_norm(pa.target_program));
```

### Front

- **`BonusPromotion`** (`bonusTypes.ts`): + `sourceProgramId?: string`.
- **`service.ts`** (`mapPromoAlertRow` + os 2 `select`): incluir `source_program_id`; mapear `sourceProgramId`.
- **`backend/src/routes/promoAlerts.js`** (`GET /api/promo-alerts` select): incluir `source_program_id`.
- **`matching.ts`**: `crossPromosWithWallet` casa `promo.sourceProgramId === walletRow.programId` (saldo>0). **DELETA** `normalizeProgramToId`, `ALIASES`, `norm()` (viram código morto).
- **`matching.test.ts`**: remove os testes de `normalizeProgramToId`; os de `crossPromosWithWallet` passam a usar `sourceProgramId`.

### Não toca (fonte única preservada)

Os workflows 3-B (`gm-promo-personalizado`/`digest`) e a RPC `promo_historico_rota` seguem usando `promo_norm(source_program)` + `program_aliases` — que É a fonte única. Migrá-los pra o slug materializado é **follow-up opcional** (SQL mais simples, mas toca live — sem ganho de correção agora).

---

## Regras / equivalência

- O trigger produz o MESMO slug que o `normalizeProgramToId` do front produzia (mesma tabela de alias). `source_program` sem match → `source_program_id` null → o front não casa (igual ao `null` do `normalizeProgramToId` hoje). **Comportamento equivalente**, verificado pela igualdade das tabelas.
- Backfill cobre os promos existentes; o trigger cobre os novos.

## Testes

- **Vitest:** `crossPromosWithWallet` com `sourceProgramId` (match/saldo>0/ordenação/null); `mapPromoAlertRow` expõe `sourceProgramId`.
- **Verificação da migration:** após aplicar, conferir que `source_program_id` bate com `normalizeProgramToId` numa amostra (Livelo→livelo, Inter→inter-loop) e que os promos existentes ficaram backfillados. Smoke: a 3-A "Pra você" segue casando (a mesma conta de teste da 3-A).
- Gates: `tsc -b` + `npm test` + `npm run build` + `cd backend && node --test`.

## Fora de escopo (follow-ups)

- Migrar 3-B workflows + RPC de histórico pro slug materializado (SQL mais simples).
- Aposentar `promo_norm`/`program_aliases` (só quando nada mais usar — não é o caso).
