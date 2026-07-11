// src/components/bonus/ShoppingBonusSection.tsx
import { Fragment, RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'
import { BonusProgramLogo } from '@/components/bonus/BonusProgramLogo'

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
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="section-label mb-0">Compras online</h3>
        {maxStores > 0 && (
          <span className="text-[11px] font-medium text-nubank-text-secondary">
            {maxStores}+ lojas
          </span>
        )}
      </div>

      <div className="rounded-[20px] bg-white py-1 shadow-nubank">
        {promotions.map((promo, index) => (
          <Fragment key={promo.id}>
            {index > 0 && <div className="mx-3.5 h-px bg-[#F1F0F3]" />}
            <button
              onClick={() => navigate(`/bonus-offers/${promo.id}`)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-transform active:scale-[0.99]"
            >
              <BonusProgramLogo program={promo.targetProgram} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-nubank-text">
                  {promo.targetProgram}
                </span>
                {promo.partnerStores && (
                  <span className="block truncate text-xs text-nubank-text-secondary">
                    {promo.partnerStores}+ lojas parceiras
                  </span>
                )}
              </span>
              <span className="text-right">
                <span className="block font-display text-xl font-bold tabular-nums text-primary">
                  {promo.bonusValue}
                </span>
                <span className="block text-[10.5px] font-medium text-nubank-text-secondary">
                  {promo.bonusLabel}
                </span>
              </span>
            </button>
          </Fragment>
        ))}
      </div>
    </div>
  )
}
