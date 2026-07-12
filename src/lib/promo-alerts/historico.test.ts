import { describe, expect, it } from 'vitest'
import { resumoHistorico, type HistoricoRota } from './historico'

const hist = (over: Partial<HistoricoRota> = {}): HistoricoRota => ({
  vezes: 3,
  bonusMedio: 80,
  bonusMax: 120,
  bonusMin: 50,
  primeira: '2026-01-01',
  ultima: '2026-07-01',
  ...over,
})

describe('resumoHistorico', () => {
  it('sem histórico (null ou vezes<=1) → novo', () => {
    expect(resumoHistorico(null, 100).novo).toBe(true)
    expect(resumoHistorico(hist({ vezes: 1 }), 100).novo).toBe(true)
  })

  it('atual acima da média → sinal acima', () => {
    const r = resumoHistorico(hist({ vezes: 3, bonusMedio: 80 }), 100)
    expect(r.novo).toBe(false)
    expect(r.sinal).toBe('acima')
    expect(r.texto).toContain('3×')
  })

  it('atual abaixo da média → sinal abaixo', () => {
    expect(resumoHistorico(hist({ bonusMedio: 80 }), 60).sinal).toBe('abaixo')
  })

  it('sem bonusAtual → na_media (sem sinal de bom momento)', () => {
    expect(resumoHistorico(hist(), null).sinal).toBe('na_media')
  })
})
