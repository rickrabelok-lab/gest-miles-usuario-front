import { describe, expect, it } from 'vitest'
import { normalizeProgramToId, crossPromosWithWallet } from './matching'
import type { BonusPromotion } from '@/lib/bonusTypes'

describe('normalizeProgramToId', () => {
  it('resolve origens comuns de transferência (com e sem acento/variações)', () => {
    expect(normalizeProgramToId('Livelo')).toBe('livelo')
    expect(normalizeProgramToId('Esfera')).toBe('esfera')
    expect(normalizeProgramToId('Itaú')).toBe('itau')
    expect(normalizeProgramToId('Itau')).toBe('itau')
    expect(normalizeProgramToId('Inter Loop')).toBe('inter-loop')
    expect(normalizeProgramToId('Inter')).toBe('inter-loop')
    expect(normalizeProgramToId('C6')).toBe('atomos-c6')
    expect(normalizeProgramToId('Átomos C6')).toBe('atomos-c6')
    expect(normalizeProgramToId('Amex')).toBe('amex')
  })

  it('resolve destinos comuns (pra uso futuro / robustez)', () => {
    expect(normalizeProgramToId('Smiles')).toBe('smiles')
    expect(normalizeProgramToId('LATAM Pass')).toBe('latam-pass')
    expect(normalizeProgramToId('Tudo Azul')).toBe('tudo-azul')
  })

  it('não chuta: texto desconhecido, vazio ou nulo → null', () => {
    expect(normalizeProgramToId('Programa Inexistente')).toBeNull()
    expect(normalizeProgramToId('')).toBeNull()
    expect(normalizeProgramToId(null)).toBeNull()
    expect(normalizeProgramToId(undefined)).toBeNull()
  })
})

function promo(p: Partial<BonusPromotion>): BonusPromotion {
  return {
    id: 'x', category: 'transfer', targetProgram: 'Smiles', title: 't',
    bonusValue: '100%', bonusLabel: 'de bônus', isActive: true, isHighlight: false, ...p,
  }
}

describe('crossPromosWithWallet', () => {
  const wallet = [
    { programId: 'livelo', saldo: 82000 },
    { programId: 'esfera', saldo: 0 },       // tem o programa mas sem saldo
    { programId: 'itau', saldo: 30000 },
  ]

  it('casa origem com saldo>0 e calcula o resultado', () => {
    const items = crossPromosWithWallet(
      [promo({ id: 'a', sourceProgram: 'Livelo', bonusNumeric: 100 })],
      wallet,
    )
    expect(items).toHaveLength(1)
    expect(items[0].programId).toBe('livelo')
    expect(items[0].saldo).toBe(82000)
    expect(items[0].resultado).toBe(164000)
  })

  it('ignora origem sem saldo, origem fora da carteira e não-transfer', () => {
    const items = crossPromosWithWallet(
      [
        promo({ id: 'a', sourceProgram: 'Esfera', bonusNumeric: 90 }),   // saldo 0
        promo({ id: 'b', sourceProgram: 'Smiles', bonusNumeric: 50 }),   // não está na carteira
        promo({ id: 'c', category: 'miles', sourceProgram: 'Livelo' }),  // não é transfer
        promo({ id: 'd', sourceProgram: 'Programa X', bonusNumeric: 80 }), // origem desconhecida
      ],
      wallet,
    )
    expect(items).toHaveLength(0)
  })

  it('ordena por maior resultado', () => {
    const items = crossPromosWithWallet(
      [
        promo({ id: 'itau', sourceProgram: 'Itaú', bonusNumeric: 100 }),  // 30000 -> 60000
        promo({ id: 'livelo', sourceProgram: 'Livelo', bonusNumeric: 50 }), // 82000 -> 123000
      ],
      wallet,
    )
    expect(items.map((i) => i.promo.id)).toEqual(['livelo', 'itau'])
  })

  it('sem bonusNumeric ainda casa, com resultado null', () => {
    const items = crossPromosWithWallet(
      [promo({ id: 'a', sourceProgram: 'Livelo' })],
      wallet,
    )
    expect(items).toHaveLength(1)
    expect(items[0].resultado).toBeNull()
  })
})
