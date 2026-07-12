import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn() }, isSupabaseConfigured: true }))

import { resumoHistorico, getPromoHistoricoRotas, formatUltima, type HistoricoRota } from './historico'
import { supabase } from '@/lib/supabase'

const rpcMock = supabase.rpc as ReturnType<typeof vi.fn>

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

describe('formatUltima', () => {
  it('YYYY-MM-DD → mes/ano abreviado pt-BR', () => {
    expect(formatUltima('2026-07-01')).toBe('jul/26')
    expect(formatUltima('2026-01-15')).toBe('jan/26')
    expect(formatUltima('2025-12-31')).toBe('dez/25')
  })
  it('null ou inválido → —', () => {
    expect(formatUltima(null)).toBe('—')
    expect(formatUltima('xx')).toBe('—')
  })
})

describe('getPromoHistoricoRotas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mapeia as linhas do RPC para o shape tipado', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          source_id: 'livelo', target_id: 'smiles', source_nome: 'Livelo', target_nome: 'Smiles',
          vezes: 5, bonus_medio: 85, bonus_max: 100, bonus_min: 60, primeira: '2026-01-01', ultima: '2026-07-01',
        },
      ],
      error: null,
    })
    const rotas = await getPromoHistoricoRotas()
    expect(rotas).toHaveLength(1)
    expect(rotas[0]).toMatchObject({ sourceId: 'livelo', targetNome: 'Smiles', vezes: 5, bonusMedio: 85, ultima: '2026-07-01' })
    expect(rpcMock).toHaveBeenCalledWith('promo_historico_rotas')
  })

  it('lança em erro do RPC', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(getPromoHistoricoRotas()).rejects.toBeTruthy()
  })

  it('data não-array → []', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    expect(await getPromoHistoricoRotas()).toEqual([])
  })
})
