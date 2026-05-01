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
  logoImages?: Record<string, string>;
}

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
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // dois frames para garantir que o DOM pintou antes de animar
      let id2: number;
      const id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => setVisible(true));
      });
      const t = setTimeout(() => searchRef.current?.focus(), 400);
      return () => {
        cancelAnimationFrame(id1);
        cancelAnimationFrame(id2);
        clearTimeout(t);
      };
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="program-sheet-title"
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
            <h2 id="program-sheet-title" className="text-base font-bold text-white">Meus Programas</h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[11px] font-semibold text-purple-300">
                {activePrograms.length} ativos
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-slate-400 transition-colors hover:bg-white/15 hover:text-white"
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
              aria-label="Buscar programa"
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
                  logoImageUrl={logoImages?.[prog.programId]}
                  name={prog.name}
                  sub={
                    Number(prog.balance) > 0
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
                  logoImageUrl={logoImages?.[opt.programId]}
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
        <div className="flex-shrink-0 border-t border-white/10 px-4 py-3">
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
      <div className="h-px flex-1 bg-white/10" />
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
  logoImageUrl,
  name,
  sub,
  query,
  isActive,
  onAction,
}: {
  logo: string;
  logoColor: string;
  logoImageUrl?: string;
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
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-[9px] text-[11px] font-extrabold text-white"
        style={{ background: logoColor }}
      >
        {logoImageUrl ? (
          <img src={logoImageUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          logo
        )}
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
        aria-label={isActive ? `Remover ${name}` : `Adicionar ${name}`}
        className={cn(
          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-colors",
          isActive
            ? "border border-red-500/25 bg-red-500/15 text-red-400 hover:bg-red-500/20"
            : "border border-purple-500/35 bg-purple-500/15 text-purple-400 hover:bg-purple-500/20",
        )}
      >
        {isActive ? <Minus size={13} /> : <Plus size={13} />}
      </button>
    </div>
  );
}
