import { useQuery } from '@tanstack/react-query'
import { getPromoHistoricoRota } from '@/lib/promo-alerts/historico'

export function usePromoHistoricoRota(
  source: string | undefined,
  target: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['promo-historico', source, target],
    enabled: enabled && !!source && !!target,
    queryFn: ({ signal }) => getPromoHistoricoRota(source as string, target as string, { signal }),
  })
}
