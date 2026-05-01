// src/hooks/useBonusPromotions.ts
import { useMemo } from 'react'
import { BONUS_PROMOTIONS, BonusCategory, BonusPromotion } from '@/lib/bonusMockData'

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
