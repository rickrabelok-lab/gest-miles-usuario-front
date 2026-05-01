// ── Tipos públicos ────────────────────────────────────────────────────────────

export type ProgramOption = {
  programId: string;
  name: string;
  logo: string;
  logoColor: string;
};

export type ActiveProgram = ProgramOption & {
  balance: string;
};

export type HighlightSegment = { text: string; highlight: boolean };

// ── Utilitários puros (exportados para teste) ─────────────────────────────────

export function filterPrograms<T extends { name: string }>(
  list: T[],
  query: string,
): T[] {
  if (!query) return list;
  const q = query.toLowerCase();
  return list.filter((item) => item.name.toLowerCase().includes(q));
}

export function highlightSegments(text: string, query: string): HighlightSegment[] {
  if (!query) return [{ text, highlight: false }];
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return [{ text, highlight: false }];
  return [
    { text: text.slice(0, idx),                highlight: false },
    { text: text.slice(idx, idx + query.length), highlight: true  },
    { text: text.slice(idx + query.length),    highlight: false },
  ].filter((s) => s.text.length > 0);
}
