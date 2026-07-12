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
  /** Custo em R$ por 1.000 pontos/milhas no destino, publicado pelo artigo (fase 1.1). */
  milheiroCost?: number
  /** Como chegar no custo (carrinho, clube, transferência) — nunca presente sem milheiroCost. */
  milheiroNote?: string
  participatingBanks?: string[]
  /** Programa de origem cru (texto do extrator) — exibição/fallback. */
  sourceProgram?: string
  /** Slug canônico da origem (source_program_id materializado no banco) — usado no cruzamento com a carteira ("Pra você"). */
  sourceProgramId?: string
  /** Percentual do bônus (ex.: 100) — usado no cálculo do resultado personalizado. */
  bonusNumeric?: number
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
