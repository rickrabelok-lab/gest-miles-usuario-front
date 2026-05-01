// src/hooks/useBonusPromotions.ts
import { useMemo } from 'react'
import { BONUS_PROMOTIONS, BonusCategory, BonusPromotion } from '@/lib/bonusMockData'
import { isExpiringToday } from '@/lib/bonusUtils'

export function useBonusPromotions(category?: BonusCategory): {
  promotions: BonusPromotion[]
  highlight: BonusPromotion | null
  activeCount: number
  expiringToday: number
} {
  const promotions = useMemo(() => {
    const active = BONUS_PROMOTIONS.filter(p => p.isActive)
    return category ? active.filter(p => p.category === category) : active
  }, [category])

  const highlight = useMemo(
    () => BONUS_PROMOTIONS.find(p => p.isActive && p.isHighlight) ?? null,
    []
  )

  const activeCount = promotions.length

  const expiringToday = useMemo(
    () => promotions.filter(p => isExpiringToday(p.expiresAt)).length,
    [promotions]
  )

  return { promotions, highlight, activeCount, expiringToday }
}
