// src/components/bonus/BonusProgramLogo.tsx
// Tile de logo dos programas (padrão do design v2). Fonte única do padrão:
// símbolo SVG oficial empacotado > wordmark tipográfico curado > chip de
// iniciais na cor da marca. Aceita id ("latam-pass") ou nome ("Latam Pass");
// nunca quebra.

import tudoAzulMark from '@/assets/programs/tudo-azul.svg'
import copaAirlinesMark from '@/assets/programs/copa-airlines.svg'
import iberiaMark from '@/assets/programs/iberia.svg'

/**
 * Símbolos oficiais empacotados (recorte vetorial do logo da marca). Têm a
 * precedência MÁXIMA no tile — inclusive sobre a logo subida no Admin, que
 * pra estes programas é genérica/de baixa qualidade.
 */
const CURATED_MARKS: Record<string, string> = {
  tudoazul: tudoAzulMark,
  copaairlines: copaAirlinesMark,
  iberia: iberiaMark,
}

type WordmarkPart = { text: string; color: string; fontSize?: number }

type Wordmark = {
  parts: WordmarkPart[]
  /** Empilha as partes em linhas (ex.: LATAM PASS). */
  stacked?: boolean
  /** Tamanho da fonte (px) num tile de 44px — escala proporcional em outros tamanhos. */
  fontSize?: number
}

const WORDMARKS: Record<string, Wordmark> = {
  tudoazul: {
    parts: [
      { text: 'tudo', color: '#0A4DA2' },
      { text: 'azul', color: '#00A5E0' },
    ],
    fontSize: 8.5,
  },
  latampass: {
    stacked: true,
    parts: [
      { text: 'LATAM', color: '#16007C', fontSize: 8.5 },
      { text: 'PASS', color: '#ED1650', fontSize: 6.5 },
    ],
  },
  smiles: { parts: [{ text: 'smiles', color: '#FF5A00' }], fontSize: 10 },
  livelo: { parts: [{ text: 'livelo', color: '#DF0979' }], fontSize: 10 },
  esfera: { parts: [{ text: 'esfera', color: '#D6001C' }], fontSize: 9.5 },
  nubank: { parts: [{ text: 'nu', color: '#820AD1' }], fontSize: 12 },
  iberia: { parts: [{ text: 'Iberia', color: '#D7192D' }], fontSize: 9.5 },
  copaairlines: {
    stacked: true,
    parts: [
      { text: 'Copa', color: '#00458C', fontSize: 9.5 },
      { text: 'AIRLINES', color: '#00458C', fontSize: 4.5 },
    ],
  },
  finnair: { parts: [{ text: 'FINNAIR', color: '#0B1560' }], fontSize: 7 },
  qatarairways: {
    stacked: true,
    parts: [
      { text: 'QATAR', color: '#5C0632', fontSize: 8 },
      { text: 'AIRWAYS', color: '#5C0632', fontSize: 4.5 },
    ],
  },
  britishairways: {
    stacked: true,
    parts: [
      { text: 'BRITISH', color: '#0F2F6D', fontSize: 6.5 },
      { text: 'AIRWAYS', color: '#0F2F6D', fontSize: 6.5 },
    ],
  },
  tap: {
    stacked: true,
    parts: [
      { text: 'TAP', color: '#009A44', fontSize: 9 },
      { text: 'Miles&Go', color: '#D50032', fontSize: 5.5 },
    ],
  },
  americanairlines: { parts: [{ text: 'AAdvantage', color: '#36495A' }], fontSize: 6.5 },
  aadvantage: { parts: [{ text: 'AAdvantage', color: '#36495A' }], fontSize: 6.5 },
  itau: { parts: [{ text: 'itaú', color: '#EC7000' }], fontSize: 11 },
  interloop: { parts: [{ text: 'loop', color: '#FF7A00' }], fontSize: 10.5 },
  amex: { parts: [{ text: 'AMEX', color: '#006FCF' }], fontSize: 9 },
  atomosc6: { parts: [{ text: 'átomos', color: '#26272B' }], fontSize: 8.5 },
  allaccor: { parts: [{ text: 'ALL', color: '#050033' }], fontSize: 11 },
  // Km de Vantagens (Ipiranga) — azul institucional; catálogo antigo dizia verde (errado).
  kmv: { parts: [{ text: 'KMV', color: '#0046AD' }], fontSize: 10 },
  // Uau CAIXA — identidade própria do programa (índigo/azul elétrico do site oficial uaucaixa.com.br).
  uaucaixa: {
    stacked: true,
    parts: [
      { text: 'Uau', color: '#181887', fontSize: 10 },
      { text: 'CAIXA', color: '#251EEC', fontSize: 4.5 },
    ],
  },
  // DUX (BRB) — cartão premium preto; azul institucional do BRB (brbcard.com.br).
  brbdux: {
    stacked: true,
    parts: [
      { text: 'DUX', color: '#1A1A1A', fontSize: 10 },
      { text: 'BRB', color: '#0078BF', fontSize: 4.5 },
    ],
  },
}

