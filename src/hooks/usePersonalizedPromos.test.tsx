import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersonalizedPromos } from './usePersonalizedPromos'
import type { BonusPromotion } from '@/lib/bonusTypes'

const mocks = vi.hoisted(() => ({ useBonusPromotions: vi.fn(), useProgramasCliente: vi.fn() }))
vi.mock('@/hooks/useBonusPromotions', () => ({ useBonusPromotions: mocks.useBonusPromotions }))
vi.mock('@/hooks/useProgramasCliente', () => ({ useProgramasCliente: mocks.useProgramasCliente }))

function promo(p: Partial<BonusPromotion>): BonusPromotion {
  return {
    id: 'x', category: 'transfer', targetProgram: 'Smiles', title: 't',
    bonusValue: '100%', bonusLabel: 'de bônus', isActive: true, isHighlight: false, ...p,
  }
}

describe('usePersonalizedPromos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useBonusPromotions.mockReturnValue({ promotions: [], loading: false, error: null })
    mocks.useProgramasCliente.mockReturnValue({ data: [], isPending: false, clientId: 'c1' })
  })

  it('cruza promos com a carteira e calcula o resultado', () => {
    mocks.useBonusPromotions.mockReturnValue({
      promotions: [promo({ id: 'a', sourceProgramId: 'livelo', bonusNumeric: 100 })],
      loading: false, error: null,
    })
    mocks.useProgramasCliente.mockReturnValue({
      data: [{ program_id: 'livelo', saldo: 82000 }], isPending: false, clientId: 'c1',
    })
    const { result } = renderHook(() => usePersonalizedPromos())
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].resultado).toBe(164000)
  })

  it('loading enquanto a carteira do cliente logado carrega', () => {
    mocks.useProgramasCliente.mockReturnValue({ data: undefined, isPending: true, clientId: 'c1' })
    const { result } = renderHook(() => usePersonalizedPromos())
    expect(result.current.loading).toBe(true)
  })

  it('sem sessão (clientId null) não fica preso em loading e devolve vazio', () => {
    mocks.useProgramasCliente.mockReturnValue({ data: undefined, isPending: true, clientId: null })
    const { result } = renderHook(() => usePersonalizedPromos())
    expect(result.current.loading).toBe(false)
    expect(result.current.items).toEqual([])
  })
})
