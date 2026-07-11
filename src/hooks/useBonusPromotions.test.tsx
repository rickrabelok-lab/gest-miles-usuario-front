import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useBonusPromotions } from './useBonusPromotions'
import type { BonusPromotion } from '@/lib/bonusTypes'

const mocks = vi.hoisted(() => ({ getActivePromoAlerts: vi.fn() }))

vi.mock('@/lib/promo-alerts/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/promo-alerts/service')>()
  return { ...actual, getActivePromoAlerts: mocks.getActivePromoAlerts }
})

function promo(overrides: Partial<BonusPromotion>): BonusPromotion {
  return {
    id: 'p1',
    category: 'transfer',
    targetProgram: 'Smiles',
    title: 'Promoção de teste',
    bonusValue: '100%',
    bonusLabel: 'de bônus',
    isActive: true,
    isHighlight: false,
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useBonusPromotions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sai de loading com as promoções e marca o destaque (maior bônus de transferência)', async () => {
    mocks.getActivePromoAlerts.mockResolvedValueOnce([
      promo({ id: 'a', bonusValue: '80%' }),
      promo({ id: 'b', bonusValue: '120%' }),
    ])
    const { result } = renderHook(() => useBonusPromotions(), { wrapper })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeCount).toBe(2)
    expect(result.current.highlight?.id).toBe('b')
    expect(result.current.promotions.find((p) => p.id === 'b')?.isHighlight).toBe(true)
  })

  it('filtra por categoria sem perder o destaque global', async () => {
    mocks.getActivePromoAlerts.mockResolvedValueOnce([
      promo({ id: 'a' }),
      promo({ id: 'c', category: 'miles', bonusValue: '-30%' }),
    ])
    const { result } = renderHook(() => useBonusPromotions('miles'), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.promotions.map((p) => p.id)).toEqual(['c'])
    expect(result.current.highlight?.id).toBe('a')
  })

  it('falha vira mensagem amigável e lista vazia', async () => {
    mocks.getActivePromoAlerts.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useBonusPromotions(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Não foi possível carregar as promoções no momento.')
    expect(result.current.promotions).toEqual([])
  })
})
