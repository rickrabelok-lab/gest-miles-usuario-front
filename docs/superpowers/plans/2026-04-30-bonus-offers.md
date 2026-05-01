# Promoções Bonificadas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar hub completo de promoções bonificadas com preview na Home, página de listagem com scroll+filtros por categoria, e tela de detalhe com tiers de bônus.

**Architecture:** Folder-por-domínio em `src/components/bonus/`. Mock data centralizado em `src/lib/bonusMockData.ts`. Hook `useBonusPromotions` como única fonte de dados. Cada categoria tem seu próprio componente de seção. `BonusOfferSection` (singular) substitui `BonusOffersSection` (plural) na Home.

**Tech Stack:** React 18, React Router v6, TypeScript, Tailwind CSS (classes `text-nubank-text`, `text-nubank-text-secondary`, `shadow-nubank`, `text-primary`, `bg-primary` já existem no projeto).

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/lib/bonusMockData.ts` | Criar | Tipos `BonusPromotion`, `BonusTier`, `BonusCategory` + array `BONUS_PROMOTIONS` |
| `src/hooks/useBonusPromotions.ts` | Criar | Filtragem por categoria, highlight, contagens |
| `src/components/bonus/BonusOfferSection.tsx` | Criar | Preview na Home: hero + lista rápida |
| `src/components/bonus/TransferBonusSection.tsx` | Criar | Seção de transferências na página completa |
| `src/components/bonus/ShoppingBonusSection.tsx` | Criar | Carrossel de programas de compras |
| `src/components/bonus/MilesBonusSection.tsx` | Criar | Seção de milhas |
| `src/components/bonus/CardBonusSection.tsx` | Criar | Seção de cartões |
| `src/pages/BonusOffersScreen.tsx` | Reescrever | Página /bonus-offers com pills + scroll-to-section |
| `src/pages/BonusOfferDetailScreen.tsx` | Criar | Tela /bonus-offers/:id com tabs + tiers + CTA |
| `src/App.tsx` | Modificar | Adicionar rota `/bonus-offers/:id` |
| `src/pages/Index.tsx` | Modificar | Trocar `BonusOffersSection` → `BonusOfferSection` |

---

## Task 1: Tipos e Mock Data

**Files:**
- Create: `src/lib/bonusMockData.ts`

- [ ] **Step 1: Criar o arquivo com tipos e dados mockados**

```typescript
// src/lib/bonusMockData.ts

export type BonusCategory = 'transfer' | 'shopping' | 'miles' | 'cards'

export interface BonusTier {
  label: string
  value: string
  isBest?: boolean
}

export interface BonusPromotion {
  id: string
  category: BonusCategory
  targetProgram: string
  bonusValue: string
  bonusLabel: string
  participatingBanks?: string[]
  tiers?: BonusTier[]
  partnerStores?: number
  maxBonus?: number
  expiresAt?: string
  isActive: boolean
  isHighlight: boolean
  ctaUrl?: string
  rules?: string
}

