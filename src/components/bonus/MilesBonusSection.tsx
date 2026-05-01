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
