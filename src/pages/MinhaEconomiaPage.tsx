// Minha Economia: o cliente de gestão acompanha a própria timeline de economia
// e baixa o relatório (print → PDF). Dados da RPC get_relatorio_economia
// (guard server-side: cliente lê só o próprio, internos filtrados).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileDown } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useMinhaEconomia } from "@/hooks/useMinhaEconomia";
import { MinhaEconomiaRelatorio } from "@/components/minha-economia/MinhaEconomiaRelatorio";
import { cn } from "@/lib/utils";
import { isNativePlatform } from "@/lib/nativeAuth";
import { deliverPdf, renderElementToA4Pdf } from "@/lib/pdfDelivery";
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
  const printRef = useRef<HTMLDivElement | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void fetchRelatorio(user.id, inicioDoPeriodo(periodo), null);
  }, [user?.id, periodo, fetchRelatorio]);

  const handleBaixarRelatorio = async () => {
    if (!isNativePlatform()) {
      window.print();
      return;
    }
    if (!printRef.current) return;
    setGerandoPdf(true);
    try {
      const pdf = await renderElementToA4Pdf(printRef.current);
      const dataArquivo = new Date().toISOString().slice(0, 10);
      await deliverPdf(pdf, `minha-economia-${periodo}-${dataArquivo}.pdf`);
    } catch (err) {
      console.warn("[MinhaEconomia] PDF:", err);
      toast.error("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setGerandoPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-nubank-bg pb-10 pt-[var(--gm-safe-top)]">
      {/* Header — some na impressão */}
      <div className="print-hidden mx-auto max-w-md">
        <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Voltar"
              className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-nubank-border bg-white text-nubank-text transition-colors hover:bg-nubank-bg"
            >
              <ArrowLeft size={19} strokeWidth={2} />
            </button>
            <h1 className="font-display text-xl font-bold tracking-tight text-nubank-text">
              Minha economia
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void handleBaixarRelatorio()}
            disabled={gerandoPdf}
            aria-busy={gerandoPdf}
            aria-label="Baixar relatório em PDF"
            title="Baixar relatório em PDF"
            className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-nubank-tint text-nubank-dark transition-colors hover:bg-primary/15"
          >
            <FileDown size={19} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        {/* Chips de período */}
        <div className="flex gap-2 overflow-x-auto px-5 pb-1 pt-3 scrollbar-hide">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "shrink-0 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
                periodo === p.id
                  ? "bg-nubank-text text-white"
                  : "border border-nubank-border bg-white text-[#54535A] hover:bg-nubank-bg",
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
          <p className="py-16 text-center text-sm text-nubank-text-secondary" aria-live="polite">
            Calculando sua economia…
          </p>
        )}
        {!loading && error && (
          <p className="py-16 text-center text-sm text-destructive" role="alert">{error}</p>
        )}
        {!loading && !error && data && (
          <div id="minha-economia-print" ref={printRef}>
            <MinhaEconomiaRelatorio periodoLabel={PERIODO_LABEL[periodo]} data={data} />
          </div>
        )}
      </div>
    </div>
  );
}