/** Normaliza id/nome pra chave de wordmark: minúsculas, sem acentos, só [a-z0-9]. */
function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function wordmarkFor(program: string): Wordmark | undefined {
  const key = normalizeKey(program)
  if (WORDMARKS[key]) return WORDMARKS[key]
  const match = Object.keys(WORDMARKS).find(k => key.startsWith(k))
  return match ? WORDMARKS[match] : undefined
}

function curatedMarkFor(program: string): string | undefined {
  const key = normalizeKey(program)
  if (CURATED_MARKS[key]) return CURATED_MARKS[key]
  const match = Object.keys(CURATED_MARKS).find(k => key.startsWith(k))
  return match ? CURATED_MARKS[match] : undefined
}

/** True quando o programa tem símbolo SVG empacotado (vence a logo do Admin). */
export function hasCuratedProgramMark(program: string): boolean {
  return Boolean(curatedMarkFor(program))
}

function initials(program: string): string {
  return program
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
}

type BonusProgramLogoProps = {
  program: string
  size?: number
  /** Iniciais do catálogo pro chip de fallback (senão deriva do nome). */
  fallbackInitials?: string
  /** Cor da marca pro chip de fallback (tinta o fundo e as iniciais). */
  fallbackColor?: string
}

export function BonusProgramLogo({
  program,
  size = 44,
  fallbackInitials,
  fallbackColor,
}: BonusProgramLogoProps) {
  const curatedMark = curatedMarkFor(program)
  const mark = curatedMark ? undefined : wordmarkFor(program)
  const scale = size / 44

  const chipInitials = (fallbackInitials?.trim() || initials(program) || 'PG').slice(0, 2)
  const markImageSize = Math.round(size * 0.68)

  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center border border-nubank-border bg-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        ...(curatedMark || mark || !fallbackColor
          ? undefined
          : { backgroundColor: `${fallbackColor}14`, borderColor: `${fallbackColor}26` }),
      }}
    >
      {curatedMark ? (
        <img
          src={curatedMark}
          alt=""
          width={markImageSize}
          height={markImageSize}
          decoding="async"
          className="object-contain"
          style={{ width: markImageSize, height: markImageSize }}
        />
      ) : mark ? (
        mark.stacked ? (
          <span className="flex flex-col items-center gap-px">
            {mark.parts.map((part, index) => (
              <span
                key={part.text}
                className={`font-extrabold leading-none ${
                  index === 0 ? 'tracking-[0.02em]' : 'tracking-[0.16em]'
                }`}
                style={{ color: part.color, fontSize: (part.fontSize ?? (index === 0 ? 8.5 : 6.5)) * scale }}
              >
                {part.text}
              </span>
            ))}
          </span>
        ) : (
          <span
            className="font-extrabold leading-none tracking-[-0.02em]"
            style={{ fontSize: (mark.fontSize ?? 10) * scale }}
          >
            {mark.parts.map(part => (
              <span key={part.text} style={{ color: part.color }}>
                {part.text}
              </span>
            ))}
          </span>
        )
      ) : (
        <span
          className={`font-bold leading-none ${fallbackColor ? '' : 'text-nubank-text-secondary'}`}
          style={{ fontSize: 11 * scale, ...(fallbackColor ? { color: fallbackColor } : undefined) }}
        >
          {chipInitials}
        </span>
      )}
    </span>
  )
}
