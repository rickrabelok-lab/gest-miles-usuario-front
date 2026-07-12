// src/lib/promo-alerts/matching.ts
// Resolve o nome de programa (texto livre do extrator LLM em promo_alerts) para
// um program_id canônico do catálogo (mesmos slugs de programSelectionUtils).
// Nunca "chuta": desconhecido → null. Alias extensível (1 linha por variação).

import type { BonusPromotion } from '@/lib/bonusTypes'

/** Normaliza: remove acentos, minúsculo, mantém só [a-z0-9]. */
function norm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // remove marcas de acento combinantes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

// [program_id, variações reconhecidas]. Origens de transferência (livelo/esfera/
// bancos) são o núcleo; destinos aéreos entram por robustez. Evitar tokens
// genéricos ambíguos (ex.: "all", "aa", "avios") pra não gerar falso-positivo.
const ALIASES: Array<[string, string[]]> = [
  ['livelo', ['livelo']],
  ['esfera', ['esfera']],
  ['itau', ['itau', 'itaucard', 'itaucartoes']],
  ['inter-loop', ['interloop', 'inter', 'interpontos', 'loop']],
  ['atomos-c6', ['atomosc6', 'atomos', 'c6', 'c6atomos', 'c6bank']],
  ['amex', ['amex', 'americanexpress', 'membershiprewards', 'amexrewards']],
  ['smiles', ['smiles']],
  ['latam-pass', ['latampass', 'latam']],
  ['tudo-azul', ['tudoazul', 'azul']],
  ['iberia', ['iberia', 'iberiaplus']],
  ['tap', ['tap', 'tapmilesego', 'milesego']],
  ['all-accor', ['allaccor', 'accor']],
  ['american-airlines', ['aadvantage', 'americanairlines']],
  ['copa-airlines', ['copa', 'copaairlines', 'connectmiles']],
  ['qatar-airways', ['qatar', 'qatarairways']],
  ['british-airways', ['britishairways']],
  ['finnair', ['finnair', 'finnairplus']],
]

const BY_NORM: Record<string, string> = {}
for (const [id, names] of ALIASES) {
  for (const name of names) BY_NORM[norm(name)] = id
}

export function normalizeProgramToId(text: string | null | undefined): string | null {
  if (!text) return null
  const key = norm(text)
  if (!key) return null
  return BY_NORM[key] ?? null
}

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
    const programId = normalizeProgramToId(promo.sourceProgram)
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
