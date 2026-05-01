# Program Selection Sheet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o dropdown de checkboxes em `Index.tsx` por um bottom sheet full-screen com separação ativos/disponíveis e busca em tempo real.

**Architecture:** Criar `ProgramSelectionSheet.tsx` como componente isolado sem dependência de tipos internos de `Index.tsx`. O componente recebe `activePrograms` (programas ativos com saldo), `availableOptions` (lista completa), `onToggle` e `onClose` — toda a lógica de persistência permanece em `Index.tsx` sem alteração. A animação usa CSS transform (`translateY`) com `transition` Tailwind, sem libs externas.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vitest + Testing Library, Lucide React.

---

## Arquivos

| Ação | Caminho |
|---|---|
| **Criar** | `src/components/ProgramSelectionSheet.tsx` |
| **Modificar** | `src/pages/Index.tsx` (remover dropdown inline, importar e usar o sheet) |
| **Criar** | `src/components/__tests__/ProgramSelectionSheet.test.tsx` |

---

## Task 1: Extrair utilitários puros do sheet e testar

**Files:**
- Create: `src/components/ProgramSelectionSheet.tsx` (só os utilitários por enquanto)
- Create: `src/components/__tests__/ProgramSelectionSheet.test.tsx`

- [ ] **Step 1: Criar o arquivo de testes**

```typescript
// src/components/__tests__/ProgramSelectionSheet.test.tsx
import { describe, it, expect } from "vitest";
import { filterPrograms, highlightSegments } from "../ProgramSelectionSheet";

const OPTIONS = [
  { programId: "latam-pass", name: "Latam Pass", logo: "LP", logoColor: "#1a3a6b" },
  { programId: "livelo",     name: "Livelo",     logo: "Lv", logoColor: "#e91e63" },
  { programId: "smiles",     name: "Smiles",     logo: "Sm", logoColor: "#f59e42" },
];

describe("filterPrograms", () => {
  it("retorna todos quando query é vazia", () => {
    const result = filterPrograms(OPTIONS, "");
    expect(result).toHaveLength(3);
  });

  it("filtra por nome case-insensitive", () => {
    const result = filterPrograms(OPTIONS, "latam");
    expect(result).toHaveLength(1);
    expect(result[0].programId).toBe("latam-pass");
  });

  it("retorna vazio quando nada bate", () => {
    const result = filterPrograms(OPTIONS, "zzz");
    expect(result).toHaveLength(0);
  });
});

describe("highlightSegments", () => {
  it("retorna [{text, highlight:false}] quando query é vazia", () => {
    expect(highlightSegments("Latam Pass", "")).toEqual([
      { text: "Latam Pass", highlight: false },
    ]);
  });

  it("divide em três segmentos quando match está no meio", () => {
    const segs = highlightSegments("Latam Pass", "tam");
    expect(segs).toEqual([
      { text: "La",   highlight: false },
      { text: "tam",  highlight: true  },
      { text: " Pass", highlight: false },
    ]);
  });

  it("retorna [{text, highlight:false}] quando não há match", () => {
    expect(highlightSegments("Livelo", "zzz")).toEqual([
      { text: "Livelo", highlight: false },
    ]);
  });
});
```

- [ ] **Step 2: Rodar os testes — devem falhar**

```bash
npx vitest run src/components/__tests__/ProgramSelectionSheet.test.tsx
```

Esperado: `FAIL — Cannot find module '../ProgramSelectionSheet'`

- [ ] **Step 3: Criar o arquivo com os utilitários exportados**

```typescript
// src/components/ProgramSelectionSheet.tsx
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
    { text: text.slice(0, idx),               highlight: false },
    { text: text.slice(idx, idx + query.length), highlight: true  },
    { text: text.slice(idx + query.length),   highlight: false },
  ].filter((s) => s.text.length > 0);
}
```

- [ ] **Step 4: Rodar os testes — devem passar**

```bash
npx vitest run src/components/__tests__/ProgramSelectionSheet.test.tsx
```

Esperado: `✓ 6 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/ProgramSelectionSheet.tsx src/components/__tests__/ProgramSelectionSheet.test.tsx
git commit -m "feat: add ProgramSelectionSheet utils with tests (filterPrograms, highlightSegments)"
```

---

## Task 2: Implementar o componente completo ProgramSelectionSheet

**Files:**
- Modify: `src/components/ProgramSelectionSheet.tsx` (adicionar o componente React)

- [ ] **Step 1: Substituir o conteúdo do arquivo pelo componente completo**

