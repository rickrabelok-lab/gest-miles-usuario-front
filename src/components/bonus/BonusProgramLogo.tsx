// src/components/bonus/BonusProgramLogo.tsx
// Tile de logo dos programas nas listas de bônus (wordmark tipográfico, padrão do design v2).

type WordmarkPart = { text: string; color: string }

type Wordmark = {
  parts: WordmarkPart[]
  /** LATAM PASS empilha as duas palavras. */
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
      { text: 'LATAM', color: '#16007C' },
      { text: 'PASS', color: '#ED1650' },
    ],
  },
  smiles: { parts: [{ text: 'smiles', color: '#FF5A00' }], fontSize: 10 },
  livelo: { parts: [{ text: 'livelo', color: '#DF0979' }], fontSize: 10 },
  esfera: { parts: [{ text: 'esfera', color: '#D6001C' }], fontSize: 9.5 },
  nubank: { parts: [{ text: 'nu', color: '#820AD1' }], fontSize: 12 },
}

function wordmarkFor(program: string): Wordmark | undefined {
  const key = program.toLowerCase().replace(/[^a-z]/g, '')
  if (WORDMARKS[key]) return WORDMARKS[key]
  const match = Object.keys(WORDMARKS).find(k => key.startsWith(k))
  return match ? WORDMARKS[match] : undefined
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
}

export function BonusProgramLogo({ program, size = 44 }: BonusProgramLogoProps) {
  const mark = wordmarkFor(program)
  const scale = size / 44

  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center border border-nubank-border bg-white"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.32) }}
    >
      {mark ? (
        mark.stacked ? (
          <span className="flex flex-col items-center gap-px">
            <span
              className="font-extrabold leading-none tracking-[0.02em]"
              style={{ color: mark.parts[0].color, fontSize: 8.5 * scale }}
            >
              {mark.parts[0].text}
            </span>
            <span
              className="font-extrabold leading-none tracking-[0.16em]"
              style={{ color: mark.parts[1].color, fontSize: 6.5 * scale }}
            >
              {mark.parts[1].text}
            </span>
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
          className="font-bold leading-none text-nubank-text-secondary"
          style={{ fontSize: 11 * scale }}
        >
          {initials(program)}
        </span>
      )}
    </span>
  )
}
