# Redesenho do Seletor de Programas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o seletor de programas (iniciais coloridas, lista única, tema dark) por um bottom-sheet claro com logos reais (CDN + fallback de badge), agrupado por categoria com chips de filtro; e remover o programa "Avios (IAG)" do catálogo.

**Architecture:** A categoria de cada programa vive num mapa único `PROGRAM_CATEGORY` (por `programId`) em `programSelectionUtils.ts` — sem mudar o tipo `ProgramOption`. O sheet une programas ativos + disponíveis numa lista, filtra por chip+busca e agrupa via `groupByCategory`. As URLs de logo são resolvidas em `Index.tsx` (branding/localStorage → CDN Clearbit por domínio) e passadas via a prop `logoImages` já existente; o sheet renderiza `<img onError>` com fallback pra badge (cor+monograma), então nunca quebra.

**Tech Stack:** React 18 + TS frouxo + Tailwind (tokens `nubank-*`, `font-display`, roxo `#8A05BE`) + lucide-react + Vitest + Testing Library/jsdom.

**Spec:** `docs/superpowers/specs/2026-06-09-program-selector-redesign-design.md`

**Verificação por task:** `npx tsc -b` limpo + `npm test` passando. Build final no fim.

---

### Task 1: Modelo de categoria + agrupamento (utils, TDD)

**Files:**
- Modify: `src/components/programSelectionUtils.ts`
- Test: `src/components/__tests__/ProgramSelectionSheet.test.tsx`

- [ ] **Step 1: Escrever os testes falhando**

Adicionar ao fim de `src/components/__tests__/ProgramSelectionSheet.test.tsx` (manter os testes atuais de `filterPrograms`/`highlightSegments` no topo; adicionar o import):

```tsx
import {
  categoryOf,
  groupByCategory,
  CATEGORY_META,
} from "../programSelectionUtils";

describe("categoryOf", () => {
  it("mapeia companhias aéreas", () => {
    expect(categoryOf("latam-pass")).toBe("aereas");
    expect(categoryOf("tap")).toBe("aereas");
    expect(categoryOf("american-airlines")).toBe("aereas");
  });

  it("mapeia pontos, bancos, hotéis e outros", () => {
    expect(categoryOf("livelo")).toBe("pontos");
    expect(categoryOf("itau")).toBe("bancos");
    expect(categoryOf("all-accor")).toBe("hoteis");
    expect(categoryOf("coopera")).toBe("outros");
  });

  it("usa 'outros' para programId desconhecido", () => {
    expect(categoryOf("programa-fantasma")).toBe("outros");
  });
});

describe("groupByCategory", () => {
  const rows = [
    { programId: "itau", name: "Itaú" },
    { programId: "latam-pass", name: "LATAM Pass" },
    { programId: "livelo", name: "Livelo" },
    { programId: "all-accor", name: "ALL Accor" },
  ];

  it("agrupa na ordem fixa e ignora seções vazias", () => {
    const sections = groupByCategory(rows);
    expect(sections.map((s) => s.id)).toEqual([
      "aereas",
      "pontos",
      "bancos",
      "hoteis",
    ]);
  });

  it("coloca cada item na seção certa", () => {
    const sections = groupByCategory(rows);
    const aereas = sections.find((s) => s.id === "aereas");
    expect(aereas?.items.map((i) => i.programId)).toEqual(["latam-pass"]);
  });

  it("CATEGORY_META cobre as 5 categorias na ordem", () => {
    expect(CATEGORY_META.map((m) => m.id)).toEqual([
      "aereas",
      "pontos",
      "bancos",
      "hoteis",
      "outros",
    ]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- ProgramSelectionSheet`
Expected: FAIL — `categoryOf`/`groupByCategory`/`CATEGORY_META` não exportados.

- [ ] **Step 3: Implementar no utils**

Adicionar ao fim de `src/components/programSelectionUtils.ts` (manter o que já existe):

```ts
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- ProgramSelectionSheet`
Expected: PASS (todos, incluindo os antigos de filter/highlight).

- [ ] **Step 5: Commit**

```bash
git add src/components/programSelectionUtils.ts src/components/__tests__/ProgramSelectionSheet.test.tsx
git commit -m "feat(usuario): categorias de programa + groupByCategory no seletor"
```

---

### Task 2: Reescrita do ProgramSelectionSheet (tema claro + chips + seções + logo com fallback)

