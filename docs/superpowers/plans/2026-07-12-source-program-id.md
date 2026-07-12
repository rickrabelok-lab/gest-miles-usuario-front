# `source_program_id` materializado — Implementation Plan

**Goal:** Materializar o slug do programa em `promo_alerts` (via trigger), o front lê o slug pronto e deleta seu alias TS. Aposenta a duplicação front×DB.

## Global Constraints

- Trigger produz o mesmo slug que `normalizeProgramToId` (tabelas idênticas, verificado). Comportamento equivalente.
- **Não tocar** os workflows n8n / RPC de histórico (seguem com `promo_norm`+`program_aliases` = fonte única).
- Migration escrita, **NÃO aplicada** na task; rollout com OK do owner.
- Gates: `tsc -b` + `npm test` + `npm run build` + `cd backend && node --test`.
- Não commitar `CLAUDE.md`/`.claude/settings.local.json`/`backend/.gitignore`.

---

### Task 1: Migration (colunas + trigger + backfill)

**File:** Create `supabase/migrations/20260712170000_promo_alerts_program_ids.sql` (conteúdo = bloco SQL do spec). **Não aplicar.**
- [ ] Escrever o arquivo (colunas `source_program_id`/`target_program_id` + função+trigger `promo_alerts_set_program_ids` + backfill).
- [ ] Self-check: trigger `before insert or update of source_program, target_program`; função `set search_path`; backfill direto.
- [ ] Commit `feat(usuario): materializa source/target_program_id em promo_alerts (trigger — aplicar no rollout)`.

### Task 2: Front — lê o slug, deleta o alias TS

**Files:** `src/lib/bonusTypes.ts`, `src/lib/promo-alerts/service.ts`, `backend/src/routes/promoAlerts.js`, `src/lib/promo-alerts/matching.ts`, `src/lib/promo-alerts/matching.test.ts`

- [ ] **`bonusTypes.ts`:** + `sourceProgramId?: string` em `BonusPromotion`.
- [ ] **`service.ts`:** adicionar `source_program_id` nos 2 `select` (o do supabase direto); em `mapPromoAlertRow`, `sourceProgramId: typeof row.source_program_id === 'string' ? row.source_program_id : undefined`.
- [ ] **`backend/src/routes/promoAlerts.js`:** adicionar `source_program_id` na string de `.select(...)` do `GET /`.
- [ ] **`matching.ts`:** reescrever `crossPromosWithWallet` pra casar `promo.sourceProgramId === w.programId` (mantém `category==='transfer'`, `saldo>0`, cálculo, ordenação). **DELETAR** `normalizeProgramToId`, `ALIASES`, `norm()`, e o `import type BonusPromotion` se sobrar sem uso (mantém o import — crossPromosWithWallet usa). Manter `WalletProgram`/`PersonalizedPromo`.
- [ ] **`matching.test.ts`:** remover o `describe('normalizeProgramToId')`; nos testes de `crossPromosWithWallet`, trocar `sourceProgram: 'Livelo'` por `sourceProgramId: 'livelo'` (e os casos de origem desconhecida → `sourceProgramId: undefined`/id fora da carteira). Ajustar o helper `promo()`.
- [ ] **Gates:** `tsc -b` + `npm test` + `npm run build` + `cd backend && node --test`. Commit `feat(usuario): 3-A lê source_program_id materializado; deleta o alias TS`.

## Rollout (controller + OK do owner)
- Aplicar a migration via MCP → verificar `source_program_id` bate com o esperado numa amostra + backfill cobriu os existentes.

## Self-Review
- Cobre o spec: trigger materializa (T1), front lê o slug + deleta alias (T2), 3-B/RPC intocados. Backfill + trigger cobrem existentes+novos.
