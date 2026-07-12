import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import BonusOfferDetailScreen from './BonusOfferDetailScreen'
import type { BonusPromotion } from '@/lib/bonusTypes'

const state = {
  promotions: [] as BonusPromotion[],
  highlight: null as BonusPromotion | null,
  activeCount: 0,
  expiringToday: 0,
  loading: false,
}

vi.mock('@/hooks/useBonusPromotions', () => ({
  useBonusPromotions: () => state,
}))

const basePromo: BonusPromotion = {
  id: 'abc',
  category: 'transfer',
  targetProgram: 'Smiles',
  title: 'Transfira Esfera para Smiles com até 70% de bônus',
  bonusValue: 'até 70%',
  bonusLabel: 'de bônus',
  isActive: true,
  isHighlight: false,
  ctaUrl: 'https://esfera.com.vc/promo',
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/bonus-offers/abc']}>
      <Routes>
        <Route path="/bonus-offers/:id" element={<BonusOfferDetailScreen />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BonusOfferDetailScreen — custo do milheiro', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.promotions = [basePromo]
    state.loading = false
  })

  it('com milheiro mostra o bloco com valor formatado e a nota do combo', () => {
    state.promotions = [
      {
        ...basePromo,
        milheiroCost: 15.58,
        milheiroNote: 'Comprando pontos no carrinho da Esfera e transferindo com 70% de bônus',
      },
    ]
    renderDetail()
    expect(screen.getByText('Custo do milheiro')).toBeInTheDocument()
    expect(screen.getAllByText(/R\$ 15,58/).length).toBeGreaterThan(0)
    expect(screen.getByText(/carrinho da Esfera/)).toBeInTheDocument()
  })

  it('sem milheiro não renderiza o bloco e o badge segue o bonus_value', () => {
    renderDetail()
    expect(screen.queryByText('Custo do milheiro')).not.toBeInTheDocument()
    expect(screen.getByText('até 70%')).toBeInTheDocument()
  })
})
