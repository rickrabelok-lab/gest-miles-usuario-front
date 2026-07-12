# Milheiro Efetivo (fase 1.1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair o custo do milheiro efetivo que os blogs publicam (ex. "R$ 15,58 Esfera→Smiles") como dado estruturado e exibi-lo como badge protagonista no app + linha no card de curadoria.

**Architecture:** 2 colunas novas em `promo_alerts` (`milheiro_cost` numeric, `milheiro_note` text) preenchidas pelo mesmo call LLM do pipeline n8n `gm-promo-ingest`, com guarda anti-alucinação determinística no `gmpi-parse` (o número precisa aparecer literalmente no artigo). No front, `bonusBadge()` é o ponto único de decisão: com milheiro, o badge vira `R$ 15,58 / milheiro` na linha, no hero e no detalhe. Spec: `docs/superpowers/specs/2026-07-12-milheiro-efetivo-design.md`.

**Tech Stack:** React 18 + Vite + Vitest/Testing Library (front) · Express + node:test (backend) · n8n (workflow JSON versionado) · Supabase Postgres (migration).

## Global Constraints

- **Ordem de rollout obrigatória:** migration aplicada ANTES do deploy do backend e do push do workflow — os selects (`promoAlerts.js`, `agentPromo.js`, `service.ts`) e o upsert do n8n referenciam as colunas novas e quebram sem elas. Aplicar migration = banco COMPARTILHADO, só com OK explícito do owner (Task 7).
- **Gates reais:** `npx tsc -b` + `npm test` + `npm run build` na raiz e `npm test` dentro de `backend/` (`vite build` não type-checka; `tsc --noEmit` puro é no-op).
- **Formato do valor:** `R$ 15,58` gerado deterministicamente com `toFixed(2).replace('.', ',')` — NUNCA `Intl`/`toLocaleString` currency (gera NBSP e quebra asserts).
- **Unidade canônica:** R$ por 1.000 pontos/milhas no programa de DESTINO. Faixa de sanidade: `1 <= milheiro_cost <= 200`.
- **n8n:** params do node Postgres só com valores simples (número/texto curto sem `*`/newlines); `$('nó').item` só atravessando nodes httpRequest 1:1 (`gmpi-parse` → `$('gmpi-prep')` atravessa só o `gmpi-extract`, seguro); sandbox do Code node NÃO expõe `URL`/globals — regex puro.
- **Commits em PT-BR com escopo** (`feat(usuario): …`), branch `feat/promo-milheiro-efetivo`.

---

### Task 1: Migration aditiva (arquivo apenas — NÃO aplicar)

**Files:**
- Create: `supabase/migrations/20260712120000_promo_alerts_milheiro.sql`

**Interfaces:**
- Produces: colunas `promo_alerts.milheiro_cost numeric` e `promo_alerts.milheiro_note text` (contrato de todo o resto do plano). Aplicação em prod só na Task 7, com OK do owner.

- [ ] **Step 1: Criar o arquivo da migration**

```sql
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
```

- [ ] **Step 2: Verificar que o SQL parseia (sem aplicar)**

Run (raiz): `node -e "const s=require('fs').readFileSync('supabase/migrations/20260712120000_promo_alerts_milheiro.sql','utf8'); if(!/add column if not exists milheiro_cost numeric/.test(s)) throw new Error('coluna faltando'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260712120000_promo_alerts_milheiro.sql
git commit -m "feat(usuario): migration aditiva do milheiro efetivo em promo_alerts (aplicar só no rollout)"
```

---

### Task 2: Front — tipos + mapeamento em `service.ts`

**Files:**
- Modify: `src/lib/bonusTypes.ts` (interface `BonusPromotion`)
- Modify: `src/lib/promo-alerts/service.ts` (função `mapPromoAlertRow` + select do fallback)
- Test: `src/lib/promo-alerts/service.test.ts`

**Interfaces:**
- Consumes: colunas `milheiro_cost` / `milheiro_note` (Task 1).
- Produces: `BonusPromotion.milheiroCost?: number` e `BonusPromotion.milheiroNote?: string` — `milheiroNote` NUNCA presente sem `milheiroCost` válido (finito e > 0).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar dentro do `describe('mapPromoAlertRow', …)` existente em `src/lib/promo-alerts/service.test.ts`:

