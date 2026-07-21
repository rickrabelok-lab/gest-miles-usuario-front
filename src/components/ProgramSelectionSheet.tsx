// src/components/ProgramSelectionSheet.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BonusProgramLogo, hasCuratedProgramMark } from "@/components/bonus/BonusProgramLogo";
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
 * Logo do programa: tile branco com a imagem (branding/admin) e, em caso de
 * falha de carregamento ou ausência de URL, cai no tile-padrão do app
 * (wordmark curado ou chip de iniciais na cor da marca). Exportado para teste.
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

  // Símbolo SVG empacotado vence a imagem do branding (qualidade garantida).
  const showImage = Boolean(logoImageUrl) && !failed && !hasCuratedProgramMark(name);

  if (!showImage) {
    return (
      <BonusProgramLogo
        program={name}
        size={40}
        fallbackInitials={logo}
        fallbackColor={logoColor}
      />
    );
  }

  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#ECECEC] bg-white">
      <img
        src={logoImageUrl}
        alt={name}
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain p-1"
      />
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
