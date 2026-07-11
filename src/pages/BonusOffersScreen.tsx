// src/pages/BonusOffersScreen.tsx
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { BONUS_PROMOTIONS_SOURCE_NOTICE, BonusCategory } from '@/lib/bonusTypes'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'
import { TransferBonusSection } from '@/components/bonus/TransferBonusSection'
import { ShoppingBonusSection } from '@/components/bonus/ShoppingBonusSection'
import { MilesBonusSection } from '@/components/bonus/MilesBonusSection'
import { CardBonusSection } from '@/components/bonus/CardBonusSection'

const PILLS: { id: BonusCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'transfer', label: 'Transferências' },
  { id: 'shopping', label: 'Compras' },
  { id: 'miles', label: 'Milhas' },
  { id: 'cards', label: 'Cartões' },
]

export default function BonusOffersScreen() {
  const navigate = useNavigate()
  const [activePill, setActivePill] = useState<BonusCategory | 'all'>('all')
  const { activeCount, expiringToday, loading, error } = useBonusPromotions()

  const transferRef = useRef<HTMLDivElement>(null)
  const shoppingRef = useRef<HTMLDivElement>(null)
  const milesRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)

  const sectionRefs = useMemo<Record<BonusCategory, React.RefObject<HTMLDivElement>>>(
    () => ({ transfer: transferRef, shopping: shoppingRef, miles: milesRef, cards: cardsRef }),
    []
  )

  function handlePillClick(id: BonusCategory | 'all') {
    setActivePill(id)
    if (id === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    sectionRefs[id].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
            className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-nubank-border bg-white text-nubank-text transition-colors hover:bg-nubank-bg"
          >
            <ArrowLeft size={19} strokeWidth={2} />
          </button>
          <h1 className="font-display text-xl font-bold tracking-tight text-nubank-text">
            Bônus
          </h1>
        </div>
        <span className="rounded-full bg-nubank-tint px-3 py-1.5 text-[11.5px] font-semibold leading-none text-nubank-dark">
          {activeCount} {activeCount === 1 ? 'ativa' : 'ativas'}
          {expiringToday > 0
            ? ` · ${expiringToday} ${expiringToday === 1 ? 'encerra' : 'encerram'} hoje`
            : ''}
        </span>
      </div>

      {/* Pills */}
      <div
        className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-nubank-bg/95 px-5 py-2.5 backdrop-blur-sm scrollbar-hide"
      >
        {PILLS.map(pill => (
          <button
            key={pill.id}
            onClick={() => handlePillClick(pill.id)}
            className={`flex-shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold transition-colors ${
              activePill === pill.id
                ? 'bg-primary text-white'
                : 'bg-[#F1F0F3] text-[#54535A] hover:bg-white'
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-5 pt-2 pb-24">
        <div className="mb-4 rounded-[16px] bg-warning-soft px-4 py-3">
          <p className="text-[11.5px] font-medium leading-snug text-warning-strong">
            {BONUS_PROMOTIONS_SOURCE_NOTICE}
          </p>
        </div>
        {loading && (
          <p className="py-10 text-center text-sm text-nubank-text-secondary">Carregando promoções…</p>
        )}
        {!loading && error && (
          <p className="py-10 text-center text-sm text-nubank-text-secondary">{error}</p>
        )}
        {!loading && !error && activeCount === 0 && (
          <p className="py-10 text-center text-sm text-nubank-text-secondary">
            Nenhuma promoção ativa no momento. Volte em breve!
          </p>
        )}
        <TransferBonusSection sectionRef={transferRef} />
        <ShoppingBonusSection sectionRef={shoppingRef} />
        <MilesBonusSection sectionRef={milesRef} />
        <CardBonusSection sectionRef={cardsRef} />
      </div>
    </div>
  )
}
