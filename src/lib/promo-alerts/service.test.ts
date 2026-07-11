import { describe, expect, it } from 'vitest'
import { mapPromoAlertRow, isCurrentPromo, pickHighlightId } from './service'

const row = {
  id: 'abc',
  category: 'transfer',
  source_program: 'Livelo',
  target_program: 'Smiles',
  title: 'Livelo dá 100% pra Smiles',
  bonus_value: '100%',
  bonus_numeric: 100,
  tiers: [{ label: 'Clube', value: '110%', isBest: true }],
  valid_until: '2099-07-20',
  details: 'Regras resumidas.',
  cta_url: 'https://livelo.com.br/promo',
  source_links: [{ name: 'Melhores Cartões', url: 'https://exemplo.com/post' }],
}

describe('mapPromoAlertRow', () => {
  it('mapeia linha de transferência com origem virando banco participante', () => {
    const promo = mapPromoAlertRow(row)!
    expect(promo.id).toBe('abc')
    expect(promo.category).toBe('transfer')
    expect(promo.targetProgram).toBe('Smiles')
    expect(promo.bonusValue).toBe('100%')
    expect(promo.bonusLabel).toBe('de bônus')
    expect(promo.participatingBanks).toEqual(['Livelo'])
    expect(promo.tiers).toEqual([{ label: 'Clube', value: '110%', isBest: true }])
    expect(promo.expiresAt).toBe('2099-07-20T23:59:00')
    expect(promo.rules).toBe('Regras resumidas.')
    expect(promo.ctaUrl).toBe('https://livelo.com.br/promo')
    expect(promo.sourceLinks).toEqual([{ name: 'Melhores Cartões', url: 'https://exemplo.com/post' }])
    expect(promo.isActive).toBe(true)
    expect(promo.isHighlight).toBe(false)
  })

  it('sem target_program usa source_program como programa exibido', () => {
    const promo = mapPromoAlertRow({ ...row, category: 'shopping', target_program: null })!
    expect(promo.targetProgram).toBe('Livelo')
    expect(promo.participatingBanks).toBeUndefined()
  })

  it('categoria desconhecida ou sem id => null', () => {
    expect(mapPromoAlertRow({ ...row, category: 'cupom' })).toBeNull()
    expect(mapPromoAlertRow({ ...row, id: null })).toBeNull()
  })

  it('sem valid_until não define expiresAt', () => {
    expect(mapPromoAlertRow({ ...row, valid_until: null })!.expiresAt).toBeUndefined()
  })
})

describe('isCurrentPromo', () => {
  it('mantém sem validade e futuras; corta vencidas', () => {
    const promo = mapPromoAlertRow(row)!
    expect(isCurrentPromo(promo, '2099-07-20')).toBe(true)
    expect(isCurrentPromo(promo, '2099-07-21')).toBe(false)
    expect(isCurrentPromo(mapPromoAlertRow({ ...row, valid_until: null })!, '2099-07-21')).toBe(true)
  })
})

describe('pickHighlightId', () => {
  it('escolhe a transferência de maior bônus; sem transfer cai na primeira promo; vazio => null', () => {
    // pickHighlightId compara parseFloat(bonusValue) — variar bonus_value, não bonus_numeric
    const a = mapPromoAlertRow({ ...row, id: 'a', bonus_value: '80%' })!
    const b = mapPromoAlertRow({ ...row, id: 'b', bonus_value: '120%' })!
    const c = mapPromoAlertRow({ ...row, id: 'c', category: 'miles', bonus_value: '-30%' })!
    expect(pickHighlightId([a, b, c])).toBe('b')
    expect(pickHighlightId([c])).toBe('c')
    expect(pickHighlightId([])).toBeNull()
  })
})
