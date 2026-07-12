// src/components/bonus/PromoRow.tsx — linha padrão de promoção (title-first, dado real de LLM)
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { BonusPromotion } from '@/lib/bonusTypes'
import { CATEGORY_CONFIG, bonusBadge, formatExpiryShort, isExpiringToday } from '@/lib/bonusUtils'
import { BonusProgramLogo } from '@/components/bonus/BonusProgramLogo'

export function PromoRow({ promo }: { promo: BonusPromotion }) {
  const navigate = useNavigate()
  const badge = bonusBadge(promo.bonusValue, promo.milheiroCost)
  const expiry = formatExpiryShort(promo.expiresAt)
  const expiringToday = isExpiringToday(promo.expiresAt)
  const cat = CATEGORY_CONFIG[promo.category]

  return (
    <button
      onClick={() => navigate(`/bonus-offers/${promo.id}`)}
      className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition-transform active:scale-[0.99]"
    >
      <BonusProgramLogo program={promo.targetProgram} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-[13.5px] font-semibold leading-snug text-nubank-text">
          {promo.title}
        </span>
        <span className="mt-1 flex items-center gap-1.5">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em]"
            style={{ color: cat.color, backgroundColor: `${cat.color}14` }}
          >
            {cat.label}
          </span>
          {expiry && (
            <span
              className={`text-[11px] font-medium ${
                expiringToday ? 'font-semibold text-destructive-strong' : 'text-nubank-text-secondary'
              }`}
            >
              {expiry}
            </span>
          )}
        </span>
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