export const BONUS_PROMOTIONS: BonusPromotion[] = [
  {
    id: 'tudoazul-120-transfer',
    category: 'transfer',
    targetProgram: 'TudoAzul',
    bonusValue: '120%',
    bonusLabel: 'de bônus',
    participatingBanks: ['C6 Atomos', 'Itaú', 'Sicredi', 'Itaucard', 'Merece', 'Mais Itaucard'],
    tiers: [
      { label: 'Clube Azul há +5 anos', value: '120%', isBest: true },
      { label: 'Clube Azul 3–4 anos', value: '110%' },
      { label: 'Clube Azul 1–2 anos', value: '100%' },
      { label: 'Clube Azul 6–11 meses', value: '95%' },
      { label: 'Assinantes do Clube Azul', value: '90%' },
      { label: 'Clientes Azul', value: '60%' },
    ],
    maxBonus: 300000,
    expiresAt: new Date(new Date().setHours(23, 59, 0, 0)).toISOString(),
    isActive: true,
    isHighlight: true,
    ctaUrl: 'https://www.voeazul.com.br/tudoazul/transferencia-bonificada',
    rules:
      'Promoção válida para transferências realizadas até a data de encerramento às 23:59. O bônus é aplicado sobre os pontos transferidos e creditado em até 10 dias úteis. Não cumulativo com outras promoções. O percentual de bônus varia conforme o tempo de assinatura do Clube Azul.',
  },
  {
    id: 'latampass-25-transfer',
    category: 'transfer',
    targetProgram: 'LATAM Pass',
    bonusValue: '25%',
    bonusLabel: 'de bônus',
    participatingBanks: ['Itaú', 'Itaucard', 'Credicard'],
    expiresAt: new Date(new Date().setHours(23, 59, 0, 0)).toISOString(),
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://www.latampass.com.br/pontos/transferencia',
    rules:
      'Promoção válida para transferências de pontos Itaú, Itaucard e Credicard para LATAM Pass realizadas até a data de encerramento às 23:59. Todos os clientes LATAM Pass são elegíveis.',
  },
  {
    id: 'livelo-shopping',
    category: 'shopping',
    targetProgram: 'Livelo',
    bonusValue: '85',
    bonusLabel: 'pts/R$',
    partnerStores: 200,
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://www.livelo.com.br/ganhe-pontos',
    rules:
      'Pontuação variável por loja parceira. Compre pelo portal Livelo para garantir a pontuação. Consulte o portal para o multiplicador específico de cada loja.',
  },
  {
    id: 'esfera-shopping',
    category: 'shopping',
    targetProgram: 'Esfera',
    bonusValue: '30',
    bonusLabel: 'pts/R$',
    partnerStores: 80,
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://www.esfera.com.vc/portal-de-pontos',
    rules:
      'Pontuação variável por loja. Acesse o portal Esfera antes de finalizar a compra para garantir os pontos.',
  },
  {
    id: 'tudoazul-shopping',
    category: 'shopping',
    targetProgram: 'TudoAzul',
    bonusValue: '25',
    bonusLabel: 'pts/R$',
    partnerStores: 24,
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://www.voeazul.com.br/tudoazul/loja-tudoazul',
    rules:
      'Pontuação variável por loja. Compre pelo portal TudoAzul. Consulte o portal para o multiplicador de cada loja parceira.',
  },
  {
    id: 'smiles-miles-discount',
    category: 'miles',
    targetProgram: 'Smiles',
    bonusValue: '-30%',
    bonusLabel: 'na compra',
    maxBonus: 50000,
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://www.smiles.com.br/compra-de-milhas',
    rules:
      'Desconto de 30% na compra de milhas Smiles. Limite de 50.000 milhas por CPF durante a promoção. Milhas creditadas imediatamente após a compra.',
  },
  {
    id: 'nubank-card-offer',
    category: 'cards',
    targetProgram: 'Nubank Ultravioleta',
    bonusValue: '2× pts',
    bonusLabel: 'em viagens',
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://nubank.com.br/ultravioleta',
    rules:
      'Dobro de pontos Nubank em compras nas categorias viagens (passagens aéreas e hotéis). Válido exclusivamente para portadores do cartão Nubank Ultravioleta.',
  },
]
```

- [ ] **Step 2: Verificar tipos com TypeScript**

```bash
cd "src" && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros relacionados a `bonusMockData.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/bonusMockData.ts
git commit -m "feat: adicionar tipos e mock data de promoções bonificadas"
```

---

## Task 2: Hook `useBonusPromotions`

**Files:**
- Create: `src/hooks/useBonusPromotions.ts`

- [ ] **Step 1: Criar o hook**

```typescript
// src/hooks/useBonusPromotions.ts
import { useMemo } from 'react'
import { BONUS_PROMOTIONS, BonusCategory, BonusPromotion } from '@/lib/bonusMockData'

function isExpiringToday(expiresAt?: string): boolean {
  if (!expiresAt) return false
  const expiry = new Date(expiresAt)
  const today = new Date()
  return (
    expiry.getFullYear() === today.getFullYear() &&
    expiry.getMonth() === today.getMonth() &&
    expiry.getDate() === today.getDate()
  )
}

export function useBonusPromotions(category?: BonusCategory): {
  promotions: BonusPromotion[]
  highlight: BonusPromotion | null
  activeCount: number
  expiringToday: number
} {
  const promotions = useMemo(() => {
    const active = BONUS_PROMOTIONS.filter(p => p.isActive)
    return category ? active.filter(p => p.category === category) : active
  }, [category])

  const highlight = useMemo(
    () => BONUS_PROMOTIONS.find(p => p.isActive && p.isHighlight) ?? null,
    []
  )

  const activeCount = promotions.length

  const expiringToday = useMemo(
    () => promotions.filter(p => isExpiringToday(p.expiresAt)).length,
    [promotions]
  )

  return { promotions, highlight, activeCount, expiringToday }
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useBonusPromotions.ts
git commit -m "feat: hook useBonusPromotions com filtragem por categoria"
```

