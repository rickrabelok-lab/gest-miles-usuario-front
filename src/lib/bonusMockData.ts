// src/lib/bonusMockData.ts

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
}

export const BONUS_PROMOTIONS: BonusPromotion[] = [
  {
    id: 'tudoazul-120-transfer',
    category: 'transfer',
    targetProgram: 'TudoAzul',
    bonusValue: '120%',
    bonusLabel: 'de bônus',
    participatingBanks: ['C6 Atomos', 'Itaú', 'Sicredi', 'Itaucard', 'Merece', 'Mais Itaucard'],
    tiers: [
      { label: 'Clube Azul há +5 anos', value: '120%', isBest: true },
      { label: 'Clube Azul 3–4 anos', value: '110%' },
      { label: 'Clube Azul 1–2 anos', value: '100%' },
      { label: 'Clube Azul 6–11 meses', value: '95%' },
      { label: 'Assinantes do Clube Azul', value: '90%' },
      { label: 'Clientes Azul', value: '60%' },
    ],
    maxBonus: 300000,
    expiresAt: new Date(new Date().setHours(23, 59, 0, 0)).toISOString(),
    isActive: true,
    isHighlight: true,
    ctaUrl: 'https://www.voeazul.com.br/tudoazul/transferencia-bonificada',
    rules:
      'Promoção válida para transferências realizadas até a data de encerramento às 23:59. O bônus é aplicado sobre os pontos transferidos e creditado em até 10 dias úteis. Não cumulativo com outras promoções. O percentual de bônus varia conforme o tempo de assinatura do Clube Azul.',
  },
  {
    id: 'latampass-25-transfer',
    category: 'transfer',
    targetProgram: 'LATAM Pass',
    bonusValue: '25%',
    bonusLabel: 'de bônus',
    participatingBanks: ['Itaú', 'Itaucard', 'Credicard'],
    expiresAt: new Date(new Date().setHours(23, 59, 0, 0)).toISOString(),
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://www.latampass.com.br/pontos/transferencia',
    rules:
      'Promoção válida para transferências de pontos Itaú, Itaucard e Credicard para LATAM Pass realizadas até a data de encerramento às 23:59. Todos os clientes LATAM Pass são elegíveis.',
  },
  {
    id: 'livelo-shopping',
    category: 'shopping',
    targetProgram: 'Livelo',
    bonusValue: '85',
    bonusLabel: 'pts/R$',
    partnerStores: 200,
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://www.livelo.com.br/ganhe-pontos',
    rules:
      'Pontuação variável por loja parceira. Compre pelo portal Livelo para garantir a pontuação. Consulte o portal para o multiplicador específico de cada loja.',
  },
  {
    id: 'esfera-shopping',
    category: 'shopping',
    targetProgram: 'Esfera',
    bonusValue: '30',
    bonusLabel: 'pts/R$',
    partnerStores: 80,
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://www.esfera.com.vc/portal-de-pontos',
    rules:
      'Pontuação variável por loja. Acesse o portal Esfera antes de finalizar a compra para garantir os pontos.',
  },
  {
    id: 'tudoazul-shopping',
    category: 'shopping',
    targetProgram: 'TudoAzul',
    bonusValue: '25',
    bonusLabel: 'pts/R$',
    partnerStores: 24,
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://www.voeazul.com.br/tudoazul/loja-tudoazul',
    rules:
      'Pontuação variável por loja. Compre pelo portal TudoAzul. Consulte o portal para o multiplicador de cada loja parceira.',
  },
  {
    id: 'smiles-miles-discount',
    category: 'miles',
    targetProgram: 'Smiles',
    bonusValue: '-30%',
    bonusLabel: 'na compra',
    maxBonus: 50000,
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://www.smiles.com.br/compra-de-milhas',
    rules:
      'Desconto de 30% na compra de milhas Smiles. Limite de 50.000 milhas por CPF durante a promoção. Milhas creditadas imediatamente após a compra.',
  },
  {
    id: 'nubank-card-offer',
    category: 'cards',
    targetProgram: 'Nubank Ultravioleta',
    bonusValue: '2× pts',
    bonusLabel: 'em viagens',
    isActive: true,
    isHighlight: false,
    ctaUrl: 'https://nubank.com.br/ultravioleta',
    rules:
      'Dobro de pontos Nubank em compras nas categorias viagens (passagens aéreas e hotéis). Válido exclusivamente para portadores do cartão Nubank Ultravioleta.',
  },
]
