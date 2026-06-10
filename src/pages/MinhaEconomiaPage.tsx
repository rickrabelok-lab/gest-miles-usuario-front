// Minha Economia: o cliente de gestão acompanha a própria timeline de economia
// e baixa o relatório (print → PDF). Dados da RPC get_relatorio_economia
// (guard server-side: cliente lê só o próprio, internos filtrados).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileDown } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useMinhaEconomia } from "@/hooks/useMinhaEconomia";
import { MinhaEconomiaRelatorio } from "@/components/minha-economia/MinhaEconomiaRelatorio";
import { cn } from "@/lib/utils";
import "@/styles/relatorio-print.css";

type Periodo = "3m" | "6m" | "12m" | "all";

const PERIODOS: Array<{ id: Periodo; label: string }> = [
  { id: "3m", label: "3 meses" },
  { id: "6m", label: "6 meses" },
  { id: "12m", label: "12 meses" },
  { id: "all", label: "Tudo" },
];

const PERIODO_LABEL: Record<Periodo, string> = {
  "3m": "últimos 3 meses",
  "6m": "últimos 6 meses",
  "12m": "últimos 12 meses",
  all: "período completo",
};

const inicioDoPeriodo = (p: Periodo): string | null => {
  if (p === "all") return null;
  const meses = { "3m": 3, "6m": 6, "12m": 12 }[p];
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
};

interface MinhaEconomiaPageProps {
  /** Hook injetável p/ testes (padrão do repo). */
  useHook?: typeof useMinhaEconomia;
}

export default function MinhaEconomiaPage({ useHook = useMinhaEconomia }: MinhaEconomiaPageProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, fetchRelatorio } = useHook();
  const [periodo, setPeriodo] = useState<Periodo>("12m");

  useEffect(() => {
    if (!user?.id) return;
    void fetchRelatorio(user.id, inicioDoPeriodo(periodo), null);
  }, [user?.id, periodo, fetchRelatorio]);

  return (
    <div className="min-h-screen bg-[#f6f3fa] pb-10">
      {/* Header — some na impressão */}
      <div className="print-hidden sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-700"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Minha Economia
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full bg-[#8A05BE] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#7a04a8]"
            onClick={() => window.print()}
          >
            <FileDown className="h-3.5 w-3.5" aria-hidden /> Baixar relatório
          </button>
        </div>
        {/* Chips de período */}
        <div className="mx-auto flex max-w-md gap-1.5 overflow-x-auto px-4 pb-3">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                periodo === p.id
                  ? "bg-[#8A05BE] text-white"
                  : "bg-white text-gray-600 shadow-nubank hover:bg-gray-50",
              )}
              onClick={() => setPeriodo(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-md px-4 pt-4">
        {loading && (
          <p className="py-16 text-center text-sm text-gray-500" aria-live="polite">
            Calculando sua economia…
          </p>
        )}
        {!loading && error && (
          <p className="py-16 text-center text-sm text-red-600" role="alert">{error}</p>
        )}
        {!loading && !error && data && (
          <div id="minha-economia-print">
            <MinhaEconomiaRelatorio periodoLabel={PERIODO_LABEL[periodo]} data={data} />
          </div>
        )}
      </div>
    </div>
  );
}
