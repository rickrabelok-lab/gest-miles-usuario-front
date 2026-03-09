import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, AlertCircle } from "lucide-react";
import type { GestorClienteResumo } from "@/hooks/useGestor";
import type { GestorVencimentoItem } from "@/hooks/useGestor";
import type { LogAcaoRow } from "@/hooks/useGestorLogs";

type Props = {
  clients: GestorClienteResumo[];
  vencimentos: GestorVencimentoItem[];
  alertasCount: number;
  kpis: {
    totalClientesAtivos: number;
    valorEstrategicoTotal: number;
    economiaTotalGestao: number;
  };
};

const GestorExport = ({ clients, vencimentos, alertasCount, kpis }: Props) => {
  const printRef = useRef<HTMLDivElement>(null);

  const exportConsolidado = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Relatório consolidado - Mile Manager</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 24px; color: #1e293b; }
            h1 { font-size: 1.5rem; margin-bottom: 8px; }
            .meta { color: #64748b; font-size: 0.875rem; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
            th, td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
            th { background: #f1f5f9; font-weight: 600; }
            .number { text-align: right; }
          </style>
        </head>
        <body>
          <h1>Relatório consolidado</h1>
          <p class="meta">Gerado em ${new Date().toLocaleString("pt-BR")}</p>
          <p><strong>Clientes ativos:</strong> ${kpis.totalClientesAtivos}</p>
          <p><strong>Valor estratégico total:</strong> ${kpis.valorEstrategicoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</p>
          <p><strong>Economia total gerada:</strong> ${kpis.economiaTotalGestao.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</p>
          <h2 style="margin-top: 24px;">Clientes</h2>
          <table>
            <thead><tr><th>Cliente</th><th class="number">Milhas</th><th class="number">Valor est.</th><th class="number">Economia</th><th class="number">Score</th></tr></thead>
            <tbody>
              ${clients
                .map(
                  (c) =>
                    `<tr><td>${c.nome}</td><td class="number">${c.milhas.toLocaleString("pt-BR")}</td><td class="number">${c.valorEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</td><td class="number">${c.economiaTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</td><td class="number">${c.scoreEstrategico}</td></tr>`,
                )
                .join("")}
            </tbody>
          </table>
          <h2 style="margin-top: 24px;">Próximos vencimentos (até 100)</h2>
          <table>
            <thead><tr><th>Cliente</th><th>Programa</th><th class="number">Qtd</th><th>Data</th><th class="number">Dias</th></tr></thead>
            <tbody>
              ${vencimentos
                .slice(0, 100)
                .map(
                  (v) =>
                    `<tr><td>${v.clienteNome}</td><td>${v.programName}</td><td class="number">${v.quantidade.toLocaleString("pt-BR")}</td><td>${v.data}</td><td class="number">${v.diasRestantes}</td></tr>`,
                )
                .join("")}
            </tbody>
          </table>
          <p style="margin-top: 24px; color: #64748b;"><strong>Alertas pendentes:</strong> ${alertasCount}</p>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
    win.close();
  };

  const exportCsvRanking = () => {
    const headers = ["Cliente", "Milhas", "Valor estimado", "Economia total", "ROI médio", "Score", "Venc. 90d"];
    const rows = clients.map((c) => [
      c.nome,
      c.milhas,
      c.valorEstimado.toFixed(0),
      c.economiaTotal.toFixed(0),
      c.roiMedio.toFixed(0),
      c.scoreEstrategico,
      c.pontosVencendo90d,
    ]);
    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ranking-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">
        Exportação profissional
      </p>
      <Card className="rounded-xl border-border/80">
        <CardContent className="p-3 space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={exportConsolidado}
          >
            <FileText className="h-4 w-4" />
            Relatório consolidado (imprimir / PDF)
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={exportCsvRanking}
          >
            <Download className="h-4 w-4" />
            Ranking de clientes (CSV)
          </Button>
          <p className="text-[11px] text-muted-foreground pt-1">
            Use &quot;Imprimir&quot; no navegador e escolha &quot;Salvar como PDF&quot; para gerar PDF.
          </p>
        </CardContent>
      </Card>
      <div ref={printRef} className="hidden" aria-hidden />
    </div>
  );
};

export default GestorExport;
