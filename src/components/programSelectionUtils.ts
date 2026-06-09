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
    { text: text.slice(0, idx), highlight: false },
    { text: text.slice(idx, idx + query.length), highlight: true },
    { text: text.slice(idx + query.length), highlight: false },
  ].filter((s) => s.text.length > 0);
}

export type ProgramCategory = "aereas" | "pontos" | "bancos" | "hoteis" | "outros";

/** Categoria por programId. Fonte única da verdade (chips + seções). */
export const PROGRAM_CATEGORY: Record<string, ProgramCategory> = {
  "latam-pass": "aereas",
  smiles: "aereas",
  "tudo-azul": "aereas",
  iberia: "aereas",
  "copa-airlines": "aereas",
  finnair: "aereas",
  "qatar-airways": "aereas",
  "british-airways": "aereas",
  tap: "aereas",
  "american-airlines": "aereas",
  livelo: "pontos",
  esfera: "pontos",
  itau: "bancos",
  "inter-loop": "bancos",
  amex: "bancos",
  "atomos-c6": "bancos",
  "uau-caixa": "bancos",
  "brb-dux": "bancos",
  "all-accor": "hoteis",
  coopera: "outros",
  kmv: "outros",
};

export function categoryOf(programId: string): ProgramCategory {
  return PROGRAM_CATEGORY[programId] ?? "outros";
}

/** Metadados de cada categoria. A ORDEM aqui define a ordem das seções e dos chips. */
export const CATEGORY_META: Array<{
  id: ProgramCategory;
  label: string;
  shortLabel: string;
  emoji: string;
}> = [
  { id: "aereas", label: "Companhias aéreas", shortLabel: "Aéreas", emoji: "✈️" },
  { id: "pontos", label: "Pontos & coalizão", shortLabel: "Pontos", emoji: "⭐" },
  { id: "bancos", label: "Bancos & cartões", shortLabel: "Bancos", emoji: "🏦" },
  { id: "hoteis", label: "Hotéis", shortLabel: "Hotéis", emoji: "🏨" },
  { id: "outros", label: "Outros", shortLabel: "Outros", emoji: "•" },
];

export type ProgramSection<T> = {
  id: ProgramCategory;
  label: string;
  emoji: string;
  items: T[];
};

/** Agrupa por categoria na ordem de CATEGORY_META; omite seções vazias. */
export function groupByCategory<T extends { programId: string }>(
  list: T[],
): ProgramSection<T>[] {
  return CATEGORY_META.map((meta) => ({
    id: meta.id,
    label: meta.label,
    emoji: meta.emoji,
    items: list.filter((item) => categoryOf(item.programId) === meta.id),
  })).filter((section) => section.items.length > 0);
}
