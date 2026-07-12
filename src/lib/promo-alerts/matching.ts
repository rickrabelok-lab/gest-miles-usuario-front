// src/lib/promo-alerts/matching.ts
// Resolve o nome de programa (texto livre do extrator LLM em promo_alerts) para
// um program_id canônico do catálogo (mesmos slugs de programSelectionUtils).
// Nunca "chuta": desconhecido → null. Alias extensível (1 linha por variação).

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
