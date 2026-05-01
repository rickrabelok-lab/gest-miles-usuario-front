// src/lib/bonusUtils.ts
import { BonusCategory } from '@/lib/bonusMockData'

export interface CategoryConfig {
  emoji: string
  color: string
  gradient: string
  label: string
}

export const CATEGORY_CONFIG: Record<BonusCategory, CategoryConfig> = {
  transfer: { emoji: '🔄', color: '#8A05BE', gradient: 'linear-gradient(135deg, #8A05BE, #B56CFF)', label: 'Transferência' },
  shopping: { emoji: '🛍', color: '#e67e22', gradient: 'linear-gradient(135deg, #e67e22, #f39c12)', label: 'Compras' },
  miles:    { emoji: '✈️', color: '#27ae60', gradient: 'linear-gradient(135deg, #27ae60, #2ecc71)', label: 'Milhas' },
  cards:    { emoji: '💳', color: '#3498db', gradient: 'linear-gradient(135deg, #2c3e50, #3498db)', label: 'Cartão' },
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