**Files:**
- Modify (rewrite): `src/components/ProgramSelectionSheet.tsx`
- Test: `src/components/__tests__/ProgramSelectionSheet.test.tsx`

- [ ] **Step 1: Escrever o teste do ProgramLogo (falhando)**

Adicionar ao fim de `src/components/__tests__/ProgramSelectionSheet.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { ProgramLogo } from "../ProgramSelectionSheet";

describe("ProgramLogo", () => {
  it("renderiza <img> quando há URL", () => {
    render(
      <ProgramLogo
        logoImageUrl="https://logo.clearbit.com/latam.com"
        logo="LP"
        logoColor="#1a3a6b"
        name="LATAM Pass"
      />,
    );
    const img = screen.getByAltText("LATAM Pass") as HTMLImageElement;
    expect(img.src).toContain("latam.com");
    expect(screen.queryByText("LP")).toBeNull();
  });

  it("cai no badge (monograma) quando a imagem falha", () => {
    render(
      <ProgramLogo
        logoImageUrl="https://logo.clearbit.com/inexistente.zzz"
        logo="QA"
        logoColor="#5a1f3d"
        name="Qatar Airways"
      />,
    );
    fireEvent.error(screen.getByAltText("Qatar Airways"));
    expect(screen.getByText("QA")).toBeTruthy();
  });

  it("mostra o badge quando não há URL", () => {
    render(<ProgramLogo logo="CP" logoColor="#2d6a4f" name="Coopera" />);
    expect(screen.getByText("CP")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- ProgramSelectionSheet`
Expected: FAIL — `ProgramLogo` não exportado de `ProgramSelectionSheet`.

- [ ] **Step 3: Reescrever `src/components/ProgramSelectionSheet.tsx`**

Substituir o arquivo INTEIRO por:

