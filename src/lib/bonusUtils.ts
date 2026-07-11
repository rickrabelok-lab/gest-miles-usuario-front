// src/lib/bonusUtils.ts
import { BonusCategory } from '@/lib/bonusTypes'

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

export function formatExpiryShort(expiresAt?: string): string | null {
  if (!expiresAt) return null
  if (isExpiringToday(expiresAt)) return 'encerra hoje'
  const date = new Date(expiresAt)
  return `até ${date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}`
}

/**
 * O tratamento tipográfico grande (valor em destaque) só funciona com token CURTO.
 * bonus_value vem livre do LLM: curto => badge; longo => o título carrega a promoção.
 * Percentual ganha rótulo; valor com unidade embutida ("21 pts/R$") não repete rótulo.
 */
export function bonusBadge(bonusValue?: string): { value: string; label?: string } | null {
  const value = (bonusValue ?? '').trim()
  if (!value || value.length > 12) return null
  if (/^(até\s+)?-\d+([.,]\d+)?\s*%$/i.test(value)) return { value, label: 'de desconto' }
  if (/^(até\s+)?\d+([.,]\d+)?\s*%$/i.test(value)) return { value, label: 'de bônus' }
  return { value }
}
