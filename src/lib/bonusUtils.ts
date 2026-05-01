// src/lib/bonusUtils.ts
import { BonusCategory } from '@/lib/bonusMockData'

export interface CategoryConfig {
  emoji: string
  color: string
  label: string
}

export const CATEGORY_CONFIG: Record<BonusCategory, CategoryConfig> = {
  transfer: { emoji: '🔄', color: '#8A05BE', label: 'Transferência' },
  shopping: { emoji: '🛍', color: '#e67e22', label: 'Compras' },
  miles: { emoji: '✈️', color: '#27ae60', label: 'Milhas' },
  cards: { emoji: '💳', color: '#3498db', label: 'Cartão' },
}

export function isExpiringToday(expiresAt?: string): boolean {
  if (!expiresAt) return false
  const expiry = new Date(expiresAt)
  const today = new Date()
  return (
    expiry.getFullYear() === today.getFullYear() &&
    expiry.getMonth() === today.getMonth() &&
    expiry.getDate() === today.getDate()
  )
}
