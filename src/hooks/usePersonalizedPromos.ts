// src/hooks/usePersonalizedPromos.ts
import { useMemo } from 'react'
import { useBonusPromotions } from '@/hooks/useBonusPromotions'
import { useProgramasCliente } from '@/hooks/useProgramasCliente'
import { crossPromosWithWallet, type PersonalizedPromo, type WalletProgram } from '@/lib/promo-alerts/matching'

export function usePersonalizedPromos(): {
  items: PersonalizedPromo[]
  loading: boolean
  error: string | null
} {
  const { promotions, loading: promosLoading, error } = useBonusPromotions('transfer')
  const { data, isPending, clientId } = useProgramasCliente()

  const walletLoading = !!clientId && isPending

  const items = useMemo<PersonalizedPromo[]>(() => {
    const wallet: WalletProgram[] = (data ?? []).map((row) => ({
      programId: row.program_id,
      saldo: Number(row.saldo) || 0,
    }))
    return crossPromosWithWallet(promotions, wallet)
  }, [promotions, data])

  return { items, loading: promosLoading || walletLoading, error }
}
