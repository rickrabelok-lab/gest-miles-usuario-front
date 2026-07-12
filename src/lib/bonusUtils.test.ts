import { describe, expect, it } from 'vitest'
import { bonusBadge, formatMilheiroBRL } from './bonusUtils'

describe('bonusBadge', () => {
  it('percentual curto vira badge com rótulo de bônus', () => {
    expect(bonusBadge('100%')).toEqual({ value: '100%', label: 'de bônus' })
    expect(bonusBadge('até 350%')).toEqual({ value: 'até 350%', label: 'de bônus' })
  })

  it('percentual negativo vira desconto', () => {
    expect(bonusBadge('-30%')).toEqual({ value: '-30%', label: 'de desconto' })
  })

  it('valor com unidade embutida não repete rótulo', () => {
    expect(bonusBadge('21 pts/R$')).toEqual({ value: '21 pts/R$' })
    expect(bonusBadge('10 pts/R$')).toEqual({ value: '10 pts/R$' })
  })

  it('valor longo ou vazio não vira badge (o título carrega a promoção)', () => {
    expect(bonusBadge('até 50 mil milhas')).toBeNull()
    expect(bonusBadge('50% extra + até 40.000 pontos')).toBeNull()
    expect(bonusBadge('')).toBeNull()
    expect(bonusBadge(undefined)).toBeNull()
  })

  it('milheiro efetivo vence o bonus_value e formata em pt-BR', () => {
    expect(bonusBadge('até 70%', 15.58)).toEqual({ value: 'R$ 15,58', label: 'milheiro' })
    expect(bonusBadge(undefined, 13.44)).toEqual({ value: 'R$ 13,44', label: 'milheiro' })
    expect(bonusBadge('100%', 17)).toEqual({ value: 'R$ 17,00', label: 'milheiro' })
  })

  it('milheiro inválido (0, NaN, ausente) cai na lógica atual do bonus_value', () => {
    expect(bonusBadge('100%', 0)).toEqual({ value: '100%', label: 'de bônus' })
    expect(bonusBadge('100%', NaN)).toEqual({ value: '100%', label: 'de bônus' })
    expect(bonusBadge('100%')).toEqual({ value: '100%', label: 'de bônus' })
  })

  it('formatMilheiroBRL é determinístico, sem NBSP', () => {
    expect(formatMilheiroBRL(15.58)).toBe('R$ 15,58')
    expect(formatMilheiroBRL(17)).toBe('R$ 17,00')
  })
})
