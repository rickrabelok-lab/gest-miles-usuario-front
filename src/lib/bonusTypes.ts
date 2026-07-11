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
  rules?: string
  sourceLinks?: { name: string; url: string }[]
}

export const BONUS_PROMOTIONS_SOURCE_NOTICE =
  'Promoções selecionadas e verificadas pela nossa equipe. Confirme as regras no site do programa antes de participar.'
