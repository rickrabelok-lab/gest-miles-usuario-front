# Solicitar Cotação — Wizard Multi-etapas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o modal scrollável atual por um wizard multi-etapas em `SolicitarCotacaoWizard.tsx`, com roteamento inteligente de gestor e fluxos separados para Emissão (3 etapas) e Outros (3 etapas).

**Architecture:** Novo componente `src/components/SolicitarCotacaoWizard.tsx` gerencia todo o estado do wizard e chama `onSubmit(WizardSubmitParams)` ao final. `Index.tsx` mantém apenas abertura do dialog, carregamento de gestores e o insert no Supabase.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui (Dialog, Button, Textarea, Input), DatePickerField, lucide-react.

---

## File Map

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Create | `src/components/SolicitarCotacaoWizard.tsx` | Todo o estado, UI e lógica do wizard |
| Modify | `src/pages/Index.tsx` | Remove estado antigo, importa wizard, simplifica handleSubmitDemand |

---

### Task 1: Criar SolicitarCotacaoWizard.tsx completo

**Files:**
- Create: `src/components/SolicitarCotacaoWizard.tsx`

- [ ] **Step 1: Criar o arquivo com o componente completo**

Conteúdo integral do arquivo:

```tsx
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { parseYmdToLocalDate } from "@/lib/dateYmd";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export type DemandGestorOption = {
  id: string;
  nome: string;
  perfil: "nacional" | "internacional";
};

type Tipo = "emissao" | "outros";
type Escopo = "nacional" | "internacional";
type OutrosCategoria =
  | "voo"
  | "carro"
  | "hotel"
  | "seguro"
  | "transferencia"
  | "produtos"
  | "outro";
type ClasseVoo = "" | "economica" | "premium-economy" | "executiva" | "primeira-classe";

export type WizardSubmitParams =
  | {
      tipo: "emissao";
      gestorId: string;
      origem: string;
      destino: string;
      dataIda: string;
      dataVolta: string;
      passageiros: number;
      classeVoo: ClasseVoo;
      bagagemDescricao: string;
      assentoDescricao: string;
      flexDatas: "sim" | "nao";
      escopo: Escopo;
    }
  | {
      tipo: "outros";
      gestorId: string;
      categoria: OutrosCategoria;
      escopoVoo: Escopo | undefined;
      detalhes: string;
      escopo: Escopo;
    };

type Props = {
  gestores: DemandGestorOption[];
  submitting: boolean;
  onSubmit: (params: WizardSubmitParams) => Promise<void>;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const OUTROS_CATEGORIAS: { id: OutrosCategoria; icon: string; label: string }[] = [
  { id: "voo", icon: "✈", label: "Upgrade / Alteração de voo" },
  { id: "carro", icon: "🚗", label: "Aluguel de carro" },
  { id: "hotel", icon: "🏨", label: "Hotel" },
  { id: "seguro", icon: "🛡️", label: "Seguro viagem" },
  { id: "transferencia", icon: "🔄", label: "Transferência de pontos" },
  { id: "produtos", icon: "🛍️", label: "Compra de produtos" },
  { id: "outro", icon: "📋", label: "Outro" },
];

const CLASSES_VOO: { id: ClasseVoo; icon: string; label: string }[] = [
  { id: "economica", icon: "💺", label: "Econômica" },
  { id: "premium-economy", icon: "🪑", label: "Prem. Economy" },
  { id: "executiva", icon: "🛋️", label: "Executiva" },
  { id: "primeira-classe", icon: "👑", label: "1ª Classe" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcDiasViagem(dataIda: string, dataVolta: string): number | null {
  if (!dataIda || !dataVolta) return null;
  const [ai, mi, di] = dataIda.split("-").map(Number);
  const [av, mv, dv] = dataVolta.split("-").map(Number);
  const ms = Date.UTC(av, mv - 1, dv) - Date.UTC(ai, mi - 1, di);
  if (isNaN(ms) || ms < 0) return null;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// ── Progress indicator ─────────────────────────────────────────────────────────

function ProgressIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-start px-4 py-3">
      {steps.map((label, i) => {
        const num = i + 1;
        const isDone = num < current;
        const isActive = num === current;
        return (
          <div key={label} className="flex flex-1 items-start last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold",
                  isDone && "bg-green-500 text-white",
                  isActive && "bg-primary text-white shadow-[0_0_0_3px_rgba(138,5,190,0.15)]",
                  !isDone && !isActive && "bg-gray-100 text-gray-400",
                )}
              >
                {isDone ? "✓" : num}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-[9px] font-bold",
                  isDone && "text-green-600",
                  isActive && "text-primary",
                  !isDone && !isActive && "text-gray-400",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mx-1 mb-3.5 h-0.5 flex-1 self-center rounded",
                  isDone ? "bg-green-500" : "bg-gray-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Gestor chip ────────────────────────────────────────────────────────────────

function GestorChip({ gestor }: { gestor: DemandGestorOption | undefined }) {
  if (!gestor) return null;
  const isIntl = gestor.perfil === "internacional";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2",
        isIntl ? "border-blue-200 bg-blue-50" : "border-green-200 bg-green-50",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
          isIntl ? "bg-blue-600" : "bg-green-600",
        )}
      >
        {gestor.nome.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[9px] font-bold uppercase tracking-wide",
            isIntl ? "text-blue-700" : "text-green-700",
          )}
        >
          {isIntl ? "Gestor Internacional" : "Gestor Nacional"}
        </p>
        <p className="truncate text-[11px] font-semibold text-gray-900">{gestor.nome}</p>
      </div>
      <span className={cn("text-sm", isIntl ? "text-blue-600" : "text-green-600")}>✓</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SolicitarCotacaoWizard({ gestores, submitting, onSubmit }: Props) {
  // ── State ──
  const [step, setStep] = useState(1);
  const [tipo, setTipo] = useState<Tipo>("emissao");
  // Emissão
  const [escopo, setEscopo] = useState<Escopo>("nacional");
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [dataIda, setDataIda] = useState("");
  const [dataVolta, setDataVolta] = useState("");
  const [passageiros, setPassageiros] = useState(1);
  const [classeVoo, setClasseVoo] = useState<ClasseVoo>("");
  const [bagagem, setBagagem] = useState(false);
  const [assento, setAssento] = useState(false);
  const [flexDatas, setFlexDatas] = useState(false);
  // Outros
  const [outrosCategoria, setOutrosCategoria] = useState<OutrosCategoria>("voo");
  const [outrosEscopo, setOutrosEscopo] = useState<Escopo>("nacional");
  const [outrosDetalhes, setOutrosDetalhes] = useState("");

  // ── Derived ──
  const gestoresNacionais = useMemo(
    () => gestores.filter((g) => g.perfil === "nacional"),
    [gestores],
  );
  const gestoresInternacionais = useMemo(
    () => gestores.filter((g) => g.perfil === "internacional"),
    [gestores],
  );

  const resolvedGestor = useMemo((): DemandGestorOption | undefined => {
    if (tipo === "emissao") {
      return (escopo === "nacional" ? gestoresNacionais : gestoresInternacionais)[0];
    }
    if (outrosCategoria === "voo" && outrosEscopo === "internacional") {
      return gestoresInternacionais[0];
    }
    return gestoresNacionais[0];
  }, [tipo, escopo, outrosCategoria, outrosEscopo, gestoresNacionais, gestoresInternacionais]);

  const diasViagem = useMemo(() => calcDiasViagem(dataIda, dataVolta), [dataIda, dataVolta]);
  const stepLabels = tipo === "emissao" ? ["Tipo", "Rota", "Extras"] : ["Tipo", "Categoria", "Detalhe"];

  // ── Navigation guards ──
  const canAdvance = (): boolean => {
    if (step === 1) return true;
    if (step === 2 && tipo === "emissao")
      return origem.trim().length > 0 && destino.trim().length > 0 && !!dataIda;
    return true;
  };
  const isLastStep = step === 3;
  const canSubmit =
    !!resolvedGestor &&
    (tipo === "emissao" || outrosDetalhes.trim().length >= 10);

  // ── Handlers ──
  const handleNext = () => setStep((s) => Math.min(s + 1, 3));
  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const handleDataIdaChange = (ymd: string) => {
    setDataIda(ymd);
    if (dataVolta && dataVolta < ymd) setDataVolta("");
  };

  const handleSubmit = async () => {
    if (!resolvedGestor) return;
    if (tipo === "emissao") {
      await onSubmit({
        tipo: "emissao",
        gestorId: resolvedGestor.id,
        origem: origem.trim(),
        destino: destino.trim(),
        dataIda,
        dataVolta,
        passageiros,
        classeVoo,
        bagagemDescricao: bagagem ? "sim" : "",
        assentoDescricao: assento ? "sim" : "",
        flexDatas: flexDatas ? "sim" : "nao",
        escopo,
      });
    } else {
      await onSubmit({
        tipo: "outros",
        gestorId: resolvedGestor.id,
        categoria: outrosCategoria,
        escopoVoo: outrosCategoria === "voo" ? outrosEscopo : undefined,
        detalhes: outrosDetalhes.trim(),
        escopo:
          outrosCategoria === "voo" && outrosEscopo === "internacional"
            ? "internacional"
            : "nacional",
      });
    }
  };

  // ── Step 1: Tipo ──
  const renderStep1 = () => (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">
          Tipo de solicitação
        </p>
        <div className="flex flex-col gap-2">
          {(["emissao", "outros"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={cn(
                "flex items-center gap-3 rounded-[14px] border-2 p-3 text-left transition-colors",
                tipo === t ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-lg",
                  tipo === t ? "bg-primary text-white" : "bg-purple-50",
                )}
              >
                {t === "emissao" ? "✈" : "📋"}
              </div>
              <div className="flex-1">
                <p className="text-[12px] font-bold text-gray-900">
                  {t === "emissao" ? "Emissão de passagem" : "Outra solicitação"}
                </p>
                <p className="text-[10px] text-gray-500">
                  {t === "emissao"
                    ? "Cotação e emissão com milhas"
                    : "Dúvidas, upgrades, transferências…"}
                </p>
              </div>
              <div
                className={cn(
                  "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold",
                  tipo === t ? "border-primary bg-primary text-white" : "border-gray-300",
                )}
              >
                {tipo === t ? "✓" : ""}
              </div>
            </button>
          ))}
        </div>
      </div>

      {tipo === "emissao" && (
        <>
          <div>
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">
              Escopo do voo
            </p>
            <div className="flex gap-2">
              {(["nacional", "internacional"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEscopo(e)}
                  className={cn(
                    "flex-1 rounded-[10px] border-2 py-2 text-[11px] font-bold transition-colors",
                    escopo === e
                      ? "border-primary bg-primary text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-300",
                  )}
                >
                  {e === "nacional" ? "🇧🇷 Nacional" : "🌍 Internacional"}
                </button>
              ))}
            </div>
          </div>
          <GestorChip gestor={resolvedGestor} />
        </>
      )}

      {tipo === "outros" && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-[10px] font-medium text-green-800">
          O gestor responsável será definido na próxima etapa conforme sua solicitação.
        </div>
      )}
    </div>
  );

  // ── Step 2 Emissão: Rota ──
  const renderStep2Emissao = () => (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-[14px] border border-gray-100 bg-gray-50 p-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-primary">Origem</p>
            <Input
              placeholder="Ex: GRU, São Paulo…"
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              className="h-9 rounded-[10px] text-[13px] font-semibold"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const tmp = origem;
              setOrigem(destino);
              setDestino(tmp);
            }}
            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
          >
            ⇄
          </button>
          <div className="flex-1">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-primary">Destino</p>
            <Input
              placeholder="Ex: LIS, JFK…"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="h-9 rounded-[10px] text-[13px] font-semibold"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-primary">
              📅 Data de ida
            </p>
            <DatePickerField
              value={dataIda}
              onChange={handleDataIdaChange}
              placeholder="Escolher"
              triggerClassName="h-9 rounded-[10px] text-xs"
            />
          </div>
          <div>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-gray-400">
              ↩ Volta (opcional)
            </p>
            <DatePickerField
              value={dataVolta}
              onChange={setDataVolta}
              placeholder="Opcional"
              triggerClassName="h-9 rounded-[10px] text-xs"
              disabled={dataIda ? { before: parseYmdToLocalDate(dataIda)! } : undefined}
            />
          </div>
        </div>

        {diasViagem !== null && (
          <p className="text-center text-[10px] font-semibold text-gray-500">
            🕐 Duração:{" "}
            <span className="font-bold text-primary">
              {diasViagem} {diasViagem === 1 ? "dia" : "dias"}
            </span>
          </p>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
        <span className="text-sm">💡</span>
        <p className="text-[10px] font-medium leading-relaxed text-amber-800">
          Não sabe o código IATA? Pode digitar a cidade. Seu gestor cuidará dos detalhes.
        </p>
      </div>
    </div>
  );

  // ── Step 3 Emissão: Extras ──
  const renderStep3Emissao = () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-[14px] border border-gray-100 bg-gray-50 px-4 py-3">
        <div>
          <p className="text-[12px] font-bold text-gray-900">👤 Passageiros</p>
          <p className="text-[10px] text-gray-500">Número de pessoas</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPassageiros((n) => Math.max(1, n - 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-base font-bold text-primary"
          >
            −
          </button>
          <span className="w-5 text-center text-base font-bold text-gray-900">{passageiros}</span>
          <button
            type="button"
            onClick={() => setPassageiros((n) => Math.min(9, n + 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-base font-bold text-primary"
          >
            +
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-500">
          Classe do voo
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CLASSES_VOO.map(({ id, icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setClasseVoo(id)}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-[12px] border-2 text-[11px] font-semibold transition-colors",
                classeVoo === id
                  ? "border-primary bg-primary/5 font-bold text-primary"
                  : "border-gray-200 text-gray-600 hover:border-gray-300",
              )}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {(
          [
            {
              key: "bagagem",
              icon: "🧳",
              name: "Bagagem despachada",
              desc: "Incluir na cotação",
              value: bagagem,
              toggle: () => setBagagem((v) => !v),
            },
            {
              key: "assento",
              icon: "💺",
              name: "Seleção de assento",
              desc: "Preferência de lugar",
              value: assento,
              toggle: () => setAssento((v) => !v),
            },
            {
              key: "flex",
              icon: "📅",
              name: "Datas flexíveis",
              desc: "Aceito variação de ±3 dias",
              value: flexDatas,
              toggle: () => setFlexDatas((v) => !v),
            },
          ] as const
        ).map(({ key, icon, name, desc, value, toggle }) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-[12px] border border-gray-100 bg-gray-50 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-purple-50 text-sm">
                {icon}
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-900">{name}</p>
                <p className="text-[9px] text-gray-500">{desc}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggle}
              className={cn(
                "relative flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors",
                value ? "bg-primary" : "bg-gray-300",
              )}
            >
              <div
                className={cn(
                  "h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                  value ? "translate-x-4" : "translate-x-0",
                )}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Step 2 Outros: Categoria ──
  const renderStep2Outros = () => (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {OUTROS_CATEGORIAS.map(({ id, icon, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setOutrosCategoria(id)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-[12px] border-2 px-2 py-3 text-center transition-colors",
              outrosCategoria === id
                ? "border-primary bg-primary/5"
                : "border-gray-200 hover:border-gray-300",
            )}
          >
            <span className="text-xl">{icon}</span>
            <span
              className={cn(
                "text-[10px] font-bold leading-tight",
                outrosCategoria === id ? "text-primary" : "text-gray-700",
              )}
            >
              {label}
            </span>
          </button>
        ))}
      </div>

      {outrosCategoria === "voo" && (
        <div className="rounded-[12px] border border-purple-200 bg-purple-50 p-3">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-wide text-primary">
            ⚡ O voo é nacional ou internacional?
          </p>
          <div className="flex gap-2">
            {(["nacional", "internacional"] as const).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setOutrosEscopo(e)}
                className={cn(
                  "flex-1 rounded-[8px] border-2 py-1.5 text-[11px] font-bold transition-colors",
                  outrosEscopo === e
                    ? e === "internacional"
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-green-600 bg-green-600 text-white"
                    : "border-purple-300 text-purple-700 hover:border-purple-400",
                )}
              >
                {e === "nacional" ? "🇧🇷 Nacional" : "🌍 Internacional"}
              </button>
            ))}
          </div>
        </div>
      )}

      <GestorChip gestor={resolvedGestor} />
    </div>
  );

  // ── Step 3 Outros: Detalhe ──
  const renderStep3Outros = () => (
    <div className="flex flex-col gap-3">
      <GestorChip gestor={resolvedGestor} />

      <div>
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-primary">
          ✍ Sua mensagem
        </p>
        <Textarea
          placeholder="Descreva sua solicitação com o máximo de detalhes…"
          value={outrosDetalhes}
          onChange={(e) => setOutrosDetalhes(e.target.value)}
          maxLength={500}
          className="min-h-[100px] resize-none rounded-[12px] text-sm"
        />
        <p className="mt-1 text-right text-[9px] text-gray-400">{outrosDetalhes.length} / 500</p>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2">
        <span className="text-sm">💡</span>
        <p className="text-[10px] font-medium leading-relaxed text-green-800">
          Quanto mais detalhes você der, mais rápido seu gestor pode te ajudar.
        </p>
      </div>
    </div>
  );

  // ── Content router ──
  const renderContent = () => {
    if (step === 1) return renderStep1();
    if (step === 2 && tipo === "emissao") return renderStep2Emissao();
    if (step === 3 && tipo === "emissao") return renderStep3Emissao();
    if (step === 2 && tipo === "outros") return renderStep2Outros();
    if (step === 3 && tipo === "outros") return renderStep3Outros();
    return null;
  };

  const stepPillLabel = (() => {
    const label = stepLabels[step - 1];
    const isLast = step === 3;
    const icons: Record<string, string> = {
      Tipo: "✈",
      Rota: "📍",
      Extras: "⭐",
      Categoria: "🗂",
      Detalhe: "📝",
    };
    return `${icons[label] ?? ""} Etapa ${step} de 3${isLast ? " — quase lá!" : ""}`;
  })();

  const submitBtnClass =
    resolvedGestor?.perfil === "internacional"
      ? "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-600"
      : "bg-green-600 hover:bg-green-700 focus-visible:ring-green-600";

  return (
    <>
      <ProgressIndicator steps={stepLabels} current={step} />

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 [-webkit-overflow-scrolling:touch]">
        <div className="pb-2">
          <span className="mb-2.5 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
            {stepPillLabel}
          </span>
          {renderContent()}
        </div>
      </div>

      <div className="mt-3 flex shrink-0 gap-2 border-t border-nubank-border px-4 pt-3 pb-1">
        {step > 1 && (
          <Button type="button" variant="outline" onClick={handleBack} className="shrink-0 gap-1">
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </Button>
        )}
        {!isLastStep ? (
          <Button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance()}
            className="flex-1 gap-1"
          >
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={cn("flex-1 gap-1 text-white shadow-md", submitBtnClass)}
          >
            <Send className="h-4 w-4" />
            {submitting ? "Enviando…" : "Enviar Solicitação"}
          </Button>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verificar que o arquivo foi criado corretamente**

```bash
# Verificar que o arquivo existe e tem mais de 400 linhas
wc -l src/components/SolicitarCotacaoWizard.tsx
```

Expected: número > 400

- [ ] **Step 3: Commit**

```bash
git add src/components/SolicitarCotacaoWizard.tsx
git commit -m "feat: add SolicitarCotacaoWizard multi-step component"
```

---

### Task 2: Atualizar Index.tsx para usar o wizard

**Files:**
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Adicionar import do wizard no topo do arquivo**

Em `src/pages/Index.tsx`, localizar o bloco de imports de componentes (próximo de `ProgramSelectionSheet`) e adicionar:

```tsx
import { SolicitarCotacaoWizard, type WizardSubmitParams } from "@/components/SolicitarCotacaoWizard";
```

- [ ] **Step 2: Remover estados antigos do wizard (linhas ~543–557)**

Remover estas linhas do bloco de `useState`:

```tsx
const [demandType, setDemandType] = useState<"emissao" | "outros">("emissao");
const [demandaOrigem, setDemandaOrigem] = useState("");
const [demandaDestino, setDemandaDestino] = useState("");
const [demandaDataIda, setDemandaDataIda] = useState("");
const [demandaDataVolta, setDemandaDataVolta] = useState("");
const [demandaPassageiros, setDemandaPassageiros] = useState(1);
const [demandaClasse, setDemandaClasse] = useState("");
const [demandaBagagemDescricao, setDemandaBagagemDescricao] = useState("");
const [demandaAssentoDescricao, setDemandaAssentoDescricao] = useState("");
const [demandaFlexDatas, setDemandaFlexDatas] = useState<"sim" | "nao">("nao");
const [demandaOutrosDetalhes, setDemandaOutrosDetalhes] = useState("");
const [demandaEscopo, setDemandaEscopo] = useState<"nacional" | "internacional">("nacional");
const [demandaGestorId, setDemandaGestorId] = useState("");
```

Manter apenas:
```tsx
const [demandSubmitting, setDemandSubmitting] = useState(false);
const [demandaGestores, setDemandaGestores] = useState<DemandGestorOption[]>([]);
```

- [ ] **Step 3: Remover computed values obsoletos**

Remover estas linhas (estão em torno de linhas 1108–1129):

```tsx
const demandaDiasViagem = useMemo(() => { ... }, [demandaDataIda, demandaDataVolta]);
const gestoresNacionais = useMemo(() => demandaGestores.filter(...), [demandaGestores]);
const gestoresInternacionais = useMemo(() => demandaGestores.filter(...), [demandaGestores]);
const gestoresDisponiveisEmissao = useMemo(() => ..., [demandaEscopo, gestoresNacionais, gestoresInternacionais]);
```

- [ ] **Step 4: Remover o useEffect de auto-seleção de gestor (linhas ~1189–1203)**

Remover o `useEffect` inteiro que começa com:
```tsx
useEffect(() => {
  if (!isDemandDialogOpen) return;
  if (demandType === "outros") {
    setDemandaGestorId(gestoresNacionais[0]?.id ?? "");
    return;
  }
  ...
}, [isDemandDialogOpen, demandType, demandaEscopo, gestoresNacionais, gestoresDisponiveisEmissao]);
```

- [ ] **Step 5: Substituir handleSubmitDemand pela nova versão que aceita WizardSubmitParams**

Substituir a função `handleSubmitDemand` inteira (linhas ~1008–1098) por:

```tsx
const handleSubmitDemand = async (params: WizardSubmitParams) => {
  if (!user?.id || !demandTargetClientId) {
    toast.error("Faça login para solicitar uma demanda.");
    return;
  }
  if (!params.gestorId) {
    toast.error("Não foi possível identificar o gestor para esta demanda.");
    return;
  }

  setDemandSubmitting(true);
  try {
    const payload =
      params.tipo === "emissao"
        ? {
            origem: params.origem,
            destino: params.destino,
            dataIda: params.dataIda || null,
            dataVolta: params.dataVolta || null,
            diasViagem: (() => {
              if (!params.dataIda || !params.dataVolta) return null;
              const [ai, mi, di] = params.dataIda.split("-").map(Number);
              const [av, mv, dv] = params.dataVolta.split("-").map(Number);
              const ms = Date.UTC(av, mv - 1, dv) - Date.UTC(ai, mi - 1, di);
              return isNaN(ms) || ms < 0 ? null : Math.round(ms / 86400000);
            })(),
            passageiros: params.passageiros,
            classeVoo: params.classeVoo,
            bagagemDespachadaDescricao: params.bagagemDescricao,
            selecaoAssentoDescricao: params.assentoDescricao,
            flexibilidadeDatas: params.flexDatas,
            escopo: params.escopo,
            targetGestorId: params.gestorId,
          }
        : {
            categoria: params.categoria,
            escopoVoo: params.escopoVoo,
            detalhes: params.detalhes,
            escopo: params.escopo,
            targetGestorId: params.gestorId,
          };

    const { error } = await supabase.from("demandas_cliente").insert({
      cliente_id: demandTargetClientId,
      tipo: params.tipo,
      status: "pendente",
      payload,
    });
    if (error) throw error;

    toast.success("Demanda enviada para o gestor com sucesso.");
    setIsDemandDialogOpen(false);
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : "Erro ao enviar demanda.";
    const msg = /row-level security|permission denied|new row violates/i.test(rawMsg)
      ? "Sem permissão para abrir demanda para este cliente. Verifique o vínculo do gestor e as policies de RLS."
      : rawMsg;
    toast.error(msg);
  } finally {
    setDemandSubmitting(false);
  }
};
```

- [ ] **Step 6: Substituir o Dialog antigo pelo novo com SolicitarCotacaoWizard**

Localizar o bloco Dialog que começa em `<Dialog open={isDemandDialogOpen}` (em torno da linha 2845) e substituir TODO o bloco (até o `</Dialog>` correspondente) por:

```tsx
<Dialog open={isDemandDialogOpen} onOpenChange={setIsDemandDialogOpen}>
  <DialogContent className="flex max-h-[85dvh] w-[calc(100vw-1.5rem)] max-w-md flex-col gap-0 overflow-hidden p-4 pt-10 sm:p-5 sm:pt-11">
    <DialogHeader className="shrink-0 space-y-0.5 pr-6 text-left">
      <DialogTitle>Solicitar Cotação</DialogTitle>
      <DialogDescription className="sr-only">
        Formulário para solicitar cotação ou emissão de passagem ao seu gestor.
      </DialogDescription>
    </DialogHeader>
    <SolicitarCotacaoWizard
      gestores={demandaGestores}
      submitting={demandSubmitting}
      onSubmit={handleSubmitDemand}
    />
  </DialogContent>
