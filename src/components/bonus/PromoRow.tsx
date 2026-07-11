// src/components/bonus/PromoRow.tsx — linha padrão de promoção (title-first, dado real de LLM)
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { BonusPromotion } from '@/lib/bonusTypes'
import { bonusBadge, formatExpiryShort, isExpiringToday } from '@/lib/bonusUtils'
import { BonusProgramLogo } from '@/components/bonus/BonusProgramLogo'

export function PromoRow({ promo }: { promo: BonusPromotion }) {
  const navigate = useNavigate()
  const badge = bonusBadge(promo.bonusValue)
  const expiry = formatExpiryShort(promo.expiresAt)
  const source = promo.sourceLinks?.[0]?.name

  return (
    <button
      onClick={() => navigate(`/bonus-offers/${promo.id}`)}
      className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-transform active:scale-[0.99]"
    >
      <BonusProgramLogo program={promo.targetProgram} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[13.5px] font-semibold leading-snug text-nubank-text">
          {promo.title}
        </span>
        {(expiry || source) && (
          <span className="mt-0.5 block truncate text-[11.5px] text-nubank-text-secondary">
            {expiry && (
              <span
                className={
                  isExpiringToday(promo.expiresAt)
                    ? 'font-semibold text-destructive-strong'
                    : undefined
                }
              >
                {expiry}
              </span>
            )}
            {expiry && source ? ' · ' : ''}
            {source ? `via ${source}` : ''}
          </span>
        )}
      </span>
      {badge ? (
        <span className="flex-none text-right">
          <span className="block font-display text-base font-bold leading-tight tabular-nums text-primary">
            {badge.value}
          </span>
          {badge.label && (
            <span className="block text-[10px] font-medium text-nubank-text-secondary">
              {badge.label}
            </span>
          )}
        </span>
      ) : (
        <ChevronRight size={16} strokeWidth={2} className="flex-none text-[#A9A8AE]" />
      )}
    </button>
  )
}
