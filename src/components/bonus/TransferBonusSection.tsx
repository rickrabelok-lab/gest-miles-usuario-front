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