</Dialog>
```

- [ ] **Step 7: Remover imports não mais usados**

Verificar se `Textarea` ainda é usado em outro lugar em Index.tsx:
```bash
grep -n "Textarea\|demandType\|demandaOrigem\|demandaDestino\|demandaDataIda\|demandaDataVolta\|demandaPassageiros\|demandaClasse\|demandaBagagem\|demandaAssento\|demandaFlexDatas\|demandaOutros\|demandaEscopo\|demandaGestorId\|gestoresNacionais\|gestoresInternacionais\|gestoresDisponiveisEmissao\|demandaDiasViagem" src/pages/Index.tsx
```

Remover apenas imports que não tenham mais nenhuma referência.

- [ ] **Step 8: Verificar que o TypeScript compila sem erros**

```bash
npx tsc --noEmit
```

Expected: sem erros relacionados ao wizard ou Index.tsx.

- [ ] **Step 9: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat: replace demand modal with SolicitarCotacaoWizard in Index.tsx"
```

---

### Task 3: Verificação visual no browser

- [ ] **Step 1: Iniciar servidor de desenvolvimento**

```bash
npm run dev
```

- [ ] **Step 2: Testar fluxo Emissão**

1. Abrir o app no browser
2. Clicar em "Solicitar Cotação"
3. Verificar que o wizard abre na Etapa 1
4. Selecionar "Emissão de passagem" → verificar toggle de escopo e chip de gestor
5. Clicar "Próximo" → verificar Etapa 2 (Rota) com campos de origem, destino, datas
6. Preencher origem e destino → clicar "Próximo"
7. Verificar Etapa 3 (Extras) com contador de passageiros, grade de classes e toggles
8. Clicar "Enviar Solicitação" → verificar toast de sucesso e dialog fechando

- [ ] **Step 3: Testar fluxo Outros — categoria não-voo**

1. Abrir o wizard
2. Selecionar "Outra solicitação" → verificar mensagem de gestor na próxima etapa
3. Avançar → selecionar "Hotel" → verificar que chip de Gestor Nacional aparece (sem toggle de escopo)
4. Avançar → preencher descrição → enviar

- [ ] **Step 4: Testar fluxo Outros — Upgrade de voo internacional**

1. Abrir o wizard
2. Selecionar "Outra solicitação" → avançar
3. Selecionar "Upgrade / Alteração de voo" → verificar toggle Nacional/Internacional
4. Selecionar "Internacional" → verificar chip de Gestor Internacional (azul)
5. Avançar → preencher descrição → enviar

- [ ] **Step 5: Commit final se tudo ok**

```bash
git add -A
git commit -m "feat: solicitar cotação wizard — multi-step redesign complete"
```
