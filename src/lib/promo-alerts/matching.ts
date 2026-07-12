// src/lib/promo-alerts/matching.ts
// Cruza promoções de transferência com a carteira do cliente ("Pra você").
// O slug canônico da origem já vem materializado em promo.sourceProgramId
// (coluna source_program_id, populada por trigger a partir de program_aliases),
// então o match é direto — a normalização de alias vive só no banco (fonte única).

import type { BonusPromotion } from '@/lib/bonusTypes'

export interface WalletProgram {
  programId: string
  saldo: number
}

export interface PersonalizedPromo {
  promo: BonusPromotion
  programId: string
  saldo: number
  resultado: number | null
}

/** Cruza promoções de transferência com a carteira: só origem com saldo>0. */
export function crossPromosWithWallet(
  promos: BonusPromotion[],
  wallet: WalletProgram[],
): PersonalizedPromo[] {
  const saldoById = new Map<string, number>()
  for (const w of wallet) {
    const saldo = Number(w.saldo)
    if (Number.isFinite(saldo) && saldo > 0) saldoById.set(w.programId, saldo)
  }

  const items: PersonalizedPromo[] = []
  for (const promo of promos) {
    if (promo.category !== 'transfer') continue
    const programId = promo.sourceProgramId
    if (!programId) continue
    const saldo = saldoById.get(programId)
    if (!saldo) continue
    const bonus = Number.isFinite(promo.bonusNumeric) ? promo.bonusNumeric : null
    const resultado = bonus != null ? Math.round(saldo * (1 + bonus / 100)) : null
    items.push({ promo, programId, saldo, resultado })
  }

  return items.sort((a, b) => {
    const ra = a.resultado ?? -1
    const rb = b.resultado ?? -1
    if (rb !== ra) return rb - ra
    return (b.promo.bonusNumeric ?? 0) - (a.promo.bonusNumeric ?? 0)
  })
}
