# "Pra você" — Personalização in-app (Fase 3-A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma seção "Pra você" no topo do hub `/bonus-offers` que mostra as transferências bonificadas que casam com a carteira do cliente (programa de origem com saldo > 0), com o cálculo do resultado ("Seus 82.000 Livelo → 164.000 na Smiles").

**Architecture:** 100% client-side. Cruza dados que o cliente já lê por RLS — promos aprovadas (`useBonusPromotions('transfer')`) × carteira (`useProgramasCliente`). Lógica pura e testável (`normalizeProgramToId`, `crossPromosWithWallet`), um hook fino (`usePersonalizedPromos`), e um componente de seção (`PraVoceSection`) fixado no topo do `BonusOffersScreen` com um pill novo. Zero backend, zero migration.

**Tech Stack:** React 18 + TypeScript (frouxo) + TanStack Query + Vitest + Testing Library. Tailwind (paleta `nubank`, roxo primário `#8A05BE`).

## Global Constraints

- **Comunicação/UI em PT-BR.** Descrições de teste em PT-BR; `vi.clearAllMocks()` no `beforeEach`.
- **Só client-side:** nenhuma escrita, nenhuma tabela/migration/RLS/rota nova.
- **Escopo só `category === 'transfer'`.** miles/shopping/cards ficam de fora.
- **Match:** origem reconhecida (`normalizeProgramToId` != null) **E** carteira com esse `program_id` e `saldo > 0`.
- **Cálculo:** `resultado = round(saldo × (1 + bonusNumeric/100))`; sem `bonusNumeric` → `resultado = null`.
- **`normalizeProgramToId` nunca chuta:** desconhecido → `null` (item some do "Pra você", segue na seção Transferências normal).
- **Números em pt-BR na UI:** `valor.toLocaleString('pt-BR')`. Nos testes, asserir o **número** (ex.: `164000`), não a string formatada (locale do node varia).
- **Gates antes de "pronto":** `npx tsc -b` + `npm test` + `npm run build`. Não dizer "pronto" sem os três.
- **Não commitar** arquivos alheios já sujos no working tree (`.claude/settings.local.json`, `CLAUDE.md`, `backend/.gitignore`). Cada commit adiciona só os arquivos da task.

---

### Task 1: `normalizeProgramToId` + tabela de alias

**Files:**
- Create: `src/lib/promo-alerts/matching.ts`
- Test: `src/lib/promo-alerts/matching.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `normalizeProgramToId(text: string | null | undefined): string | null` — normaliza (sem acento, minúsculo, só `[a-z0-9]`) e resolve pra um `program_id` do catálogo, ou `null`.

- [ ] **Step 1: Write the failing test**

`src/lib/promo-alerts/matching.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeProgramToId } from './matching'