```typescript
// src/components/ProgramSelectionSheet.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
    { text: text.slice(0, idx),                  highlight: false },
    { text: text.slice(idx, idx + query.length),  highlight: true  },
    { text: text.slice(idx + query.length),       highlight: false },
  ].filter((s) => s.text.length > 0);
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProgramSelectionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  activePrograms: ActiveProgram[];
  onToggle: (option: ProgramOption) => void;
  availableOptions: readonly ProgramOption[];
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ProgramSelectionSheet({
  isOpen,
  onClose,
  activePrograms,
  onToggle,
  availableOptions,
}: ProgramSelectionSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // dois frames para garantir que o DOM pintou antes de animar
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
      const t = setTimeout(() => searchRef.current?.focus(), 400);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
      const t = setTimeout(() => {
        setMounted(false);
        setSearch("");
      }, 350);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const q = search.trim().toLowerCase();

  const filteredActive = useMemo(
    () => filterPrograms(activePrograms, q),
    [activePrograms, q],
  );

  const filteredAvailable = useMemo(
    () =>
      filterPrograms(
        availableOptions.filter(
          (opt) => !activePrograms.some((p) => p.programId === opt.programId),
        ),
        q,
      ),
    [availableOptions, activePrograms, q],
  );

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Dim overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 top-12 flex flex-col rounded-t-[22px]",
          "border-t border-white/10 bg-[#16162a] shadow-2xl",
          "transition-transform duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
          visible ? "translate-y-0" : "translate-y-full",
        )}
      >
        {/* Grab pill */}
        <div className="flex flex-shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 px-4 pb-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-white">Meus Programas</h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[11px] font-semibold text-purple-300">
                {activePrograms.length} ativos
              </span>
              <button
                type="button"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-slate-400 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Busca */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border bg-[#0f0f1a] px-3 py-2.5 transition-colors",
              search ? "border-purple-500" : "border-white/10",
            )}
          >
            <Search
              size={14}
              className={cn(
                "flex-shrink-0 transition-colors",
                search ? "text-purple-400" : "text-slate-500",
              )}
            />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar programa..."
              className="flex-1 bg-transparent text-[13px] text-white placeholder:text-slate-500 focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-[11px] text-slate-400 transition-colors hover:text-white"
              >
                limpar
              </button>
            )}
          </div>
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto">
          {/* Seção Ativos */}
          {filteredActive.length > 0 && (
            <>
              <SectionLabel label="Ativos" count={filteredActive.length} variant="active" />
              {filteredActive.map((prog) => (
                <ProgramRow
                  key={prog.programId}
                  logo={prog.logo}
                  logoColor={prog.logoColor}
                  name={prog.name}
                  sub={
                    prog.balance !== "0"
                      ? `${Number(prog.balance).toLocaleString("pt-BR")} milhas`
                      : undefined
                  }
                  query={q}
                  isActive
                  onAction={() => onToggle(prog)}
                />
              ))}
            </>
          )}

          {/* Seção Disponíveis */}
          {filteredAvailable.length > 0 && (
            <>
              <SectionLabel
                label="Disponíveis"
                count={filteredAvailable.length}
                variant="inactive"
              />
              {filteredAvailable.map((opt) => (
                <ProgramRow
                  key={opt.programId}
                  logo={opt.logo}
                  logoColor={opt.logoColor}
                  name={opt.name}
                  query={q}
                  isActive={false}
                  onAction={() => onToggle(opt)}
                />
              ))}
            </>
          )}

          {/* Empty state */}
          {filteredActive.length === 0 && filteredAvailable.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-slate-500">
                Nenhum programa encontrado para &ldquo;{search}&rdquo;
              </p>
            </div>
          )}
        </div>

        {/* Botão fixo no rodapé */}
        <div className="flex-shrink-0 border-t border-white/8 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 py-3 text-[13px] font-bold text-white shadow-lg shadow-purple-500/30 transition-opacity active:opacity-90"
          >
            Confirmar seleção
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componentes internos ──────────────────────────────────────────────────

function SectionLabel({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: "active" | "inactive";
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-[#16162a] px-4 py-2">
      <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <div className="h-px flex-1 bg-white/8" />
      <span
        className={cn(
          "whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold",
          variant === "active"
            ? "bg-purple-500/20 text-purple-300"
            : "bg-white/5 text-slate-500",
        )}
      >
        {count}
      </span>
    </div>
  );
}

function ProgramRow({
  logo,
  logoColor,
  name,
  sub,
  query,
  isActive,
  onAction,
}: {
  logo: string;
  logoColor: string;
  name: string;
  sub?: string;
  query: string;
  isActive: boolean;
  onAction: () => void;
}) {
  const segments = highlightSegments(name, query);

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-white/5 px-4 py-3",
        !isActive && "opacity-70",
      )}
    >
      {/* Dot indicador */}
      <div
        className={cn(
          "h-1.5 w-1.5 flex-shrink-0 rounded-full",
          isActive ? "bg-emerald-400" : "bg-transparent",
        )}
      />

      {/* Logo */}
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px] text-[11px] font-extrabold text-white"
        style={{ background: logoColor }}
      >
        {logo}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-100">
          {segments.map((seg, i) =>
            seg.highlight ? (
              <span key={i} className="rounded-sm bg-purple-500/30 px-0.5">
                {seg.text}
              </span>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )}
        </p>
        {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
      </div>

      {/* Botão ação */}
      <button
        type="button"
        onClick={onAction}
        className={cn(
          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors",
          isActive
            ? "border border-red-500/25 bg-red-500/12 text-red-400 hover:bg-red-500/20"
            : "border border-purple-500/35 bg-purple-500/12 text-purple-400 hover:bg-purple-500/20",
        )}
      >
        {isActive ? <Minus size={13} /> : <Plus size={13} />}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Rodar os testes para confirmar que ainda passam**

```bash
npx vitest run src/components/__tests__/ProgramSelectionSheet.test.tsx
```

Esperado: `✓ 6 tests passed`

- [ ] **Step 3: Commit**

```bash
git add src/components/ProgramSelectionSheet.tsx
git commit -m "feat: implement ProgramSelectionSheet full-screen bottom sheet"
```

---

## Task 3: Integrar ProgramSelectionSheet no Index.tsx

**Files:**
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Adicionar o import no topo de Index.tsx**

Localizar o bloco de imports no início do arquivo e adicionar:

```typescript
import { ProgramSelectionSheet } from "@/components/ProgramSelectionSheet";
```

- [ ] **Step 2: Remover o dropdown inline e substituir pelo componente**

Localizar este bloco em `Index.tsx` (aprox. linha 1938):

```tsx
<div className="relative">
  <button
    type="button"
    onClick={() => setIsAddProgramMenuOpen((prev) => !prev)}
    className="inline-flex h-9 items-center justify-center gap-1 rounded-[10px] border border-[#8A05BE] bg-white px-3 text-[11px] font-semibold whitespace-nowrap text-[#8A05BE] shadow-nubank transition-colors hover:bg-purple-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
  >
    <Plus size={12} />
    <span>Novo</span>
  </button>

  {isAddProgramMenuOpen && (
    <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-nubank-border bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-nubank-text-secondary dark:text-slate-400">
        Selecione os programas
      </p>
      <div className="space-y-1">
        {AVAILABLE_PROGRAM_OPTIONS.map((option) => (
          <label
            key={option.programId}
            className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-nubank-text transition-colors hover:bg-primary/5 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <input
              type="checkbox"
              checked={programDefs.some(
                (program) => program.programId === option.programId,
              )}
              onChange={() => handleToggleProgramCard(option)}
              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
            />
            <span
              className="inline-flex h-6 w-6 items-center justify-center overflow-hidden text-[10px] font-semibold"
              style={{ color: option.logoColor }}
            >
              {optionLogoImages[option.programId] ? (
                <img
                  src={optionLogoImages[option.programId]}
                  alt={`Logo ${option.name}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                option.logo
              )}
            </span>
            <span>{option.name}</span>
          </label>
        ))}
      </div>
    </div>
  )}
</div>
```

Substituir por:

```tsx
<button
  type="button"
  onClick={() => setIsAddProgramMenuOpen(true)}
  className="inline-flex h-9 items-center justify-center gap-1 rounded-[10px] border border-[#8A05BE] bg-white px-3 text-[11px] font-semibold whitespace-nowrap text-[#8A05BE] shadow-nubank transition-colors hover:bg-purple-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
>
  <Plus size={12} />
  <span>Novo</span>
</button>

<ProgramSelectionSheet
  isOpen={isAddProgramMenuOpen}
  onClose={() => setIsAddProgramMenuOpen(false)}
  activePrograms={programDefs.map((p) => ({
    programId: p.programId,
    name: p.name,
    logo: p.logo,
    logoColor: p.logoColor,
    balance: p.balance,
  }))}
  onToggle={handleToggleProgramCard}
  availableOptions={AVAILABLE_PROGRAM_OPTIONS}
/>
```

- [ ] **Step 3: Verificar que TypeScript compila sem erros**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Rodar todos os testes**

```bash
npx vitest run
```

Esperado: todos os testes passam.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: replace program dropdown with full-screen ProgramSelectionSheet"
```

---

## Task 4: Verificar visualmente no browser

**Files:** nenhum arquivo novo — verificação manual.

- [ ] **Step 1: Iniciar o servidor de desenvolvimento**

```bash
npm run dev
```

- [ ] **Step 2: Abrir o app e testar o fluxo completo**

Verificar:
1. Clicar em `+ Novo` abre o sheet com animação de baixo para cima
2. Sheet ocupa a tela toda (top ~48px)
3. Seção "Ativos" lista programas com dot verde, saldo e botão `−`
4. Seção "Disponíveis" lista programas inativos com botão `+`
5. Digitar na busca filtra em tempo real nas duas seções
6. Match no nome aparece em roxo highlight
7. Limpar a busca restaura a lista
8. Clicar `−` remove da seção Ativos (move para Disponíveis)
9. Clicar `+` adiciona à seção Ativos
10. Clicar "Confirmar seleção" fecha o sheet
11. Clicar fora do sheet (no overlay) fecha o sheet
12. Grab pill visível no topo do sheet

- [ ] **Step 3: Verificar em mobile (DevTools → Toggle device)**

Testar em viewport 390×844 (iPhone 14). Confirmar que o sheet não corta conteúdo e o scroll interno funciona.

- [ ] **Step 4: Commit final se ajustes forem necessários**

```bash
git add -p
git commit -m "fix: adjust ProgramSelectionSheet mobile layout"
```
