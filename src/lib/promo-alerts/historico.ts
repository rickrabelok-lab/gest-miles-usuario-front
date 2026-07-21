// src/lib/promo-alerts/historico.ts — histórico de bônus por rota (RPC definer).
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export interface HistoricoRota {
  vezes: number
  bonusMedio: number | null
  bonusMax: number | null
  bonusMin: number | null
  primeira: string | null
  ultima: string | null
}

export interface ResumoHistorico {
  novo: boolean
  texto: string
  sinal: 'acima' | 'abaixo' | 'na_media' | null
  vezes: number
  bonusMedio: number | null
  bonusMax: number | null
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function getPromoHistoricoRota(
  source: string,
  target: string,
  opts: { signal?: AbortSignal } = {},
): Promise<HistoricoRota | null> {
  if (!isSupabaseConfigured) return null
  const { data, error } = await supabase
    .rpc('promo_historico_rota', { p_source: source, p_target: target })
    .abortSignal(opts.signal as AbortSignal)
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    vezes: num(row.vezes) ?? 0,
    bonusMedio: num(row.bonus_medio),
    bonusMax: num(row.bonus_max),
    bonusMin: num(row.bonus_min),
    primeira: typeof row.primeira === 'string' ? row.primeira : null,
    ultima: typeof row.ultima === 'string' ? row.ultima : null,
  }
}

export function resumoHistorico(h: HistoricoRota | null, bonusAtual: number | null): ResumoHistorico {
  const vezes = h?.vezes ?? 0
  const bonusMedio = h?.bonusMedio ?? null
  const bonusMax = h?.bonusMax ?? null
  if (!h || vezes <= 1) {
    return {
      novo: true,
      texto: 'Primeira vez que registramos essa rota — vamos acompanhar o histórico daqui pra frente.',
      sinal: null,
      vezes,
      bonusMedio,
      bonusMax,
    }
  }
  let sinal: 'acima' | 'abaixo' | 'na_media' = 'na_media'
  if (bonusAtual != null && bonusMedio != null) {
    if (bonusAtual > bonusMedio) sinal = 'acima'
    else if (bonusAtual < bonusMedio) sinal = 'abaixo'
  }
  const parts = [`Essa rota já teve bônus ${vezes}×`]
  if (bonusMedio != null) parts.push(`média ${bonusMedio}%`)
  if (bonusMax != null) parts.push(`máx ${bonusMax}%`)
  return { novo: false, texto: parts.join(' · '), sinal, vezes, bonusMedio, bonusMax }
}

export interface HistoricoRotaLista {
  sourceId: string
  targetId: string
  sourceNome: string
  targetNome: string
  vezes: number
  bonusMedio: number | null
  bonusMax: number | null
  bonusMin: number | null
  primeira: string | null
  ultima: string | null
}

export async function getPromoHistoricoRotas(): Promise<HistoricoRotaLista[]> {
  if (!isSupabaseConfigured) return []
  const { data, error } = await supabase.rpc('promo_historico_rotas')
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data.map((row: Record<string, unknown>) => ({
    sourceId: String(row.source_id ?? ''),
    targetId: String(row.target_id ?? ''),
    sourceNome: typeof row.source_nome === 'string' && row.source_nome ? row.source_nome : String(row.source_id ?? ''),
    targetNome: typeof row.target_nome === 'string' && row.target_nome ? row.target_nome : String(row.target_id ?? ''),
    vezes: num(row.vezes) ?? 0,
    bonusMedio: num(row.bonus_medio),
    bonusMax: num(row.bonus_max),
    bonusMin: num(row.bonus_min),
    primeira: typeof row.primeira === 'string' ? row.primeira : null,
    ultima: typeof row.ultima === 'string' ? row.ultima : null,
  }))
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function formatUltima(iso: string | null): string {
  if (!iso || typeof iso !== 'string') return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-\d{2}/)
  if (!m) return '—'
  const mesIdx = Number(m[2]) - 1
  if (mesIdx < 0 || mesIdx > 11) return '—'
  return `${MESES_ABREV[mesIdx]}/${m[1].slice(2)}`
}
