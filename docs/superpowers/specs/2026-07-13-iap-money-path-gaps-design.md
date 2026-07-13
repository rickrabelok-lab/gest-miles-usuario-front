# IAP / RevenueCat — fechamento dos 3 gaps de money-path (pré-rollout)

**Data:** 2026-07-13 · **Repo:** gest-miles-usuario-front (front + backend; pilha IAP é só deste app — o manager não tem entitlement) · **Estado:** path DORMENTE (flags off) → hardening sem risco vivo.

## Contexto

A fase 2 (IAP via RevenueCat) foi construída, mas a caça #14 achou 3 gaps de money-path que viram furo quando o rollout ligar. Este spec fecha os 3. O **webhook é o único caminho** que grava entitlement em `perfis` (o cliente só faz login/logout no SDK; não grava). O front lê `plano_ativo` + `subscription_status` do `AuthContext` → `isPaid`.

## Gap #1 — TRANSFER ignorado → acesso fantasma

**Hoje:** `TRANSFER` não está em `UPDATE_EVENTS` → `mapRevenueCatEvent` devolve `skip`. Quando o RevenueCat move uma assinatura entre `app_user_id`s, a conta de **origem** (`transferred_from`) mantém `subscription_status='active'` (acesso fantasma).

**Decisão (opção A — revogar só a origem):** no `TRANSFER`, revogar os `transferred_from` (subset UUID válido) → `subscription_status='canceled'`. **Não** conceder ao destino aqui (o payload de TRANSFER não traz `expiration_at_ms`/`product_id`); o destino ganha acesso no próximo evento de assinatura (RENEWAL/INITIAL_PURCHASE). Trade-off aceito: destino legítimo pode aparecer *free* numa janela curta (cenário raro, já que `app_user_id = user.id` estável).

- `mapRevenueCatEvent` passa a devolver `{ action: "revoke", usuarioIds: string[], patch: { subscription_status: "canceled" } }` pra TRANSFER com ≥1 `transferred_from` válido; `skip` se nenhum válido.
- Webhook: `action === "revoke"` → `update(patch).in("usuario_id", usuarioIds)`.

## Gap #2 — sem filtro de `environment` → sandbox vira prod

**Hoje:** `mapRevenueCatEvent` nunca olha `event.environment`. Compra **SANDBOX** de tester (com UUID real) vira `active` em prod.

**Decisão (mecânico, fail-closed):** processar só `event.environment === "PRODUCTION"`; qualquer outro valor (SANDBOX, ausente) → `skip` (200, RC não retenta). Gate no topo do `mapRevenueCatEvent`, antes do dispatch de tipo (vale pra TRANSFER também). Fail-closed é a postura correta pra money-path: não conceder no ambíguo.

## Gap #3 — `isPaid` ignora `period_end` → EXPIRATION perdido nunca revoga

**Hoje:** `isPaid` decide só por `status`. O webhook grava `subscription_current_period_end`, mas se um `EXPIRATION` nunca chegar, o perfil fica `active` pra sempre.

**Decisão (opção A — gate com janela de graça):** `isPaid` também checa `period_end`:

```
isPaid = plano_ativo === true
  || ( status ∈ {active,trialing}
       && ( period_end nulo/ inválido  // legado/B2B → sem gate
            || Date.parse(period_end) + 3 dias >= agora ) )
```

A graça de **3 dias** absorve um RENEWAL atrasado (não derruba quem pagou), mas ainda revoga se o EXPIRATION sumir. B2B (`plano_ativo`) passa antes, sem gate.

- `entitlement.ts`: `isPaid(planoAtivo, subscriptionStatus, subscriptionPeriodEnd?, now?)` — params novos **opcionais** (retrocompatível: callers sem `period_end` mantêm o comportamento atual). `entitlementOf` idem.
- `AuthContext`: `select` passa a incluir `subscription_current_period_end`; novo estado + expõe `subscriptionPeriodEnd`.
- `useEntitlement`: repassa `subscriptionPeriodEnd` pro `isPaid`/`entitlementOf`.

## Arquivos

**Backend:** `src/lib/revenuecatHelpers.js` (+ `.test.js`), `src/routes/revenuecatWebhook.js`.
**Front:** `src/lib/entitlement.ts` (+ `.test.ts`), `src/contexts/AuthContext.tsx`, `src/hooks/useEntitlement.ts`.

## Testes

- **revenuecatHelpers.test.js:** factory base ganha `environment:"PRODUCTION"`; novos casos: SANDBOX→skip, environment ausente→skip, TRANSFER com `transferred_from` válido→revoke (usuarioIds), TRANSFER sem from válido→skip, TRANSFER filtra UUID inválido. (Ajustar o teste antigo "TEST e TRANSFER são ignorados" → só TEST.)
- **entitlement.test.ts:** period_end futuro→pago; passado além da graça→free; dentro da graça (passado <3d)→pago; nulo→sem gate (mantém); inválido→sem gate; `now` injetado p/ determinismo.

## Gate

Backend `node --test` (revenuecatHelpers) + front `tsc -b` + `npm test` + `npm run build`. PR único (1 repo).

## Fora do escopo

Conceder ao destino do TRANSFER via API REST do RC (opção B) — adiaria segredo novo + call externo; reavaliar se transfers forem comuns. Nenhuma migration (colunas já existem).
