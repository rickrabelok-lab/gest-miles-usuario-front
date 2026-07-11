// src/components/bonus/MilesBonusSection.tsx
import { Fragment, RefObject } from 'react'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'
import { PromoRow } from '@/components/bonus/PromoRow'

interface Props {
  sectionRef?: RefObject<HTMLDivElement>
}

export function MilesBonusSection({ sectionRef }: Props) {
  const { promotions } = useBonusPromotions('miles')

  if (promotions.length === 0) return null

  return (
    <div ref={sectionRef} className="mb-6">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="section-label mb-0">Milhas</h3>
        <span className="text-[11px] font-medium text-nubank-text-secondary">
          {promotions.length} {promotions.length === 1 ? 'ativa' : 'ativas'}
        </span>
      </div>

      <div className="rounded-[20px] bg-white py-1 shadow-nubank">
        {promotions.map((promo, index) => (
          <Fragment key={promo.id}>
            {index > 0 && <div className="mx-3.5 h-px bg-[#F1F0F3]" />}
            <PromoRow promo={promo} />
          </Fragment>
        ))}
      </div>
    </div>
  )
}
