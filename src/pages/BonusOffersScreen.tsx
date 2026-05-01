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