---

## Task 3: `BonusOfferSection` — Preview na Home

**Files:**
- Create: `src/components/bonus/BonusOfferSection.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/bonus/BonusOfferSection.tsx
import { useNavigate } from 'react-router-dom'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'
import { BonusCategory, BonusPromotion } from '@/lib/bonusMockData'

const CATEGORY_CONFIG: Record<BonusCategory, { emoji: string; color: string; label: string }> = {
  transfer: { emoji: '🔄', color: '#8A05BE', label: 'Transferência' },
  shopping: { emoji: '🛍', color: '#e67e22', label: 'Compras' },
  miles: { emoji: '✈️', color: '#27ae60', label: 'Milhas' },
  cards: { emoji: '💳', color: '#3498db', label: 'Cartão' },
}

function isExpiringToday(expiresAt?: string): boolean {
  if (!expiresAt) return false
  const expiry = new Date(expiresAt)
  const today = new Date()
  return (
    expiry.getFullYear() === today.getFullYear() &&
    expiry.getMonth() === today.getMonth() &&
    expiry.getDate() === today.getDate()
  )
}

function QuickItem({ promo }: { promo: BonusPromotion }) {
  const navigate = useNavigate()
  const cat = CATEGORY_CONFIG[promo.category]
  return (
    <button
      onClick={() => navigate(`/bonus-offers/${promo.id}`)}
      className="flex w-full items-center justify-between rounded-xl border border-[#f0e8ff] bg-white px-3 py-2.5 text-left shadow-nubank active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-[#f8f5ff] text-base">
          {cat.emoji}
        </span>
        <div>
          <p className="text-[11px] font-bold text-nubank-text">
            {promo.targetProgram} — {cat.label}
          </p>
          {promo.partnerStores && (
            <p className="text-[9px] text-nubank-text-secondary">
              {promo.partnerStores}+ lojas parceiras
            </p>
          )}
          {promo.participatingBanks && !promo.partnerStores && (
            <p className="text-[9px] text-nubank-text-secondary">
              {promo.participatingBanks.slice(0, 2).join(', ')}
            </p>
          )}
        </div>
      </div>
      <span className="ml-3 text-base font-black" style={{ color: cat.color }}>
        {promo.bonusValue}
      </span>
    </button>
  )
}

export default function BonusOfferSection() {
  const navigate = useNavigate()
  const { promotions, highlight, activeCount, expiringToday } = useBonusPromotions()

  const quickList = promotions.filter(p => !p.isHighlight).slice(0, 3)

  return (
    <section className="px-5 pb-6">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-nubank-text">
            Promoções Bonificadas
          </h2>
          <p className="mt-0.5 text-xs text-nubank-text-secondary">
            {activeCount} ativas
            {expiringToday > 0 ? ` · ${expiringToday} encerram hoje` : ''}
          </p>
        </div>
        <button
          onClick={() => navigate('/bonus-offers')}
          className="rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
        >
          Ver tudo →
        </button>
      </div>

      {/* Hero banner */}
      {highlight && (
        <button
          onClick={() => navigate(`/bonus-offers/${highlight.id}`)}
          className="mb-3 w-full overflow-hidden rounded-2xl text-left shadow-[0_4px_20px_rgba(138,5,190,0.25)] active:scale-[0.99] transition-transform"
          style={{ background: 'linear-gradient(135deg, #8A05BE 0%, #B56CFF 100%)' }}
        >
          <div className="relative p-4">
            <div className="pointer-events-none absolute right-[-20px] top-[-20px] h-24 w-24 rounded-full bg-white/5" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">
              🔥 Destaque do dia
            </p>
            <p className="mt-0.5 text-sm font-bold text-white">
              {highlight.targetProgram} — {CATEGORY_CONFIG[highlight.category].label}
            </p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-4xl font-black leading-none text-white">
                {highlight.bonusValue}
              </span>
              <span className="text-sm text-white/90">{highlight.bonusLabel}</span>
            </div>
            {highlight.participatingBanks && (
              <p className="mt-1 text-[10px] text-white/70">
                {highlight.participatingBanks.slice(0, 4).join(' · ')}
              </p>
            )}
            {isExpiringToday(highlight.expiresAt) && (
              <span className="mt-2 inline-block rounded-lg bg-white/20 px-2 py-0.5 text-[10px] text-white">
                ⏰ Encerra hoje às 23:59
              </span>
            )}
          </div>
        </button>
      )}

      {/* Quick list */}
      <div className="flex flex-col gap-2">
        {quickList.map(promo => (
          <QuickItem key={promo.id} promo={promo} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/components/bonus/BonusOfferSection.tsx
git commit -m "feat: criar BonusOfferSection para preview na Home"
```