```tsx
// src/components/ProgramSelectionSheet.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORY_META,
  categoryOf,
  groupByCategory,
  highlightSegments,
  type ActiveProgram,
  type ProgramCategory,
  type ProgramOption,
} from "./programSelectionUtils";

export type { ActiveProgram, ProgramOption } from "./programSelectionUtils";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProgramSelectionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activePrograms: ActiveProgram[];
  onToggle: (option: ProgramOption) => void;
  availableOptions: readonly ProgramOption[];
  logoImages?: Record<string, string>;
}

type SheetRow = {
  programId: string;
  name: string;
  logo: string;
  logoColor: string;
  isActive: boolean;
  balance?: string;
};

type ChipId = ProgramCategory | "todos";

// ── Componente principal ──────────────────────────────────────────────────────

export function ProgramSelectionSheet({
  isOpen,
  onClose,
  activePrograms,
  onToggle,
  availableOptions,
  logoImages,
}: ProgramSelectionSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<ChipId>("todos");
  const searchRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // dois frames para garantir que o DOM pintou antes de animar
      let id2: number;
      const id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => setVisible(true));
      });
      const t = setTimeout(() => searchRef.current?.focus(), 400);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onCloseRef.current();
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("keydown", handleKeyDown);
        cancelAnimationFrame(id1);
        cancelAnimationFrame(id2);
        clearTimeout(t);
      };
    } else {
      setVisible(false);
      const t = setTimeout(() => {
        setMounted(false);
        setSearch("");
        setChip("todos");
      }, 350);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const q = search.trim().toLowerCase();

  const allRows = useMemo<SheetRow[]>(() => {
    const activeIds = new Set(activePrograms.map((p) => p.programId));
    const actives: SheetRow[] = activePrograms.map((p) => ({
      programId: p.programId,
      name: p.name,
      logo: p.logo,
      logoColor: p.logoColor,
      isActive: true,
      balance: p.balance,
    }));
    const availables: SheetRow[] = availableOptions
      .filter((o) => !activeIds.has(o.programId))
      .map((o) => ({
        programId: o.programId,
        name: o.name,
        logo: o.logo,
        logoColor: o.logoColor,
        isActive: false,
      }));
    return [...actives, ...availables];
  }, [activePrograms, availableOptions]);

  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = { todos: allRows.length };
    for (const row of allRows) {
      const c = categoryOf(row.programId);
      counts[c] = (counts[c] ?? 0) + 1;
    }
    return counts;
  }, [allRows]);

  const sections = useMemo(() => {
    const visibleRows = allRows.filter(
      (row) =>
        (chip === "todos" || categoryOf(row.programId) === chip) &&
        (!q || row.name.toLowerCase().includes(q)),
    );
    return groupByCategory(visibleRows);
  }, [allRows, chip, q]);

  const activeCount = useMemo(
    () => allRows.filter((r) => r.isActive).length,
    [allRows],
  );

  if (!mounted) return null;

  const chips: { id: ChipId; label: string; emoji: string }[] = [
    { id: "todos", label: "Todos", emoji: "" },
    ...CATEGORY_META.map((m) => ({ id: m.id, label: m.shortLabel, emoji: m.emoji })),
  ];

  return (
    <div className="fixed inset-0 z-50">
      {/* Dim overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="program-sheet-title"
        className={cn(
          "absolute inset-x-0 bottom-0 top-12 flex flex-col rounded-t-[24px]",
          "border-t border-[#ECECEC] bg-white shadow-2xl",
          "transition-transform [transition-duration:350ms] [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]",
          visible ? "translate-y-0" : "translate-y-full",
        )}
      >
        {/* Grab pill */}
        <div className="flex flex-shrink-0 justify-center pb-1 pt-3">
          <div className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 px-4 pb-2">
          <div className="mb-3 flex items-center justify-between">
            <h2
              id="program-sheet-title"
              className="font-display text-lg font-bold text-nubank-text"
            >
              Meus Programas
            </h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#8A05BE]/10 px-2.5 py-1 text-[11px] font-bold text-[#8A05BE]">
                {activeCount}/{allRows.length}
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Busca */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border bg-[#FAFAFB] px-3 py-2.5 transition-colors focus-within:border-[#8A05BE] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#8A05BE]/15",
              search ? "border-[#8A05BE]" : "border-[#ECECEC]",
            )}
          >
            <Search
              size={14}
              className={cn(
                "flex-shrink-0 transition-colors",
                search ? "text-[#8A05BE]" : "text-slate-400",
              )}
            />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar programa..."
              aria-label="Buscar programa"
              className="flex-1 bg-transparent text-[13px] text-nubank-text placeholder:text-slate-400 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-[11px] text-slate-400 transition-colors hover:text-slate-600"
              >
                limpar
              </button>
            )}
          </div>
        </div>

        {/* Chips de categoria */}
        <div className="flex flex-shrink-0 gap-2 overflow-x-auto px-4 pb-2 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((c) => {
            const isActive = chip === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setChip(c.id)}
                aria-pressed={isActive}
                className={cn(
                  "flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                  isActive
                    ? "border-[#8A05BE] bg-[#8A05BE] text-white"
                    : "border-[#ECECEC] bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                {c.emoji && <span>{c.emoji}</span>}
                <span>{c.label}</span>
                <span
                  className={cn(
                    "text-[11px] font-bold",
                    isActive ? "text-white/80" : "text-slate-400",
                  )}
                >
                  {chipCounts[c.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto">
          {sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-slate-400">
                Nenhum programa encontrado{search ? ` para “${search}”` : ""}.
              </p>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.id}>
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-white/95 px-4 py-2 backdrop-blur">
                  <span className="text-sm">{section.emoji}</span>
                  <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    {section.label}
                  </span>
                  <div className="h-px flex-1 bg-[#F0F0F2]" />
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                    {section.items.length}
                  </span>
                </div>
                {section.items.map((row) => (
                  <ProgramRow
                    key={row.programId}
                    row={row}
                    logoImageUrl={logoImages?.[row.programId]}
                    query={q}
                    onAction={() =>
                      onToggle({
                        programId: row.programId,
                        name: row.name,
                        logo: row.logo,
                        logoColor: row.logoColor,
                      })
                    }
                  />
                ))}
              </div>
            ))
          )}
        </div>

        {/* Botão fixo no rodapé */}
        <div className="flex-shrink-0 border-t border-[#ECECEC] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-gradient-to-r from-[#8A05BE] to-[#a626d6] py-3 text-[13px] font-bold text-white shadow-lg shadow-[#8A05BE]/25 transition-opacity active:opacity-90"
          >
            Confirmar seleção
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes internos ──────────────────────────────────────────────────

/**
 * Logo do programa: tile branco com a imagem (asset/branding/CDN) e, em caso de
 * falha de carregamento ou ausência de URL, cai num badge com a cor da marca +
 * o monograma. Exportado para teste.
 */
export function ProgramLogo({
  logoImageUrl,
  logo,
  logoColor,
  name,
}: {
  logoImageUrl?: string;
  logo: string;
  logoColor: string;
  name: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoImageUrl]);

  const showImage = Boolean(logoImageUrl) && !failed;

  return (
    <div
      className={cn(
        "flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl",
        showImage && "border border-[#ECECEC] bg-white",
      )}
      style={showImage ? undefined : { background: logoColor }}
    >
      {showImage ? (
        <img
          src={logoImageUrl}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <span className="font-display text-[12px] font-bold text-white">{logo}</span>
      )}
    </div>
  );
}

function ProgramRow({
  row,
  logoImageUrl,
  query,
  onAction,
}: {
  row: SheetRow;
  logoImageUrl?: string;
  query: string;
  onAction: () => void;
}) {
  const segments = highlightSegments(row.name, query);
  const hasBalance =
    row.isActive && row.balance && row.balance !== "0" && row.balance !== "";

  return (
    <button
      type="button"
      onClick={onAction}
      aria-pressed={row.isActive}
      aria-label={row.isActive ? `Remover ${row.name}` : `Adicionar ${row.name}`}
      className="flex w-full items-center gap-3 border-b border-[#F4F2F7] px-4 py-2.5 text-left transition-colors hover:bg-[#FAF8FC]"
    >
      <ProgramLogo
        logoImageUrl={logoImageUrl}
        logo={row.logo}
        logoColor={row.logoColor}
        name={row.name}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-nubank-text">
          {segments.map((seg, i) =>
            seg.highlight ? (
              <span key={i} className="rounded-sm bg-[#8A05BE]/15 px-0.5 text-[#8A05BE]">
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
        {hasBalance && (
          <p className="text-[11.5px] text-slate-500">{row.balance} milhas</p>
        )}
      </div>

      <span
        aria-hidden="true"
        className={cn(
          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border transition-colors",
          row.isActive
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-[#8A05BE]/35 bg-white text-[#8A05BE]",
        )}
      >
        {row.isActive ? <Check size={14} /> : <Plus size={14} />}
      </span>
    </button>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- ProgramSelectionSheet`
