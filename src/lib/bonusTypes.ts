// src/lib/bonusTypes.ts — contrato de UI do hub de promoções (dados reais via promo_alerts)

export type BonusCategory = 'transfer' | 'shopping' | 'miles' | 'cards'

export interface BonusTier {
  label: string
  value: string
  isBest?: boolean
}

export interface BonusPromotion {
  id: string
  category: BonusCategory
  targetProgram: string
  /** Manchete curada (copy própria do pipeline) — protagonista dos cards. */
  title: string
  bonusValue: string
  bonusLabel: string
  participatingBanks?: string[]
  tiers?: BonusTier[]
  partnerStores?: number
  maxBonus?: number
  expiresAt?: string
  isActive: boolean
  isHighlight: boolean
  ctaUrl?: string
  /** true quando ctaUrl caiu no fallback (post da fonte, não o site do programa). */
  ctaIsFallback?: boolean
  rules?: string
  sourceLinks?: { name: string; url: string }[]
}

export const BONUS_PROMOTIONS_SOURCE_NOTICE =
  'Promoções detectadas automaticamente e revisadas pela equipe. Confirme validade e regras no site do programa antes de agir.'
