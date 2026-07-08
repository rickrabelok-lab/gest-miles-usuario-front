// src/components/bonus/TransferBonusSection.tsx
import { Fragment, RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'
import { isExpiringToday } from '@/lib/bonusUtils'
import { BonusProgramLogo } from '@/components/bonus/BonusProgramLogo'

function formatExpiryShort(expiresAt?: string): string | null {
  if (!expiresAt) return null
  if (isExpiringToday(expiresAt)) return 'encerra hoje'
  const date = new Date(expiresAt)
  return `até ${date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
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
      <div className="mb-2.5 flex items-baseline justify-between">
        <h3 className="section-label mb-0">Transferências</h3>
        <span className="text-[11px] font-medium text-nubank-text-secondary">
          {promotions.length} {promotions.length === 1 ? 'ativa' : 'ativas'}
        </span>
      </div>

      <div className="rounded-[20px] bg-white py-1 shadow-nubank">
        {promotions.map((promo, index) => {
          const banks = promo.participatingBanks?.slice(0, 2).join(', ')
          const expiry = formatExpiryShort(promo.expiresAt)
          return (
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
                  <span className="block truncate text-xs text-nubank-text-secondary">
                    {banks}
                    {banks && expiry ? ' · ' : ''}
                    {expiry ? (
                      <span
                        className={
                          isExpiringToday(promo.expiresAt)
                            ? 'font-semibold text-destructive-strong'
                            : undefined
                        }
                      >
                        {expiry}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="font-display text-xl font-bold tabular-nums text-primary">
                  {promo.bonusValue}
                </span>
              </button>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