describe('normalizeProgramToId', () => {
  it('resolve origens comuns de transferência (com e sem acento/variações)', () => {
    expect(normalizeProgramToId('Livelo')).toBe('livelo')
    expect(normalizeProgramToId('Esfera')).toBe('esfera')
    expect(normalizeProgramToId('Itaú')).toBe('itau')
    expect(normalizeProgramToId('Itau')).toBe('itau')
    expect(normalizeProgramToId('Inter Loop')).toBe('inter-loop')
    expect(normalizeProgramToId('Inter')).toBe('inter-loop')
    expect(normalizeProgramToId('C6')).toBe('atomos-c6')
    expect(normalizeProgramToId('Átomos C6')).toBe('atomos-c6')
    expect(normalizeProgramToId('Amex')).toBe('amex')
  })

  it('resolve destinos comuns (pra uso futuro / robustez)', () => {
    expect(normalizeProgramToId('Smiles')).toBe('smiles')
    expect(normalizeProgramToId('LATAM Pass')).toBe('latam-pass')
    expect(normalizeProgramToId('Tudo Azul')).toBe('tudo-azul')
  })

  it('não chuta: texto desconhecido, vazio ou nulo → null', () => {
    expect(normalizeProgramToId('Programa Inexistente')).toBeNull()
    expect(normalizeProgramToId('')).toBeNull()
    expect(normalizeProgramToId(null)).toBeNull()
    expect(normalizeProgramToId(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/promo-alerts/matching.test.ts`
Expected: FAIL — `normalizeProgramToId is not a function` / módulo não encontrado.

- [ ] **Step 3: Write minimal implementation**

`src/lib/promo-alerts/matching.ts`:

```ts
// src/lib/promo-alerts/matching.ts
// Resolve o nome de programa (texto livre do extrator LLM em promo_alerts) para
// um program_id canônico do catálogo (mesmos slugs de programSelectionUtils).
// Nunca "chuta": desconhecido → null. Alias extensível (1 linha por variação).

/** Normaliza: remove acentos, minúsculo, mantém só [a-z0-9]. */
function norm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // remove marcas de acento combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

// [program_id, variações reconhecidas]. Origens de transferência (livelo/esfera/
// bancos) são o núcleo; destinos aéreos entram por robustez. Evitar tokens
// genéricos ambíguos (ex.: "all", "aa", "avios") pra não gerar falso-positivo.
const ALIASES: Array<[string, string[]]> = [
  ['livelo', ['livelo']],
  ['esfera', ['esfera']],
  ['itau', ['itau', 'itaucard', 'itaucartoes']],
  ['inter-loop', ['interloop', 'inter', 'interpontos', 'loop']],
  ['atomos-c6', ['atomosc6', 'atomos', 'c6', 'c6atomos', 'c6bank']],
  ['amex', ['amex', 'americanexpress', 'membershiprewards', 'amexrewards']],
  ['smiles', ['smiles']],
  ['latam-pass', ['latampass', 'latam']],
  ['tudo-azul', ['tudoazul', 'azul']],
  ['iberia', ['iberia', 'iberiaplus']],
  ['tap', ['tap', 'tapmilesego', 'milesego']],
  ['all-accor', ['allaccor', 'accor']],
  ['american-airlines', ['aadvantage', 'americanairlines']],
  ['copa-airlines', ['copa', 'copaairlines', 'connectmiles']],
  ['qatar-airways', ['qatar', 'qatarairways']],
  ['british-airways', ['britishairways']],
  ['finnair', ['finnair', 'finnairplus']],
]

const BY_NORM: Record<string, string> = {}
for (const [id, names] of ALIASES) {
  for (const name of names) BY_NORM[norm(name)] = id
}

export function normalizeProgramToId(text: string | null | undefined): string | null {
  if (!text) return null
  const key = norm(text)
  if (!key) return null
  return BY_NORM[key] ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/promo-alerts/matching.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/promo-alerts/matching.ts src/lib/promo-alerts/matching.test.ts
git commit -m "feat(usuario): matching de nome de programa -> program_id (pra você)"
```

---

### Task 2: expor `sourceProgram` + `bonusNumeric` em `BonusPromotion`

**Files:**
- Modify: `src/lib/bonusTypes.ts` (interface `BonusPromotion`, após linha 22 `participatingBanks?`)
- Modify: `src/lib/promo-alerts/service.ts` (`mapPromoAlertRow`, retorno linhas 39-59)
- Test: `src/lib/promo-alerts/service.test.ts` (novo)

**Interfaces:**
- Consumes: `mapPromoAlertRow(row): BonusPromotion | null` (já existe).
- Produces: `BonusPromotion` ganha `sourceProgram?: string` e `bonusNumeric?: number`.

- [ ] **Step 1: Write the failing test**

`src/lib/promo-alerts/service.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mapPromoAlertRow } from './service'

describe('mapPromoAlertRow — campos pro "Pra você"', () => {
  it('carrega sourceProgram e bonusNumeric quando presentes', () => {
    const promo = mapPromoAlertRow({
      id: 'p1',
      category: 'transfer',
      source_program: 'Livelo',
      target_program: 'Smiles',
      title: 'Livelo -> Smiles 100%',
      bonus_value: '100%',
      bonus_numeric: 100,
    })
    expect(promo?.sourceProgram).toBe('Livelo')
    expect(promo?.bonusNumeric).toBe(100)
  })

  it('deixa undefined quando ausentes (não quebra)', () => {
    const promo = mapPromoAlertRow({
      id: 'p2',
      category: 'shopping',
      title: 'Oferta',
    })
    expect(promo?.sourceProgram).toBeUndefined()
    expect(promo?.bonusNumeric).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/promo-alerts/service.test.ts`
Expected: FAIL — `promo?.sourceProgram` / `promo?.bonusNumeric` são `undefined` no primeiro teste (campos ainda não mapeados).

- [ ] **Step 3a: Estender a interface**

Em `src/lib/bonusTypes.ts`, logo após a linha `participatingBanks?: string[]`:

```ts
  participatingBanks?: string[]
  /** Programa de origem cru (texto do extrator) — usado no cruzamento com a carteira ("Pra você"). */
  sourceProgram?: string
  /** Percentual do bônus (ex.: 100) — usado no cálculo do resultado personalizado. */
  bonusNumeric?: number
```

- [ ] **Step 3b: Mapear no `mapPromoAlertRow`**

Em `src/lib/promo-alerts/service.ts`, dentro do objeto retornado (após `participatingBanks: ...`), adicionar:

```ts
    participatingBanks: category === 'transfer' && sourceProgram ? [sourceProgram] : undefined,
    sourceProgram: sourceProgram ?? undefined,
    bonusNumeric: Number.isFinite(Number(row.bonus_numeric)) ? Number(row.bonus_numeric) : undefined,
```

(`sourceProgram` já é calculado na linha 22 do arquivo; `row.bonus_numeric` já vem no `select` do service.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/promo-alerts/service.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bonusTypes.ts src/lib/promo-alerts/service.ts src/lib/promo-alerts/service.test.ts
git commit -m "feat(usuario): BonusPromotion expõe sourceProgram + bonusNumeric (pra você)"
```

---

### Task 3: `crossPromosWithWallet` (função pura do cruzamento)

**Files:**
- Modify: `src/lib/promo-alerts/matching.ts` (adicionar a função + tipos)
- Test: `src/lib/promo-alerts/matching.test.ts` (adicionar describe)

**Interfaces:**
- Consumes: `normalizeProgramToId` (Task 1); `BonusPromotion` com `sourceProgram`/`bonusNumeric` (Task 2).
- Produces:
  - `interface WalletProgram { programId: string; saldo: number }`
  - `interface PersonalizedPromo { promo: BonusPromotion; programId: string; saldo: number; resultado: number | null }`
  - `crossPromosWithWallet(promos: BonusPromotion[], wallet: WalletProgram[]): PersonalizedPromo[]` — só `transfer`, só origem na carteira com `saldo>0`, calcula `resultado`, ordena por `resultado` desc (nulls por último), desempate `bonusNumeric` desc.

- [ ] **Step 1: Write the failing test**

Adicionar em `src/lib/promo-alerts/matching.test.ts`:

```ts
import { crossPromosWithWallet } from './matching'
import type { BonusPromotion } from '@/lib/bonusTypes'

function promo(p: Partial<BonusPromotion>): BonusPromotion {
  return {
    id: 'x', category: 'transfer', targetProgram: 'Smiles', title: 't',
    bonusValue: '100%', bonusLabel: 'de bônus', isActive: true, isHighlight: false, ...p,
  }
}

describe('crossPromosWithWallet', () => {
  const wallet = [
    { programId: 'livelo', saldo: 82000 },
    { programId: 'esfera', saldo: 0 },       // tem o programa mas sem saldo
    { programId: 'itau', saldo: 30000 },
  ]

  it('casa origem com saldo>0 e calcula o resultado', () => {
    const items = crossPromosWithWallet(
      [promo({ id: 'a', sourceProgram: 'Livelo', bonusNumeric: 100 })],
      wallet,
    )
    expect(items).toHaveLength(1)
    expect(items[0].programId).toBe('livelo')
    expect(items[0].saldo).toBe(82000)
    expect(items[0].resultado).toBe(164000)
  })

  it('ignora origem sem saldo, origem fora da carteira e não-transfer', () => {
    const items = crossPromosWithWallet(
      [
        promo({ id: 'a', sourceProgram: 'Esfera', bonusNumeric: 90 }),   // saldo 0
        promo({ id: 'b', sourceProgram: 'Smiles', bonusNumeric: 50 }),   // não está na carteira
        promo({ id: 'c', category: 'miles', sourceProgram: 'Livelo' }),  // não é transfer
        promo({ id: 'd', sourceProgram: 'Programa X', bonusNumeric: 80 }), // origem desconhecida
      ],
      wallet,
    )
    expect(items).toHaveLength(0)
  })

  it('ordena por maior resultado', () => {
    const items = crossPromosWithWallet(
      [
        promo({ id: 'itau', sourceProgram: 'Itaú', bonusNumeric: 100 }),  // 30000 -> 60000
        promo({ id: 'livelo', sourceProgram: 'Livelo', bonusNumeric: 50 }), // 82000 -> 123000
      ],
      wallet,
    )
    expect(items.map((i) => i.promo.id)).toEqual(['livelo', 'itau'])
  })

  it('sem bonusNumeric ainda casa, com resultado null', () => {
    const items = crossPromosWithWallet(
      [promo({ id: 'a', sourceProgram: 'Livelo' })],
      wallet,
    )
    expect(items).toHaveLength(1)
    expect(items[0].resultado).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/promo-alerts/matching.test.ts`
Expected: FAIL — `crossPromosWithWallet is not a function`.

- [ ] **Step 3: Write minimal implementation**

Primeiro, adicionar o import **no topo** de `src/lib/promo-alerts/matching.ts`:

```ts
import type { BonusPromotion } from '@/lib/bonusTypes'
```

Depois, adicionar ao **final** do arquivo:

```ts
export interface WalletProgram {
  programId: string
  saldo: number
}

export interface PersonalizedPromo {
  promo: BonusPromotion
  programId: string
  saldo: number
  resultado: number | null
}

/** Cruza promoções de transferência com a carteira: só origem com saldo>0. */
export function crossPromosWithWallet(
  promos: BonusPromotion[],
  wallet: WalletProgram[],
): PersonalizedPromo[] {
  const saldoById = new Map<string, number>()
  for (const w of wallet) {
    const saldo = Number(w.saldo)
    if (Number.isFinite(saldo) && saldo > 0) saldoById.set(w.programId, saldo)
  }

  const items: PersonalizedPromo[] = []
  for (const promo of promos) {
    if (promo.category !== 'transfer') continue
    const programId = normalizeProgramToId(promo.sourceProgram)
    if (!programId) continue
    const saldo = saldoById.get(programId)
    if (!saldo) continue
    const bonus = typeof promo.bonusNumeric === 'number' ? promo.bonusNumeric : null
    const resultado = bonus != null ? Math.round(saldo * (1 + bonus / 100)) : null
    items.push({ promo, programId, saldo, resultado })
  }

  return items.sort((a, b) => {
    const ra = a.resultado ?? -1
    const rb = b.resultado ?? -1
    if (rb !== ra) return rb - ra
    return (b.promo.bonusNumeric ?? 0) - (a.promo.bonusNumeric ?? 0)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/promo-alerts/matching.test.ts`
Expected: PASS (Task 1 + Task 3 = 7 testes no arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/promo-alerts/matching.ts src/lib/promo-alerts/matching.test.ts
git commit -m "feat(usuario): crossPromosWithWallet cruza transfer com carteira (saldo>0)"
```

---

### Task 4: hook `usePersonalizedPromos`

**Files:**
- Create: `src/hooks/usePersonalizedPromos.ts`
- Test: `src/hooks/usePersonalizedPromos.test.tsx`

**Interfaces:**
- Consumes: `useBonusPromotions('transfer')` (`{ promotions, loading, error }`); `useProgramasCliente()` (`{ data, isPending, clientId }`); `crossPromosWithWallet` + `PersonalizedPromo` (Task 3).
- Produces: `usePersonalizedPromos(): { items: PersonalizedPromo[]; loading: boolean; error: string | null }`.

- [ ] **Step 1: Write the failing test**

`src/hooks/usePersonalizedPromos.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersonalizedPromos } from './usePersonalizedPromos'
import type { BonusPromotion } from '@/lib/bonusTypes'

const mocks = vi.hoisted(() => ({ useBonusPromotions: vi.fn(), useProgramasCliente: vi.fn() }))
vi.mock('@/hooks/useBonusPromotions', () => ({ useBonusPromotions: mocks.useBonusPromotions }))
vi.mock('@/hooks/useProgramasCliente', () => ({ useProgramasCliente: mocks.useProgramasCliente }))

function promo(p: Partial<BonusPromotion>): BonusPromotion {
  return {
    id: 'x', category: 'transfer', targetProgram: 'Smiles', title: 't',
    bonusValue: '100%', bonusLabel: 'de bônus', isActive: true, isHighlight: false, ...p,
  }
}

describe('usePersonalizedPromos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useBonusPromotions.mockReturnValue({ promotions: [], loading: false, error: null })
    mocks.useProgramasCliente.mockReturnValue({ data: [], isPending: false, clientId: 'c1' })
  })

  it('cruza promos com a carteira e calcula o resultado', () => {
    mocks.useBonusPromotions.mockReturnValue({
      promotions: [promo({ id: 'a', sourceProgram: 'Livelo', bonusNumeric: 100 })],
      loading: false, error: null,
    })
    mocks.useProgramasCliente.mockReturnValue({
      data: [{ program_id: 'livelo', saldo: 82000 }], isPending: false, clientId: 'c1',
    })
    const { result } = renderHook(() => usePersonalizedPromos())
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].resultado).toBe(164000)
  })

  it('loading enquanto a carteira do cliente logado carrega', () => {
    mocks.useProgramasCliente.mockReturnValue({ data: undefined, isPending: true, clientId: 'c1' })
    const { result } = renderHook(() => usePersonalizedPromos())
    expect(result.current.loading).toBe(true)
  })

  it('sem sessão (clientId null) não fica preso em loading e devolve vazio', () => {
    mocks.useProgramasCliente.mockReturnValue({ data: undefined, isPending: true, clientId: null })
    const { result } = renderHook(() => usePersonalizedPromos())
    expect(result.current.loading).toBe(false)
    expect(result.current.items).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/usePersonalizedPromos.test.tsx`
Expected: FAIL — módulo/hook inexistente.

- [ ] **Step 3: Write minimal implementation**

`src/hooks/usePersonalizedPromos.ts`:

```ts
// src/hooks/usePersonalizedPromos.ts
import { useMemo } from 'react'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'
import { useProgramasCliente } from '@/hooks/useProgramasCliente'
import { crossPromosWithWallet, type PersonalizedPromo, type WalletProgram } from '@/lib/promo-alerts/matching'

export function usePersonalizedPromos(): {
  items: PersonalizedPromo[]
  loading: boolean
  error: string | null
} {
  const { promotions, loading: promosLoading, error } = useBonusPromotions('transfer')
  const { data, isPending, clientId } = useProgramasCliente()

  const walletLoading = !!clientId && isPending

  const items = useMemo<PersonalizedPromo[]>(() => {
    const wallet: WalletProgram[] = (data ?? []).map((row) => ({
      programId: row.program_id,
      saldo: Number(row.saldo) || 0,
    }))
    return crossPromosWithWallet(promotions, wallet)
  }, [promotions, data])

  return { items, loading: promosLoading || walletLoading, error }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/usePersonalizedPromos.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePersonalizedPromos.ts src/hooks/usePersonalizedPromos.test.tsx
git commit -m "feat(usuario): usePersonalizedPromos cruza promos x carteira do cliente"
```

---

### Task 5: `PraVoceSection` + fiação no `BonusOffersScreen` (pill + render)

**Files:**
- Create: `src/components/bonus/PraVoceSection.tsx`
- Modify: `src/pages/BonusOffersScreen.tsx` (PILLS, refs, handlePillClick, render)

**Interfaces:**
- Consumes: `usePersonalizedPromos()` (Task 4); `PromoRow` (`src/components/bonus/PromoRow.tsx`).
- Produces: `PraVoceSection` (default-null quando `loading` ou `items` vazio).

- [ ] **Step 1: Criar `PraVoceSection`**

`src/components/bonus/PraVoceSection.tsx`:

```tsx
// src/components/bonus/PraVoceSection.tsx — transferências que casam com a carteira do cliente.
import { Fragment, RefObject } from 'react'
import { Sparkles } from 'lucide-react'
import { usePersonalizedPromos } from '@/hooks/usePersonalizedPromos'
import { PromoRow } from '@/components/bonus/PromoRow'

interface Props {
  sectionRef?: RefObject<HTMLDivElement>
}

export function PraVoceSection({ sectionRef }: Props) {
  const { items, loading } = usePersonalizedPromos()

  if (loading || items.length === 0) return null

  return (
    <div ref={sectionRef} className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="section-label mb-0 flex items-center gap-1.5">
          <Sparkles size={14} strokeWidth={2.4} className="text-primary" />
          Pra você
        </h3>
        <span className="text-[11px] font-medium text-nubank-text-secondary">
          {items.length} {items.length === 1 ? 'oportunidade' : 'oportunidades'}
        </span>
      </div>

      <div className="rounded-[20px] bg-white py-1 shadow-nubank">
        {items.map((item, index) => (
          <Fragment key={item.promo.id}>
            {index > 0 && <div className="mx-3.5 h-px bg-[#F1F0F3]" />}
            <div>
              <div className="px-3.5 pt-3 text-[12px] font-semibold leading-snug text-primary">
                {item.resultado != null
                  ? `Seus ${item.saldo.toLocaleString('pt-BR')} ${item.promo.sourceProgram} → ${item.resultado.toLocaleString('pt-BR')} na ${item.promo.targetProgram}`
                  : `Você tem ${item.promo.sourceProgram} — dá pra aproveitar`}
              </div>
              <PromoRow promo={item.promo} />
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Fiar no `BonusOffersScreen`**

Em `src/pages/BonusOffersScreen.tsx`:

(a) Import + hook, no topo do componente:

```tsx
import { PraVoceSection } from '@/components/bonus/PraVoceSection'
import { usePersonalizedPromos } from '@/hooks/usePersonalizedPromos'
```

(b) Trocar o tipo do estado do pill e a lista `PILLS` para incluir "Pra você" como primeiro item. Mudar a assinatura de `PILLS` e `activePill` de `BonusCategory | 'all'` para `BonusCategory | 'all' | 'pravoce'`:

```tsx
const PILLS: { id: BonusCategory | 'all' | 'pravoce'; label: string }[] = [
  { id: 'pravoce', label: 'Pra você' },
  { id: 'all', label: 'Tudo' },
  { id: 'transfer', label: 'Transferências' },
  { id: 'shopping', label: 'Compras' },
  { id: 'miles', label: 'Milhas' },
  { id: 'cards', label: 'Cartões' },
]
```

(c) Dentro do componente, ler os itens personalizados e criar o ref da seção:

```tsx
  const [activePill, setActivePill] = useState<BonusCategory | 'all' | 'pravoce'>('all')
  const { activeCount, expiringToday, loading, error } = useBonusPromotions()
  const { items: personalizedItems, loading: personalizedLoading } = usePersonalizedPromos()
  const hasPersonalized = !personalizedLoading && personalizedItems.length > 0

  const praVoceRef = useRef<HTMLDivElement>(null)
```

(d) Filtrar o pill "Pra você" quando não há itens, e tratar o scroll. Trocar o `.map(PILLS)` por uma lista filtrada e ajustar `handlePillClick`:

```tsx
  function handlePillClick(id: BonusCategory | 'all' | 'pravoce') {
    setActivePill(id)
    if (id === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (id === 'pravoce') {
      praVoceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    sectionRefs[id].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
```

E no JSX dos pills, filtrar o "pravoce" quando `!hasPersonalized`:

```tsx
        {PILLS.filter((pill) => pill.id !== 'pravoce' || hasPersonalized).map(pill => (
```

(e) Renderizar `<PraVoceSection sectionRef={praVoceRef} />` no bloco de conteúdo, **logo após o `notice`** e antes de `<TransferBonusSection ... />`:

```tsx
        {!loading && !error && activeCount === 0 && (
          <p className="py-10 text-center text-sm text-nubank-text-secondary">
            Nenhuma promoção ativa no momento. Volte em breve!
          </p>
        )}
        <PraVoceSection sectionRef={praVoceRef} />
        <TransferBonusSection sectionRef={transferRef} />
```

- [ ] **Step 3: Type-check + build + testes completos**

Run: `npx tsc -b`
Expected: sem erros.

Run: `npm test`
Expected: toda a suíte passa (inclui os novos arquivos).

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/components/bonus/PraVoceSection.tsx src/pages/BonusOffersScreen.tsx
git commit -m "feat(usuario): seção 'Pra você' no topo do hub de bônus (pill + cálculo)"
```

---

## Notas de execução

- **Ordem TDD:** cada task escreve o teste antes da implementação e roda o vermelho→verde. Não pular o passo do vermelho.
- **Sem duplicação de dados:** o mesmo card segue aparecendo na seção Transferências normal; "Pra você" é adicional, não substitui.
- **Follow-ups (fora deste plano, registrar ao final):** miles/shopping/cards no "Pra você"; "Pra você" na Home; disparo proativo WhatsApp (Fase 3-B); milheiro no cálculo; CTA "cadastre programas" no empty state; **confirmar se o hub é forkado no manager** e replicar lá (regra `sync-user-app-changes-to-manager`).
- **Verificação visual (skill `verify`/`run`):** subir o app e conferir a seção com uma conta que tenha Livelo/Esfera com saldo e uma promo transfer aprovada vigente. Se não houver promo vigente que case, a seção fica (corretamente) oculta.