---

## Task 4: `TransferBonusSection`

**Files:**
- Create: `src/components/bonus/TransferBonusSection.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/bonus/TransferBonusSection.tsx
import { RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'

function isExpiringToday(expiresAt?: string): boolean {
  if (!expiresAt) return false
  const expiry = new Date(expiresAt)
  const today = new Date()
  return (
    expiry.getFullYear() === today.getFullYear() &&
    expiry.getMonth() === today.getMonth() &&
    expiry.getDate() === today.getDate()
  )
}

interface Props {
  sectionRef?: RefObject<HTMLDivElement>
}

export function TransferBonusSection({ sectionRef }: Props) {
  const navigate = useNavigate()
  const { promotions } = useBonusPromotions('transfer')

  if (promotions.length === 0) return null

  return (
    <div ref={sectionRef} className="mb-6">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-base">🔄</span>
        <h3 className="text-[13px] font-bold" style={{ color: '#8A05BE' }}>
          Transferências Bonificadas
        </h3>
        <span className="text-[10px] text-nubank-text-secondary">{promotions.length} ativas</span>
      </div>

      <div className="flex flex-col gap-3">
        {promotions.map(promo => (
          <button
            key={promo.id}
            onClick={() => navigate(`/bonus-offers/${promo.id}`)}
            className="flex w-full items-center justify-between rounded-2xl border border-[#f0e8ff] bg-white p-3.5 text-left shadow-nubank active:scale-[0.99] transition-transform"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wide text-nubank-text-secondary">
                Programa destino
              </p>
              <p className="mt-0.5 text-sm font-bold text-nubank-text">{promo.targetProgram}</p>
              {promo.participatingBanks && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {promo.participatingBanks.slice(0, 4).map(bank => (
                    <span
                      key={bank}
                      className="rounded-md bg-[#f0e8ff] px-1.5 py-0.5 text-[9px] font-semibold text-[#8A05BE]"
                    >
                      {bank}
                    </span>
                  ))}
                  {promo.participatingBanks.length > 4 && (
                    <span className="rounded-md bg-[#f0e8ff] px-1.5 py-0.5 text-[9px] font-semibold text-[#8A05BE]">
                      +{promo.participatingBanks.length - 4}
                    </span>
                  )}
                </div>
              )}
              {isExpiringToday(promo.expiresAt) && (
                <p className="mt-1.5 text-[9px] font-semibold text-red-500">⏰ Encerra hoje</p>
              )}
            </div>

            <div
              className="ml-3 flex-shrink-0 rounded-xl p-2.5 text-center text-white"
              style={{ background: 'linear-gradient(135deg, #8A05BE, #B56CFF)' }}
            >
              <p className="text-xl font-black leading-none">{promo.bonusValue}</p>
              <p className="text-[9px] opacity-90">{promo.bonusLabel}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/bonus/TransferBonusSection.tsx
git commit -m "feat: criar TransferBonusSection para listagem de transferências"
```

---

## Task 5: `ShoppingBonusSection`

