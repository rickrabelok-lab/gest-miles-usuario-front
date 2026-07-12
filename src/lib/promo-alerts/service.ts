// src/lib/promo-alerts/service.ts — leitura de promo_alerts (BFF ou Supabase RLS) mapeada pro contrato de UI
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { apiFetch, hasApiUrl } from '@/services/api'
import type { BonusCategory, BonusPromotion, BonusTier } from '@/lib/bonusTypes'

const BONUS_LABEL: Record<BonusCategory, string> = {
  transfer: 'de bônus',
  shopping: 'pts/R$',
  miles: 'na compra',
  cards: 'na oferta',
}

function asDateOnly(value: unknown): string {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : ''
}

export function mapPromoAlertRow(row: Record<string, unknown>): BonusPromotion | null {
  if (!row || typeof row !== 'object') return null
  const category = row.category as BonusCategory
  if (!row.id || !(category in BONUS_LABEL)) return null

  const sourceProgram = typeof row.source_program === 'string' ? row.source_program : null
  const targetProgram = typeof row.target_program === 'string' ? row.target_program : null
  const validUntil = asDateOnly(row.valid_until)
  const tiers = Array.isArray(row.tiers) ? (row.tiers as BonusTier[]) : undefined
  const sourceLinks = Array.isArray(row.source_links)
    ? (row.source_links as { name: string; url: string }[])
    : undefined

  const program = targetProgram ?? sourceProgram ?? 'Programa'
  const officialCta = typeof row.cta_url === 'string' && row.cta_url ? row.cta_url : undefined
  const links = sourceLinks && sourceLinks.length > 0 ? sourceLinks : undefined
  // Toda promoção precisa de link clicável: sem cta oficial, cai no post da fonte.
  const fallbackCta = links?.[0]?.url

  const milheiroCost = Number(row.milheiro_cost)
  const hasMilheiro = Number.isFinite(milheiroCost) && milheiroCost > 0

  return {
    id: String(row.id),
    category,
    targetProgram: program,
    title: typeof row.title === 'string' && row.title ? row.title : program,
    bonusValue: typeof row.bonus_value === 'string' ? row.bonus_value : '',
    bonusLabel: BONUS_LABEL[category],
    milheiroCost: hasMilheiro ? milheiroCost : undefined,
    milheiroNote:
      hasMilheiro && typeof row.milheiro_note === 'string' && row.milheiro_note
        ? row.milheiro_note
        : undefined,
    participatingBanks: category === 'transfer' && sourceProgram ? [sourceProgram] : undefined,
    sourceProgram: sourceProgram || undefined,
    bonusNumeric:
      row.bonus_numeric != null && Number.isFinite(Number(row.bonus_numeric))
        ? Number(row.bonus_numeric)
        : undefined,
    tiers: tiers && tiers.length > 0 ? tiers : undefined,
    expiresAt: validUntil ? `${validUntil}T23:59:00` : undefined,
    isActive: true,
    isHighlight: false,
    ctaUrl: officialCta ?? fallbackCta,
    rules: typeof row.details === 'string' && row.details ? row.details : undefined,
    sourceLinks: links,
  }
}

export function isCurrentPromo(promo: BonusPromotion, today = new Date().toISOString().slice(0, 10)): boolean {
  if (!promo.expiresAt) return true
  return promo.expiresAt.slice(0, 10) >= today
}

/** Destaque da Home: a transferência de maior bônus; sem transfer, a primeira promo. */
export function pickHighlightId(promos: BonusPromotion[]): string | null {
  const transfers = promos.filter((p) => p.category === 'transfer')
  if (transfers.length > 0) {
    const best = transfers.reduce((acc, p) =>
      parseFloat(p.bonusValue) > parseFloat(acc.bonusValue) ? p : acc,
    )
    return best.id
  }
  return promos[0]?.id ?? null
}

export async function getActivePromoAlerts(
  options: { signal?: AbortSignal } = {},
): Promise<BonusPromotion[]> {
  let rows: unknown[] = []
  if (hasApiUrl()) {
    rows = await apiFetch<unknown[]>('/api/promo-alerts', { signal: options.signal })
  } else if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('promo_alerts')
      .select(
        'id, category, source_program, target_program, title, bonus_value, bonus_numeric, tiers, valid_from, valid_until, details, cta_url, source_links, milheiro_cost, milheiro_note',
      )
      .order('bonus_numeric', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .abortSignal(options.signal as AbortSignal)
    if (error) throw error
    rows = data ?? []
  }
  return rows
    .map((row) => mapPromoAlertRow(row as Record<string, unknown>))
    .filter((p): p is BonusPromotion => !!p && isCurrentPromo(p))
}