```ts
  it('mapeia milheiro efetivo quando presente (number ou string numérica)', () => {
    const promo = mapPromoAlertRow({
      ...row,
      milheiro_cost: 15.58,
      milheiro_note: 'Comprando pontos no carrinho da Esfera e transferindo com 70% de bônus',
    })!
    expect(promo.milheiroCost).toBe(15.58)
    expect(promo.milheiroNote).toBe('Comprando pontos no carrinho da Esfera e transferindo com 70% de bônus')
    expect(mapPromoAlertRow({ ...row, milheiro_cost: '13.44' })!.milheiroCost).toBe(13.44)
  })

  it('sem milheiro válido, cost e note ficam undefined (nota nunca anda sozinha)', () => {
    expect(mapPromoAlertRow(row)!.milheiroCost).toBeUndefined()
    expect(mapPromoAlertRow({ ...row, milheiro_cost: 0 })!.milheiroCost).toBeUndefined()
    expect(mapPromoAlertRow({ ...row, milheiro_cost: 'lixo' })!.milheiroCost).toBeUndefined()
    const orfa = mapPromoAlertRow({ ...row, milheiro_cost: null, milheiro_note: 'nota órfã' })!
    expect(orfa.milheiroNote).toBeUndefined()
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/promo-alerts/service.test.ts`
Expected: FAIL — `milheiroCost` esperado `15.58`, recebido `undefined`.

- [ ] **Step 3: Implementar**

Em `src/lib/bonusTypes.ts`, dentro de `BonusPromotion`, logo após `bonusLabel: string`:

```ts
  /** Custo em R$ por 1.000 pontos/milhas no destino, publicado pelo artigo (fase 1.1). */
  milheiroCost?: number
  /** Como chegar no custo (carrinho, clube, transferência) — nunca presente sem milheiroCost. */
  milheiroNote?: string
```

Em `src/lib/promo-alerts/service.ts`, dentro de `mapPromoAlertRow`, após a linha `const fallbackCta = links?.[0]?.url`:

```ts
  const milheiroCost = Number(row.milheiro_cost)
  const hasMilheiro = Number.isFinite(milheiroCost) && milheiroCost > 0
```

E no objeto retornado, após `bonusLabel: BONUS_LABEL[category],`:

```ts
    milheiroCost: hasMilheiro ? milheiroCost : undefined,
    milheiroNote:
      hasMilheiro && typeof row.milheiro_note === 'string' && row.milheiro_note
        ? row.milheiro_note
        : undefined,
```

No select do fallback Supabase em `getActivePromoAlerts`, trocar a string de colunas por:

```ts
        'id, category, source_program, target_program, title, bonus_value, bonus_numeric, tiers, valid_from, valid_until, details, cta_url, source_links, milheiro_cost, milheiro_note',
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/promo-alerts/service.test.ts`
Expected: PASS (todos, incluindo os pré-existentes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bonusTypes.ts src/lib/promo-alerts/service.ts src/lib/promo-alerts/service.test.ts
git commit -m "feat(usuario): BonusPromotion carrega milheiro efetivo (milheiro_cost/milheiro_note)"
```

---

### Task 3: Front — `bonusBadge` decide milheiro num lugar só

**Files:**
- Modify: `src/lib/bonusUtils.ts`
- Test: `src/lib/bonusUtils.test.ts`

**Interfaces:**
- Produces: `formatMilheiroBRL(cost: number): string` (ex. `15.58` → `"R$ 15,58"`) e nova assinatura retrocompatível `bonusBadge(bonusValue?: string, milheiroCost?: number)` — com milheiro válido retorna `{ value: 'R$ 15,58', label: 'milheiro' }`; senão, comportamento atual intacto.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao `describe('bonusBadge', …)` em `src/lib/bonusUtils.test.ts` (e importar `formatMilheiroBRL` junto de `bonusBadge`):

```ts
  it('milheiro efetivo vence o bonus_value e formata em pt-BR', () => {
    expect(bonusBadge('até 70%', 15.58)).toEqual({ value: 'R$ 15,58', label: 'milheiro' })
    expect(bonusBadge(undefined, 13.44)).toEqual({ value: 'R$ 13,44', label: 'milheiro' })
    expect(bonusBadge('100%', 17)).toEqual({ value: 'R$ 17,00', label: 'milheiro' })
  })

  it('milheiro inválido (0, NaN, ausente) cai na lógica atual do bonus_value', () => {
    expect(bonusBadge('100%', 0)).toEqual({ value: '100%', label: 'de bônus' })
    expect(bonusBadge('100%', NaN)).toEqual({ value: '100%', label: 'de bônus' })
    expect(bonusBadge('100%')).toEqual({ value: '100%', label: 'de bônus' })
  })

  it('formatMilheiroBRL é determinístico, sem NBSP', () => {
    expect(formatMilheiroBRL(15.58)).toBe('R$ 15,58')
    expect(formatMilheiroBRL(17)).toBe('R$ 17,00')
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/bonusUtils.test.ts`
Expected: FAIL — `formatMilheiroBRL` não exportado / badge retorna `{ value: 'até 70%', … }`.

- [ ] **Step 3: Implementar**

Em `src/lib/bonusUtils.ts`, antes de `bonusBadge`:

```ts
/** Formato pt-BR determinístico (toFixed + vírgula) — Intl currency injeta NBSP e quebra asserts. */
export function formatMilheiroBRL(cost: number): string {
  return `R$ ${cost.toFixed(2).replace('.', ',')}`
}
```

E `bonusBadge` vira (docstring existente mantido, com a linha nova):

```ts
/**
 * O tratamento tipográfico grande (valor em destaque) só funciona com token CURTO.
 * bonus_value vem livre do LLM: curto => badge; longo => o título carrega a promoção.
 * Percentual ganha rótulo; valor com unidade embutida ("21 pts/R$") não repete rótulo.
 * Milheiro efetivo (fase 1.1) vence tudo: é o número decisório e o % já vive na manchete.
 */
export function bonusBadge(
  bonusValue?: string,
  milheiroCost?: number,
): { value: string; label?: string } | null {
  if (typeof milheiroCost === 'number' && Number.isFinite(milheiroCost) && milheiroCost > 0) {
    return { value: formatMilheiroBRL(milheiroCost), label: 'milheiro' }
  }
  const value = (bonusValue ?? '').trim()
  if (!value || value.length > 12) return null
  if (/^(até\s+)?-\d+([.,]\d+)?\s*%$/i.test(value)) return { value, label: 'de desconto' }
  if (/^(até\s+)?\d+([.,]\d+)?\s*%$/i.test(value)) return { value, label: 'de bônus' }
  return { value }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/bonusUtils.test.ts`
Expected: PASS (novos + pré-existentes — assinatura retrocompatível).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bonusUtils.ts src/lib/bonusUtils.test.ts
git commit -m "feat(usuario): bonusBadge prioriza o milheiro efetivo (R$ pt-BR + rótulo milheiro)"
```

---

### Task 4: Front — call sites (linha/hero/detalhe) + bloco "Custo do milheiro"

**Files:**
- Modify: `src/components/bonus/PromoRow.tsx:10`
- Modify: `src/components/bonus/BonusPromotionsSection.tsx:16`
- Modify: `src/pages/BonusOfferDetailScreen.tsx` (linha 50 + bloco novo após "Bônus máximo")
- Test (create): `src/pages/BonusOfferDetailScreen.test.tsx`

**Interfaces:**
- Consumes: `bonusBadge(bonusValue, milheiroCost)` e `formatMilheiroBRL` (Task 3); `promo.milheiroCost`/`promo.milheiroNote` (Task 2).
- Produces: UI final — badge de milheiro nas 3 superfícies + bloco explicativo no detalhe.

- [ ] **Step 1: Escrever o teste que falha (render do detalhe)**

Criar `src/pages/BonusOfferDetailScreen.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BonusOfferDetailScreen from './BonusOfferDetailScreen'
import type { BonusPromotion } from '@/lib/bonusTypes'

const state = {
  promotions: [] as BonusPromotion[],
  highlight: null as BonusPromotion | null,
  activeCount: 0,
  expiringToday: 0,
  loading: false,
}

vi.mock('@/hooks/useBonusPromotions', () => ({
  useBonusPromotions: () => state,
}))

const basePromo: BonusPromotion = {
  id: 'abc',
  category: 'transfer',
  targetProgram: 'Smiles',
  title: 'Transfira Esfera para Smiles com até 70% de bônus',
  bonusValue: 'até 70%',
  bonusLabel: 'de bônus',
  isActive: true,
  isHighlight: false,
  ctaUrl: 'https://esfera.com.vc/promo',
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/bonus-offers/abc']}>
      <Routes>
        <Route path="/bonus-offers/:id" element={<BonusOfferDetailScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BonusOfferDetailScreen — custo do milheiro', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.promotions = [basePromo]
    state.loading = false
  })

  it('com milheiro mostra o bloco com valor formatado e a nota do combo', () => {
    state.promotions = [
      {
        ...basePromo,
        milheiroCost: 15.58,
        milheiroNote: 'Comprando pontos no carrinho da Esfera e transferindo com 70% de bônus',
      },
    ]
    renderDetail()
    expect(screen.getByText('Custo do milheiro')).toBeInTheDocument()
    expect(screen.getAllByText(/R\$ 15,58/).length).toBeGreaterThan(0)
    expect(screen.getByText(/carrinho da Esfera/)).toBeInTheDocument()
  })

  it('sem milheiro não renderiza o bloco e o badge segue o bonus_value', () => {
    renderDetail()
    expect(screen.queryByText('Custo do milheiro')).not.toBeInTheDocument()
    expect(screen.getByText('até 70%')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/pages/BonusOfferDetailScreen.test.tsx`
Expected: FAIL — `Custo do milheiro` não encontrado no primeiro teste (o segundo já passa).

- [ ] **Step 3: Implementar os 3 call sites + bloco**

`src/components/bonus/PromoRow.tsx` linha 10:

```ts
  const badge = bonusBadge(promo.bonusValue, promo.milheiroCost)
```

`src/components/bonus/BonusPromotionsSection.tsx` linha 16:

```ts
  const highlightBadge = highlight ? bonusBadge(highlight.bonusValue, highlight.milheiroCost) : null
```

`src/pages/BonusOfferDetailScreen.tsx` linha 50:

```ts
  const badge = promo ? bonusBadge(promo.bonusValue, promo.milheiroCost) : null
```

No mesmo arquivo, importar `formatMilheiroBRL` (linha 10 vira):

```ts
import { bonusBadge, formatMilheiroBRL, isExpiringToday } from '@/lib/bonusUtils'
```

E inserir o bloco novo logo APÓS o bloco `{/* Bônus máximo */}` (depois do `)}` da condição `promo.maxBonus`, antes de `{/* CTA — toda promoção tem link de participação */}`):

```tsx
            {/* Custo do milheiro — o número decisório do combo carrinho + transferência */}
            {promo.milheiroCost && (
              <div className="rounded-[20px] bg-white p-4 shadow-nubank">
                <p className="section-label mb-1.5">Custo do milheiro</p>
                <p className="font-display text-[26px] font-bold leading-none tracking-tight tabular-nums text-primary">
                  {formatMilheiroBRL(promo.milheiroCost)}
                  <span className="ml-1.5 text-sm font-medium text-nubank-text-secondary">
                    por 1.000 pontos
                  </span>
                </p>
                {promo.milheiroNote && (
                  <p className="mt-2 text-[12.5px] leading-snug text-nubank-text-secondary">
                    {promo.milheiroNote}
                  </p>
                )}
              </div>
            )}
```

- [ ] **Step 4: Rodar testes + gates de tipo**

Run: `npx vitest run src/pages/BonusOfferDetailScreen.test.tsx` → Expected: PASS
Run: `npx tsc -b` → Expected: sem erros
Run: `npm test` → Expected: suíte inteira verde

- [ ] **Step 5: Commit**

```bash
git add src/components/bonus/PromoRow.tsx src/components/bonus/BonusPromotionsSection.tsx src/pages/BonusOfferDetailScreen.tsx src/pages/BonusOfferDetailScreen.test.tsx
git commit -m "feat(usuario): milheiro efetivo como badge na linha/hero/detalhe + bloco Custo do milheiro"
```

---

### Task 5: Backend — linha do milheiro no card de curadoria + selects

**Files:**
- Modify: `backend/src/lib/promoMessage.js` (após a linha do `bonus_value`)
- Modify: `backend/src/routes/agentPromo.js:32` (select)
- Modify: `backend/src/routes/promoAlerts.js:15` (select)
- Test: `backend/src/lib/promoMessage.test.js`

**Interfaces:**
- Consumes: colunas `milheiro_cost`/`milheiro_note` (Task 1).
- Produces: card WhatsApp com linha `💰 Milheiro: R$ 15,58 — <nota>`; `/api/promo-alerts` devolvendo as colunas novas pro front (Task 2 as consome via `mapPromoAlertRow`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar em `backend/src/lib/promoMessage.test.js`:

```js
test("milheiro efetivo entra no card com valor pt-BR e nota (moderador valida o número)", () => {
  const msg = buildPromoModerationMessage(
    { ...promo, milheiro_cost: 15.58, milheiro_note: "Carrinho Esfera + transferência com 70%" },
    { apiBaseUrl: BASE, secret: SECRET },
  );
  assert.match(msg, /💰 Milheiro: R\$ 15,58 — Carrinho Esfera \+ transferência com 70%/);
});

test("milheiro sem nota mostra só o valor; sem milheiro não há linha", () => {
  const comCusto = buildPromoModerationMessage(
    { ...promo, milheiro_cost: "13.44" },
    { apiBaseUrl: BASE, secret: SECRET },
  );
  assert.match(comCusto, /💰 Milheiro: R\$ 13,44/);
  const sem = buildPromoModerationMessage(promo, { apiBaseUrl: BASE, secret: SECRET });
  assert.doesNotMatch(sem, /Milheiro/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend; npm test`
Expected: FAIL nos 2 testes novos (linha de milheiro ausente).

- [ ] **Step 3: Implementar**

Em `backend/src/lib/promoMessage.js`, logo após `if (promo.bonus_value) lines.push(...)`:

```js
  // Postgres numeric pode chegar como string pelo PostgREST — coagir antes de formatar.
  const milheiroCost = Number(promo.milheiro_cost);
  if (Number.isFinite(milheiroCost) && milheiroCost > 0) {
    const cost = `R$ ${milheiroCost.toFixed(2).replace(".", ",")}`;
    lines.push(
      promo.milheiro_note ? `💰 Milheiro: ${cost} — ${promo.milheiro_note}` : `💰 Milheiro: ${cost}`,
    );
  }
```

Em `backend/src/routes/agentPromo.js` (select da promo, linha 32) — acrescentar as 2 colunas:

```js
      .select("id, category, source_program, target_program, title, bonus_value, valid_until, confidence, details, cta_url, source_links, milheiro_cost, milheiro_note")
```

Em `backend/src/routes/promoAlerts.js` (select público, linha 15):

```js
        "id, category, source_program, target_program, title, bonus_value, bonus_numeric, tiers, valid_from, valid_until, details, cta_url, source_links, milheiro_cost, milheiro_note",
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend; npm test`
Expected: PASS (todos — incluindo o teste existente de "sem undefined/null no texto").

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/promoMessage.js backend/src/lib/promoMessage.test.js backend/src/routes/agentPromo.js backend/src/routes/promoAlerts.js
git commit -m "feat(backend): card de curadoria mostra o milheiro efetivo + selects com as colunas novas"
```

---

### Task 6: n8n — prompt, guarda anti-alucinação e upsert (arquivo local) + fixture

**Files:**
- Modify: `scripts/n8n/gm-promo-ingest.workflow.json` (nodes `gmpi-extract`, `gmpi-parse`, `gmpi-upsert`)
- Modify: `scripts/n8n/fixtures/promo-extract-golden.json`

**Interfaces:**
- Consumes: colunas da Task 1; `article_text` produzido pelo node `gmpi-prep`.
- Produces: JSON do LLM com `milheiro_cost`/`milheiro_note`, validado no parse, persistido no upsert. Push pro n8n só na Task 7.

- [ ] **Step 1: Prompt do `gmpi-extract`**

No `jsonBody` do node `gmpi-extract` (string única com `\n` escapado), inserir ANTES de `confidence:` as 2 instruções (manter o mesmo estilo de chave: nome, dois pontos, regra):

```
milheiro_cost: número em reais do custo por 1.000 pontos/milhas no programa de DESTINO, somente se o artigo publicar esse custo explicitamente (ex. "milheiro a R$ 15,58", "1.000 milhas a partir de R$ 15,58"). NUNCA calcule você mesmo a partir de preços e bônus; se o artigo não publicar o número pronto, null. Reporte sempre o custo por 1.000 (milheiro), melhor caso publicado.
milheiro_note: como o artigo diz que se chega nesse custo (carrinho, clube, Pix, transferência com bônus), máx 200 caracteres, texto próprio em pt-BR; null se milheiro_cost for null.
```

No mesmo node, subir `max_tokens` de `1024` pra `1280` (2 campos novos + tiers longos não podem estourar o orçamento de saída).

- [ ] **Step 2: Guarda no `gmpi-parse`**

No `jsCode` do node `gmpi-parse`, inserir APÓS o bloco de higiene do `cta_url` (antes de `const slug = …`):

```js
// Guarda anti-alucinação do milheiro: o número tem que estar LITERALMENTE no artigo
// (grafias 15,58 / 15.58 / inteiro com borda de dígito), faixa R$ 1–200. Regex puro
// (sandbox sem globals). $('gmpi-prep') atravessa só o gmpi-extract (httpRequest 1:1) — seguro.
{
  const rawCost = out.milheiro_cost
  out.milheiro_cost = null
  const costNum = typeof rawCost === 'number' ? rawCost : parseFloat(String(rawCost ?? '').replace(',', '.'))
  if (Number.isFinite(costNum) && costNum >= 1 && costNum <= 200) {
    const article = String($('gmpi-prep').item.json.article_text || '')
    const forms = [costNum.toFixed(2).replace('.', ','), costNum.toFixed(2)]
    if (Number.isInteger(costNum)) forms.push(String(costNum))
    const hit = forms.some((f) => new RegExp('(?<!\\d)' + f.replace('.', '\\.') + '(?!\\d)').test(article))
    if (hit) out.milheiro_cost = costNum
  }
  out.milheiro_note =
    out.milheiro_cost != null && out.milheiro_note ? String(out.milheiro_note).slice(0, 200) : null
}
```

- [ ] **Step 3: Upsert com as 2 colunas**

No node `gmpi-upsert`, a `query` vira (colunas novas entre `cta_url` e `source_links`; params renumerados $12→$18):

```sql
insert into public.promo_alerts
  (category, source_program, target_program, title, bonus_value, bonus_numeric,
   tiers, valid_from, valid_until, details, cta_url, milheiro_cost, milheiro_note,
   source_links, canonical_key, confidence, raw)
values
  ($1, $2, $3, $4, $5, $6, $7::jsonb, nullif($8,'')::date, nullif($9,'')::date, $10, $11,
   $12::numeric, $13,
   jsonb_build_array(jsonb_build_object('name', $14::text, 'url', $15::text)), $16, $17, $18::jsonb)
on conflict (canonical_key) do update set
  source_links = (
    select jsonb_agg(distinct e) from jsonb_array_elements(
      promo_alerts.source_links || excluded.source_links
    ) as e
  ),
  updated_at = now()
returning id, status, (xmax = 0) as is_new;
```

E o `queryReplacement` (expressão-array única, valores simples — número/texto curto):

```
={{ [$json.category, $json.source_program, $json.target_program, $json.title, $json.bonus_value, $json.bonus_numeric, JSON.stringify($json.tiers ?? null), $json.valid_from || '', $json.valid_until || '', $json.details, $json.cta_url, $json.milheiro_cost, $json.milheiro_note, $json.source_name, $json.source_url, $json.canonical_key, $json.confidence, JSON.stringify($json)] }}
```

- [ ] **Step 4: Fixture golden**

Em `scripts/n8n/fixtures/promo-extract-golden.json`: (a) adicionar `"milheiro_cost": null, "milheiro_note": null` ao `json_extraido` de TODAS as entradas existentes; (b) acrescentar 1 entrada nova com milheiro, baseada no post real Esfera→Smiles:

```json
{
  "entrada_normalizada": {
    "source": "melhoresdestinos",
    "external_id": "https://www.melhoresdestinos.com.br/?p=999001",
    "title": "Transfira pontos Esfera para a Smiles com até 70% de bônus (milheiro por R$ 15,58!)",
    "link": "https://www.melhoresdestinos.com.br/bonus-esfera-smiles-jul26.html",
    "content": "A Smiles está com uma nova promoção de transferência de pontos Esfera com bônus de até 70%. Usando a opção de pontos + dinheiro no carrinho da Esfera, é possível comprar 1.000 milhas a partir de R$ 15,58, um dos melhores custos do ano. Para participar, acesse a página da promoção (https://www.smiles.com.br/promocao-esfera) e transfira até 31/07.",
    "pub_date": "Sat, 11 Jul 2026 12:00:00 +0000"
  },
  "json_extraido": {
    "is_promo": true,
    "category": "transfer",
    "source_program": "Esfera",
    "target_program": "Smiles",
    "title": "Transfira Esfera para Smiles com até 70% de bônus",
    "bonus_value": "até 70%",
    "bonus_numeric": 70,
    "tiers": null,
    "valid_from": null,
    "valid_until": "2026-07-31",
    "details": "Transferência de pontos Esfera para Smiles com bônus de até 70%. Com a opção pontos + dinheiro no carrinho da Esfera, 1.000 milhas saem a partir de R$ 15,58.",
    "cta_url": "https://www.smiles.com.br/promocao-esfera",
    "milheiro_cost": 15.58,
    "milheiro_note": "Comprando pontos com a opção pontos + dinheiro no carrinho da Esfera e transferindo com até 70% de bônus",
    "confidence": 0.9
  }
}
```

- [ ] **Step 5: Verificar que os 2 JSONs parseiam e a guarda funciona isolada**

Run: `node -e "JSON.parse(require('fs').readFileSync('scripts/n8n/gm-promo-ingest.workflow.json','utf8')); JSON.parse(require('fs').readFileSync('scripts/n8n/fixtures/promo-extract-golden.json','utf8')); console.log('json ok')"`
Expected: `json ok`

Run (simula a guarda fora do n8n — colar o bloco da guarda num script inline):

```bash
node -e "
const article = 'comprar 1.000 milhas a partir de R\$ 15,58, um dos melhores custos';
const check = (raw) => {
  let out = null;
  const costNum = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(',', '.'));
  if (Number.isFinite(costNum) && costNum >= 1 && costNum <= 200) {
    const forms = [costNum.toFixed(2).replace('.', ','), costNum.toFixed(2)];
    if (Number.isInteger(costNum)) forms.push(String(costNum));
    if (forms.some((f) => new RegExp('(?<!\\\\d)' + f.replace('.', '\\\\.') + '(?!\\\\d)').test(article))) out = costNum;
  }
  return out;
};
console.log(check(15.58) === 15.58 ? 'ok literal' : 'FALHOU literal');
console.log(check(19.99) === null ? 'ok alucinado' : 'FALHOU alucinado');
console.log(check(1558) === null ? 'ok faixa' : 'FALHOU faixa');
"
```
Expected: `ok literal` / `ok alucinado` / `ok faixa`

- [ ] **Step 6: Commit**

```bash
git add scripts/n8n/gm-promo-ingest.workflow.json scripts/n8n/fixtures/promo-extract-golden.json
git commit -m "feat(usuario): pipeline extrai o milheiro efetivo com guarda anti-alucinação (só o que o artigo publica)"
```

---

### Task 7: Validação ao vivo + rollout coordenado (CHECKPOINTS com o owner)

**Files:**
- Nenhum arquivo novo — execução/coordenação. Push do workflow: `node scripts/n8n/push-workflow.mjs` (lê `N8N_API_KEY`; UA de browser embutido — API atrás de Cloudflare).

**Interfaces:**
- Consumes: tudo das Tasks 1–6.
- Produces: feature no ar de ponta a ponta.

- [ ] **Step 1: Prompt lab — provar a extração ANTES do merge**

Criar via API do n8n um workflow temporário `webhook → Anthropic (mesma credencial do n8n) → respond` com o prompt NOVO do `gmpi-extract` (receita da memória: a credencial mora no n8n; criar/ativar/chamar `/webhook/<path>`/deletar via API, sempre com User-Agent de browser). Testar 3 casos com os artigos reais:

1. Post Esfera→Smiles (fonte da promo `8c47852b`) → espera `milheiro_cost: 15.58` + nota citando carrinho/pontos+dinheiro.
2. Post Inter→Azul (fonte da promo `19701e47`) → espera `milheiro_cost: 13.44`.
3. Um post de transferência SEM custo publicado (ex. fonte da promo Livelo→Smiles `10c505c1`) → espera `milheiro_cost: null`.

Expected: 3/3. Se o LLM falhar, iterar o prompt no lab (segundos por ciclo) até fechar, e retro-portar pro JSON do workflow (novo commit). Deletar o workflow temporário ao final.

- [ ] **Step 2: Gates finais + PR**

Run (raiz): `npx tsc -b` + `npm test` + `npm run build` → tudo verde
Run: `cd backend; npm test` → verde

```bash
git push -u origin feat/promo-milheiro-efetivo
gh pr create --title "feat(usuario): milheiro efetivo nas promoções (fase 1.1)" --body "(resumo + link da spec + checklist de rollout)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 3: ⚠️ CHECKPOINT — OK do owner pra migration (banco compartilhado, sem staging)**

Só com aprovação explícita: aplicar `supabase/migrations/20260712120000_promo_alerts_milheiro.sql` no projeto `jntkpcjmmnaghmimdcam` (MCP `apply_migration`). Verificar: `select column_name from information_schema.columns where table_name='promo_alerts' and column_name like 'milheiro%'` → 2 linhas.

- [ ] **Step 4: Merge do PR e verificação dos 2 deploys**

Após migration aplicada: merge. Auto-deploy dos 2 projetos Vercel. Smoke: `GET https://<api>/api/promo-alerts` → 200 com as chaves `milheiro_cost`/`milheiro_note` presentes (null nas promos antigas).

- [ ] **Step 5: Push do workflow pro n8n**

Run: `node scripts/n8n/push-workflow.mjs scripts/n8n/gm-promo-ingest.workflow.json kf33adWMPKMAEv4C`
Verificar que o workflow segue ATIVO e aguardar/conferir a próxima execução agendada (timestamps da API são UTC): itens novos não podem falhar no upsert.

- [ ] **Step 6: Backfill opcional das vigentes (com OK do owner)**

UPDATE manual via SQL nas 2 promos vigentes com custo publicado conhecido (Esfera→Smiles `8c47852b` → 15.58; Inter→Azul `19701e47` → 13.44), com `milheiro_note` curta. Conferir no app web que o badge e o bloco aparecem.

- [ ] **Step 7: Smoke visual + fechar**

Hub `/bonus-offers` + detalhe no dev/prod (Playwright ou browser): badge `R$ 15,58 / milheiro` na linha, hero ok, bloco "Custo do milheiro" no detalhe, card WhatsApp com a linha 💰 na próxima promo nova. Atualizar memória (`promocoes-automaticas-built.md`) com o status da fase 1.1.

---

## Self-review do plano (feito na escrita)

- **Cobertura da spec:** dados (T1), pipeline prompt+guarda+upsert (T6), prompt lab (T7.1), backend card+selects (T5), front tipos/map (T2), badge ponto único (T3), 3 superfícies + bloco detalhe (T4), `pickHighlightId` intocado (nenhuma task o altera — correto), backfill opcional (T7.6), gates (T4/T7.2).
- **Tipos consistentes:** `milheiroCost?: number`/`milheiroNote?: string` (T2) = o que T3/T4 consomem; `formatMilheiroBRL` definido em T3 e importado em T4; colunas `milheiro_cost`/`milheiro_note` idênticas em T1/T5/T6.
- **Sem placeholders:** todo step de código tem o código; comandos têm expected.