Expected: PASS (utils + ProgramLogo).

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/components/ProgramSelectionSheet.tsx src/components/__tests__/ProgramSelectionSheet.test.tsx
git commit -m "feat(usuario): seletor de programas tema claro com chips, seções e logo+fallback"
```

---

### Task 3: Fiação no Index — logos via CDN + remover Avios do catálogo

**Files:**
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Remover Avios do `PROGRAM_META_MAP`**

Em `src/pages/Index.tsx`, apagar a linha (≈240):

```ts
  avios: { name: "Avios (IAG)", logo: "Av", logoColor: "#0f2f6d" },
```

- [ ] **Step 2: Remover Avios do `AVAILABLE_PROGRAM_OPTIONS`**

Apagar o bloco (≈521–526):

```ts
  {
    programId: "avios",
    name: "Avios (IAG)",
    logo: "Av",
    logoColor: "#0f2f6d",
  },
```

> NÃO mexer no import `programAviosLogo`, em `ACTION_PLAN_PROGRAM_LABELS` (`["avios","Avios"]`) nem em `ACTION_PLAN_PROGRAM_ICON_BY_KEY.avios` — esse "avios" é do plano de ação (`useGestor`), feature separada.

- [ ] **Step 3: Adicionar mapa de domínios + resolver de logo CDN**

Logo APÓS o fechamento de `AVAILABLE_PROGRAM_OPTIONS` (`];`, ≈581), inserir:

```ts
/** Domínio da marca por programa, para resolver a logo via CDN (Clearbit). */
const PROGRAM_LOGO_DOMAIN: Record<string, string> = {
  "latam-pass": "latam.com",
  smiles: "smiles.com.br",
  "tudo-azul": "voeazul.com.br",
  iberia: "iberia.com",
  "copa-airlines": "copaair.com",
  finnair: "finnair.com",
  "qatar-airways": "qatarairways.com",
  "british-airways": "britishairways.com",
  tap: "flytap.com",
  "american-airlines": "aa.com",
  livelo: "livelo.com.br",
  esfera: "esfera.com.vc",
  itau: "itau.com.br",
  "inter-loop": "bancointer.com.br",
  amex: "americanexpress.com",
  "atomos-c6": "c6bank.com.br",
  "uau-caixa": "caixa.gov.br",
  "brb-dux": "brb.com.br",
  "all-accor": "all.accor.com",
};

