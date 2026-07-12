import { describe, expect, it } from 'vitest'
import { crossPromosWithWallet } from './matching'
import type { BonusPromotion } from '@/lib/bonusTypes'

function promo(p: Partial<BonusPromotion>): BonusPromotion {
  return {
    id: 'x',
    category: 'transfer',
    targetProgram: 'Smiles',
    title: 't',
    bonusValue: '100%',
    bonusLabel: 'de bônus',
    isActive: true,
    isHighlight: false,
    ...p,
  }
}

describe('crossPromosWithWallet', () => {
  const wallet = [
    { programId: 'livelo', saldo: 82000 },
    { programId: 'esfera', saldo: 0 }, // tem o programa mas sem saldo
    { programId: 'itau', saldo: 30000 },
  ]

  it('casa origem (sourceProgramId) com saldo>0 e calcula o resultado', () => {
    const items = crossPromosWithWallet(
      [promo({ id: 'a', sourceProgramId: 'livelo', bonusNumeric: 100 })],
      wallet,
    )
    expect(items).toHaveLength(1)
    expect(items[0].programId).toBe('livelo')
    expect(items[0].saldo).toBe(82000)
    expect(items[0].resultado).toBe(164000)
  })

  it('ignora origem sem saldo, origem fora da carteira, não-transfer e sem slug', () => {
    const items = crossPromosWithWallet(
      [
        promo({ id: 'a', sourceProgramId: 'esfera', bonusNumeric: 90 }), // saldo 0
        promo({ id: 'b', sourceProgramId: 'smiles', bonusNumeric: 50 }), // não está na carteira
        promo({ id: 'c', category: 'miles', sourceProgramId: 'livelo' }), // não é transfer
        promo({ id: 'd', sourceProgramId: undefined, bonusNumeric: 80 }), // origem não reconhecida no banco (slug null)
      ],
      wallet,
    )
    expect(items).toHaveLength(0)
  })

  it('ordena por maior resultado', () => {
    const items = crossPromosWithWallet(
      [
        promo({ id: 'itau', sourceProgramId: 'itau', bonusNumeric: 100 }), // 30000 -> 60000
        promo({ id: 'livelo', sourceProgramId: 'livelo', bonusNumeric: 50 }), // 82000 -> 123000
      ],
      wallet,
    )
    expect(items.map((i) => i.promo.id)).toEqual(['livelo', 'itau'])
  })

  it('sem bonusNumeric ainda casa, com resultado null', () => {
    const items = crossPromosWithWallet([promo({ id: 'a', sourceProgramId: 'livelo' })], wallet)
    expect(items).toHaveLength(1)
    expect(items[0].resultado).toBeNull()
  })

  it('bonusNumeric NaN não vira resultado NaN — cai pra null', () => {
    const items = crossPromosWithWallet(
      [promo({ id: 'a', sourceProgramId: 'livelo', bonusNumeric: NaN })],
      wallet,
    )
    expect(items).toHaveLength(1)
    expect(items[0].resultado).toBeNull()
  })
})
