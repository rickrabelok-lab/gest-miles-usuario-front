// src/hooks/useBonusPromotions.ts
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getActivePromoAlerts, pickHighlightId } from '@/lib/promo-alerts/service'
import type { BonusCategory, BonusPromotion } from '@/lib/bonusTypes'
import { isExpiringToday } from '@/lib/bonusUtils'

const LOAD_ERROR_MESSAGE = 'Não foi possível carregar as promoções no momento.'

export function useBonusPromotions(category?: BonusCategory): {
  promotions: BonusPromotion[]
  highlight: BonusPromotion | null
  activeCount: number
  expiringToday: number
  loading: boolean
  error: string | null
} {
  const { data, isPending, isError } = useQuery({
    queryKey: ['promo-alerts'],
    queryFn: ({ signal }) => getActivePromoAlerts({ signal }),
  })

  const withHighlight = useMemo(() => {
    const all = data ?? []
    const highlightId = pickHighlightId(all)
    return all.map((p) => (p.id === highlightId ? { ...p, isHighlight: true } : p))
  }, [data])

  const promotions = useMemo(
    () => (category ? withHighlight.filter((p) => p.category === category) : withHighlight),
    [withHighlight, category],
  )

  // highlight é global de propósito (ignora categoria) — só a Home consome sem argumento.
  const highlight = useMemo(() => withHighlight.find((p) => p.isHighlight) ?? null, [withHighlight])

  const expiringToday = useMemo(
    () => promotions.filter((p) => isExpiringToday(p.expiresAt)).length,
    [promotions],
  )

  return {
    promotions,
    highlight,
    activeCount: promotions.length,
    expiringToday,
    loading: isPending,
    error: isError ? LOAD_ERROR_MESSAGE : null,
  }
}
