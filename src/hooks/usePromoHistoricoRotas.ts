import { useQuery } from '@tanstack/react-query'
import { getPromoHistoricoRotas } from '@/lib/promo-alerts/historico'

export function usePromoHistoricoRotas() {
  return useQuery({
    queryKey: ['promo-historico-rotas'],
    queryFn: () => getPromoHistoricoRotas(),
  })
}