**Files:**
- Create: `src/components/bonus/ShoppingBonusSection.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
// src/components/bonus/ShoppingBonusSection.tsx
import { RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'

const PROGRAM_EMOJI: Record<string, string> = {
  Livelo: '💗',
  Esfera: '⭐',
  TudoAzul: '✈️',
  Smiles: '🌟',
}

interface Props {
  sectionRef?: RefObject<HTMLDivElement>
}

export function ShoppingBonusSection({ sectionRef }: Props) {
  const navigate = useNavigate()
  const { promotions } = useBonusPromotions('shopping')

  if (promotions.length === 0) return null

  const maxStores = Math.max(...promotions.map(p => p.partnerStores ?? 0))

  return (
    <div ref={sectionRef} className="mb-6">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-base">🛍</span>
        <h3 className="text-[13px] font-bold" style={{ color: '#e67e22' }}>
          Compras Bonificadas
        </h3>
        <span className="text-[10px] text-nubank-text-secondary">{maxStores}+ lojas</span>
      </div>

      <div
        className="flex gap-3 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {promotions.map(promo => (
          <button
            key={promo.id}
            onClick={() => navigate(`/bonus-offers/${promo.id}`)}
            className="flex-shrink-0 w-[88px] rounded-2xl border border-[#f0e8ff] bg-white p-3 text-center shadow-nubank active:scale-[0.98] transition-transform"
          >
            <span className="text-2xl">
              {PROGRAM_EMOJI[promo.targetProgram] ?? '🏬'}
            </span>
            <p className="mt-1 text-[9px] font-bold text-nubank-text leading-tight">
              {promo.targetProgram}
            </p>
            <p className="text-base font-black" style={{ color: '#e67e22' }}>
              {promo.bonusValue}
            </p>
            <p className="text-[8px] text-nubank-text-secondary">{promo.bonusLabel}</p>
          </button>
        ))}

        {/* "Ver tudo" placeholder — fase 2 */}
        <div className="flex-shrink-0 w-[72px] rounded-2xl border border-dashed border-[#d8b4fe] bg-[#faf5ff] p-3 flex items-center justify-center">
          <span className="text-[10px] font-semibold text-[#8A05BE] leading-tight text-center">
            Ver tudo →
          </span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/bonus/ShoppingBonusSection.tsx
git commit -m "feat: criar ShoppingBonusSection com carrossel de programas"
```

---

## Task 6: `MilesBonusSection` e `CardBonusSection`

**Files:**
- Create: `src/components/bonus/MilesBonusSection.tsx`
- Create: `src/components/bonus/CardBonusSection.tsx`

- [ ] **Step 1: Criar MilesBonusSection**