const cdnLogoForProgram = (programId: string): string | undefined => {
  const domain = PROGRAM_LOGO_DOMAIN[programId];
  return domain ? `https://logo.clearbit.com/${domain}` : undefined;
};
```

- [ ] **Step 4: Mesclar CDN no `programLogoImagesForSheet`**

Substituir o `useMemo` de `programLogoImagesForSheet` (≈741–747) por:

```ts
  const programLogoImagesForSheet = useMemo(() => {
    const out: Record<string, string> = { ...brandingConfig.data.programCardLogos };
    for (const [k, v] of Object.entries(optionLogoImages)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    // Fallback de logo via CDN só onde não há logo custom (branding/localStorage).
    for (const option of AVAILABLE_PROGRAM_OPTIONS) {
      if (!out[option.programId]) {
        const cdn = cdnLogoForProgram(option.programId);
        if (cdn) out[option.programId] = cdn;
      }
    }
    return out;
  }, [brandingConfig.data.programCardLogos, optionLogoImages]);
```

- [ ] **Step 5: Type-check + testes**

Run: `npx tsc -b`
Expected: sem erros.
Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Verificar que Avios sumiu do catálogo (manual)**

Run: `git grep -n "Avios (IAG)" -- src`
Expected: nenhum resultado (só o plano de ação usa `"avios"`/`"Avios"`, sem o sufixo "(IAG)").

- [ ] **Step 7: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat(usuario): logos de programa via CDN no seletor e remove Avios (IAG) do catálogo"
```

---

### Task 4: Verificação final + limpeza

**Files:**
- Delete: `program-selector-mockup.html` (artefato descartável de validação)

- [ ] **Step 1: Suite completa**

Run: `npx tsc -b && npm test && npm run build`
Expected: `tsc` limpo, testes PASS, build OK.

- [ ] **Step 2: Smoke visual manual**

Run: `npm run dev` → abrir o app → aba "Saldo" → botão "Novo".
Conferir: bottom-sheet claro abre; chips filtram (Todos/Aéreas/Pontos/Bancos/Hotéis/Outros); seções com header sticky; logos reais carregam (LATAM, Smiles, Itaú, Amex, Accor, British, Qatar…) e os sem domínio (Coopera, KMV) mostram badge; badge aparece também quando o CDN não resolve; busca + ✓/+ funcionam; Avios não aparece na lista.

- [ ] **Step 3: Remover o mockup**

```bash
git rm --cached program-selector-mockup.html 2>$null; Remove-Item program-selector-mockup.html -ErrorAction SilentlyContinue
```

(O arquivo nunca foi commitado; basta apagar do disco.)

- [ ] **Step 4: Commit final (se houver algo a commitar)**

```bash
git add -A
git commit -m "chore(usuario): remove mockup de validação do seletor de programas"
```

---

## Self-Review

**Spec coverage:**
- Tema claro → Task 2 (paleta branca + `#8A05BE`). ✅
- Logos CDN + fallback badge → Task 2 (`ProgramLogo`) + Task 3 (`cdnLogoForProgram`, merge). ✅
- Categorias 4+Outros → Task 1 (`PROGRAM_CATEGORY`, `CATEGORY_META`, `groupByCategory`). ✅
- Chips + seções sticky → Task 2. ✅
- Busca cruza com chip → Task 2 (`sections` useMemo). ✅
- Seleção add/remove via `onToggle` → Task 2 (`ProgramRow`). ✅
- Remover Avios (IAG) só do catálogo → Task 3 (steps 1–2 + step 6 verifica). ✅
- Manter Avios-moeda/plano-de-ação → Task 3 nota explícita. ✅
- Testes → Task 1 + Task 2. ✅
- Verificação `tsc`/`test`/`build` → Task 4. ✅

**Placeholder scan:** nenhum TBD/TODO; todo step de código tem o código completo.

**Type consistency:** `ProgramCategory`, `PROGRAM_CATEGORY`, `categoryOf`, `CATEGORY_META` (com `id/label/shortLabel/emoji`), `groupByCategory`, `ProgramSection`, `SheetRow`, `ChipId`, `ProgramLogo` — nomes idênticos entre Task 1/2/3. `onToggle` recebe `ProgramOption` (4 campos), sem `category` (categoria vem do lookup), batendo com o caller em `Index.tsx`. `programLogoImagesForSheet` mantém a mesma assinatura/deps.
