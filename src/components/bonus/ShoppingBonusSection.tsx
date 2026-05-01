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

  const maxStores = Math.max(0, ...promotions.map(p => p.partnerStores ?? 0))

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
        <div
          aria-disabled="true"
          className="flex-shrink-0 w-[72px] cursor-default pointer-events-none rounded-2xl border border-dashed border-[#d8b4fe] bg-[#faf5ff] p-3 flex items-center justify-center"
        >
          <span className="text-[10px] font-semibold text-[#8A05BE] leading-tight text-center opacity-60">
            Ver tudo →
          </span>
        </div>
      </div>
    </div>
  )
}