```tsx
// src/components/bonus/MilesBonusSection.tsx
import { RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'

interface Props {
  sectionRef?: RefObject<HTMLDivElement>
}

export function MilesBonusSection({ sectionRef }: Props) {
  const navigate = useNavigate()
  const { promotions } = useBonusPromotions('miles')

  if (promotions.length === 0) return null

  return (
    <div ref={sectionRef} className="mb-6">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-base">✈️</span>
        <h3 className="text-[13px] font-bold" style={{ color: '#27ae60' }}>
          Promoções de Milhas
        </h3>
        <span className="text-[10px] text-nubank-text-secondary">{promotions.length} ativas</span>
      </div>

      <div className="flex flex-col gap-3">
        {promotions.map(promo => (
          <button
            key={promo.id}
            onClick={() => navigate(`/bonus-offers/${promo.id}`)}
            className="flex w-full items-center justify-between rounded-2xl border border-[#f0e8ff] bg-white p-3.5 text-left shadow-nubank active:scale-[0.99] transition-transform"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wide text-nubank-text-secondary">
                Compra de milhas
              </p>
              <p className="mt-0.5 text-sm font-bold text-nubank-text">{promo.targetProgram}</p>
              {promo.maxBonus && (
                <p className="mt-1 text-[9px] text-nubank-text-secondary">
                  Bônus máx: {promo.maxBonus.toLocaleString('pt-BR')} pts
                </p>
              )}
            </div>

            <div
              className="ml-3 flex-shrink-0 rounded-xl p-2.5 text-center text-white"
              style={{ background: 'linear-gradient(135deg, #27ae60, #2ecc71)' }}
            >
              <p className="text-xl font-black leading-none">{promo.bonusValue}</p>
              <p className="text-[9px] opacity-90">{promo.bonusLabel}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Criar CardBonusSection**

```tsx
// src/components/bonus/CardBonusSection.tsx
import { RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'

interface Props {
  sectionRef?: RefObject<HTMLDivElement>
}

export function CardBonusSection({ sectionRef }: Props) {
  const navigate = useNavigate()
  const { promotions } = useBonusPromotions('cards')

  if (promotions.length === 0) return null

  return (
    <div ref={sectionRef} className="mb-6">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-base">💳</span>
        <h3 className="text-[13px] font-bold" style={{ color: '#3498db' }}>
          Promoções de Cartões
        </h3>
        <span className="text-[10px] text-nubank-text-secondary">{promotions.length} ofertas</span>
      </div>

      <div className="flex flex-col gap-3">
        {promotions.map(promo => (
          <button
            key={promo.id}
            onClick={() => navigate(`/bonus-offers/${promo.id}`)}
            className="flex w-full items-center justify-between rounded-2xl border border-[#f0e8ff] bg-white p-3.5 text-left shadow-nubank active:scale-[0.99] transition-transform"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-wide text-nubank-text-secondary">
                Oferta de cartão
              </p>
              <p className="mt-0.5 text-sm font-bold text-nubank-text">{promo.targetProgram}</p>
              <p className="mt-0.5 text-[9px] text-nubank-text-secondary">{promo.bonusLabel}</p>
            </div>

            <div
              className="ml-3 flex-shrink-0 rounded-xl p-2.5 text-center text-white"
              style={{ background: 'linear-gradient(135deg, #2c3e50, #3498db)' }}
            >
              <p className="text-xl font-black leading-none">{promo.bonusValue}</p>
              <p className="text-[9px] opacity-90">bônus</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/components/bonus/MilesBonusSection.tsx src/components/bonus/CardBonusSection.tsx
git commit -m "feat: criar MilesBonusSection e CardBonusSection"
```

---

## Task 7: Reescrever `BonusOffersScreen`

**Files:**
- Modify: `src/pages/BonusOffersScreen.tsx` (reescrita completa)

- [ ] **Step 1: Substituir o conteúdo do arquivo**

```tsx
// src/pages/BonusOffersScreen.tsx
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BonusCategory } from '@/lib/bonusMockData'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'
import { TransferBonusSection } from '@/components/bonus/TransferBonusSection'
import { ShoppingBonusSection } from '@/components/bonus/ShoppingBonusSection'
import { MilesBonusSection } from '@/components/bonus/MilesBonusSection'
import { CardBonusSection } from '@/components/bonus/CardBonusSection'

const PILLS: { id: BonusCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'transfer', label: '🔄 Transferências' },
  { id: 'shopping', label: '🛍 Compras' },
  { id: 'miles', label: '✈️ Milhas' },
  { id: 'cards', label: '💳 Cartões' },
]

export default function BonusOffersScreen() {
  const navigate = useNavigate()
  const [activePill, setActivePill] = useState<BonusCategory | 'all'>('all')
  const { activeCount, expiringToday } = useBonusPromotions()

  const transferRef = useRef<HTMLDivElement>(null)
  const shoppingRef = useRef<HTMLDivElement>(null)
  const milesRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)

  const sectionRefs: Record<BonusCategory, React.RefObject<HTMLDivElement>> = {
    transfer: transferRef,
    shopping: shoppingRef,
    miles: milesRef,
    cards: cardsRef,
  }

  function handlePillClick(id: BonusCategory | 'all') {
    setActivePill(id)
    if (id === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    sectionRefs[id].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ background: 'linear-gradient(135deg, #8A05BE 0%, #9E2FD4 100%)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="text-white text-xl font-light leading-none"
        >
          ←
        </button>
        <div>
          <h1 className="text-white font-bold text-base leading-tight">Promoções Bonificadas</h1>
          <p className="text-white/70 text-[10px]">
            {activeCount} ativas
            {expiringToday > 0 ? ` · ${expiringToday} encerram hoje` : ''}
          </p>
        </div>
      </div>

      {/* Pills */}
      <div
        className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-white px-4 py-2.5 shadow-sm border-b border-[#f0e8ff]"
        style={{ scrollbarWidth: 'none' } as React.CSSProperties}
      >
        {PILLS.map(pill => (
          <button
            key={pill.id}
            onClick={() => handlePillClick(pill.id)}
            className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              activePill === pill.id
                ? 'bg-primary text-white'
                : 'bg-[#f0e8ff] text-primary'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-4 pt-4 pb-24">
        <TransferBonusSection sectionRef={transferRef} />
        <ShoppingBonusSection sectionRef={shoppingRef} />
        <MilesBonusSection sectionRef={milesRef} />
        <CardBonusSection sectionRef={cardsRef} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/BonusOffersScreen.tsx
git commit -m "feat: reescrever BonusOffersScreen com pills e scroll-to-section"
```

---

## Task 8: Criar `BonusOfferDetailScreen`

**Files:**
- Create: `src/pages/BonusOfferDetailScreen.tsx`

- [ ] **Step 1: Criar a tela de detalhe**

```tsx
// src/pages/BonusOfferDetailScreen.tsx
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BONUS_PROMOTIONS, BonusCategory } from '@/lib/bonusMockData'

const CATEGORY_CONFIG: Record<BonusCategory, { gradient: string; color: string }> = {
  transfer: { gradient: 'linear-gradient(135deg, #8A05BE, #B56CFF)', color: '#8A05BE' },
  shopping: { gradient: 'linear-gradient(135deg, #e67e22, #f39c12)', color: '#e67e22' },
  miles: { gradient: 'linear-gradient(135deg, #27ae60, #2ecc71)', color: '#27ae60' },
  cards: { gradient: 'linear-gradient(135deg, #2c3e50, #3498db)', color: '#3498db' },
}

type ActiveTab = 'promotion' | 'rules'

export default function BonusOfferDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<ActiveTab>('promotion')

  const promo = BONUS_PROMOTIONS.find(p => p.id === id)

  if (!promo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f7f7f8] px-6 text-center">
        <p className="text-nubank-text-secondary">Promoção não encontrada.</p>
        <button
          onClick={() => navigate('/bonus-offers')}
          className="rounded-xl bg-primary/10 px-4 py-2 text-sm font-semibold text-primary"
        >
          Ver promoções
        </button>
      </div>
    )
  }

  const config = CATEGORY_CONFIG[promo.category]

  function formatExpiry(): string | null {
    if (!promo!.expiresAt) return null
    const expiry = new Date(promo!.expiresAt)
    const date = expiry.toLocaleDateString('pt-BR')
    const time = expiry.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return `⏰ Encerra em ${date} às ${time}`
  }

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: 'linear-gradient(135deg, #8A05BE 0%, #9E2FD4 100%)' }}
      >
        <button onClick={() => navigate(-1)} className="text-xl font-light leading-none text-white">
          ←
        </button>
        <h1 className="text-base font-bold text-white">{promo.targetProgram}</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#f0e8ff] bg-white">
        {(['promotion', 'rules'] as ActiveTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-[12px] font-bold transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-primary text-primary'
                : 'text-nubank-text-secondary'
            }`}
          >
            {tab === 'promotion' ? 'Promoção' : 'Regras'}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 pb-24">
        {activeTab === 'promotion' ? (
          <>
            {/* Hero badge */}
            <div
              className="relative mb-4 overflow-hidden rounded-2xl p-5 text-center text-white"
              style={{ background: config.gradient }}
            >
              <div className="pointer-events-none absolute right-[-30px] top-[-30px] h-28 w-28 rounded-full bg-white/5" />
              <p className="text-6xl font-black leading-none">{promo.bonusValue}</p>
              <p className="mt-2 text-sm opacity-90">{promo.bonusLabel}</p>
              <p className="mt-1 text-xs opacity-75">
                {promo.category === 'transfer'
                  ? `Transfira seus pontos para ${promo.targetProgram}`
                  : promo.targetProgram}
              </p>
            </div>

            {/* Tiers */}
            {promo.tiers && promo.tiers.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-nubank-text-secondary">
                  Bônus por perfil
                </p>
                <div className="flex flex-col gap-2">
                  {promo.tiers.map((tier, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                        tier.isBest
                          ? 'border border-[#8A05BE]/30 bg-[#f0e8ff]'
                          : 'border border-[#f0e8ff] bg-white'
                      }`}
                    >
                      <span className="text-[11px] text-nubank-text">{tier.label}</span>
                      <span className="text-base font-black" style={{ color: config.color }}>
                        {tier.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Max bonus */}
            {promo.maxBonus && (
              <div className="mb-4 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2.5 text-center">
                <p className="text-[10px] font-semibold text-yellow-700">
                  ⚠️ Bônus máximo da promoção: {promo.maxBonus.toLocaleString('pt-BR')} pts
                </p>
              </div>
            )}

            {/* Participating banks */}
            {promo.participatingBanks && promo.participatingBanks.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-nubank-text-secondary">
                  Bancos participantes
                </p>
                <div className="flex flex-wrap gap-2">
                  {promo.participatingBanks.map(bank => (
                    <span
                      key={bank}
                      className="rounded-full bg-[#f0e8ff] px-3 py-1 text-[10px] font-semibold text-[#8A05BE]"
                    >
                      {bank}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Expiry */}
            {formatExpiry() && (
              <p className="mb-4 text-center text-[10px] font-semibold text-red-500">
                {formatExpiry()}
              </p>
            )}

            {/* CTA */}
            {promo.ctaUrl && (
              <a
                href={promo.ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-2xl py-4 text-center text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(138,5,190,0.3)]"
                style={{ background: 'linear-gradient(135deg, #8A05BE, #B56CFF)' }}
              >
                Cadastrar-se na promoção →
              </a>
            )}
          </>
        ) : (
          /* Rules tab */
          <div className="rounded-2xl border border-[#f0e8ff] bg-white p-4">
            <p className="text-[12px] leading-relaxed text-nubank-text">
              {promo.rules ??
                'Consulte o site do programa para mais informações sobre as regras desta promoção.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/BonusOfferDetailScreen.tsx
git commit -m "feat: criar BonusOfferDetailScreen com tabs, tiers e CTA"
```

---

## Task 9: Wiring — Rotas e Home

**Files:**
- Modify: `src/App.tsx` — adicionar rota `/bonus-offers/:id`
- Modify: `src/pages/Index.tsx` — trocar `BonusOffersSection` por `BonusOfferSection`

- [ ] **Step 1: Adicionar import e rota em `App.tsx`**

Em `src/App.tsx`, adicionar o import na linha 22 (após o import de `BonusOffersScreen`):

```typescript
// Adicionar após: import BonusOffersScreen from "./pages/BonusOffersScreen";
import BonusOfferDetailScreen from "./pages/BonusOfferDetailScreen";
```

Adicionar a rota após o bloco `/bonus-offers` (linhas 154–161):

```tsx
// Adicionar após o Route de /bonus-offers:
<Route
  path="/bonus-offers/:id"
  element={
    <ClienteOnly>
      <BonusOfferDetailScreen />
    </ClienteOnly>
  }
/>
```

- [ ] **Step 2: Trocar BonusOffersSection por BonusOfferSection em `Index.tsx`**

Em `src/pages/Index.tsx` linha 17, substituir:

```typescript
// ANTES:
import BonusOffersSection from "@/components/bonus/BonusOffersSection";

// DEPOIS:
import BonusOfferSection from "@/components/bonus/BonusOfferSection";
```

Em `src/pages/Index.tsx` linha 2227, substituir:

```tsx
{/* ANTES: */}
<BonusOffersSection />

{/* DEPOIS: */}
<BonusOfferSection />
```

- [ ] **Step 3: Verificar tipos**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Esperado: zero erros.

- [ ] **Step 4: Rodar o dev server e verificar visualmente**

```bash
npm run dev
```

Verificar:
1. Home: seção "Promoções Bonificadas" exibe hero roxo TudoAzul 120% + lista rápida com 3 itens
2. "Ver tudo →" navega para `/bonus-offers`
3. `/bonus-offers`: header roxo, pills funcionais com scroll-to-section, 4 seções carregadas
4. Tap em qualquer promo navega para `/bonus-offers/:id`
5. `/bonus-offers/:id` TudoAzul: hero 120%, 6 tiers, aviso de bônus máx, bancos participantes, CTA
6. Tab "Regras" exibe o texto de regras
7. Botão ← navega de volta

- [ ] **Step 5: Commit final**

```bash
git add src/App.tsx src/pages/Index.tsx
git commit -m "feat: conectar BonusOfferSection na Home e rota /bonus-offers/:id"
```
