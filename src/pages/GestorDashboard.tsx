import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Shield, Moon, Sun } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useGestor } from "@/hooks/useGestor";
import { useGestorLogs } from "@/hooks/useGestorLogs";
import GestorKpis from "@/components/gestor/GestorKpis";
import GestorClientsTable from "@/components/gestor/GestorClientsTable";
import GestorAlertas from "@/components/gestor/GestorAlertas";
import GestorRentabilidade from "@/components/gestor/GestorRentabilidade";
import GestorDre from "@/components/gestor/GestorDre";
import GestorComparativo from "@/components/gestor/GestorComparativo";
import GestorHistorico from "@/components/gestor/GestorHistorico";
import GestorExport from "@/components/gestor/GestorExport";
import { logAcao } from "@/lib/audit";
import type { RiscoCarteira } from "@/hooks/useGestor";
import { cn } from "@/lib/utils";

const DARK_STORAGE_KEY = "mile-manager:theme";

const GestorDashboard = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("clientes");
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DARK_STORAGE_KEY);
    const prefer =
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", prefer);
    setDarkMode(prefer);
  }, []);

  const toggleDark = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    setDarkMode(isDark);
    window.localStorage.setItem(DARK_STORAGE_KEY, isDark ? "dark" : "light");
  };
  const {
    loading,
    error,
    resumoClientes,
    kpis,
    vencimentosTodosClientes,
    dreConsolidado,
  } = useGestor();
  const { logs, loading: logsLoading } = useGestorLogs();

  const handleOpenClient = async (clientId: string) => {
    await logAcao({
      tipoAcao: "gestor_visualizou_cliente",
      entidadeAfetada: "cliente",
      entidadeId: clientId,
      details: { origem: "painel_gestor" },
    });
    navigate(`/?clientId=${encodeURIComponent(clientId)}`);
  };

  const vencimentosOrdenados = useMemo(
    () => [...vencimentosTodosClientes].slice(0, 100),
    [vencimentosTodosClientes],
  );

  const riscoGlobal = useMemo((): RiscoCarteira => {
    if (resumoClientes.length === 0) return "baixo";
    const alto = resumoClientes.some((c) => c.riscoCarteira === "alto");
    const medio = resumoClientes.some((c) => c.riscoCarteira === "medio");
    const totalMilhas = resumoClientes.reduce((a, c) => a + c.milhas, 0);
    const totalVencendo = resumoClientes.reduce((a, c) => a + c.pontosVencendo90d, 0);
    const pctVencendo = totalMilhas > 0 ? totalVencendo / totalMilhas : 0;
    if (alto || pctVencendo > 0.15) return "alto";
    if (medio || pctVencendo > 0.05) return "medio";
    return "baixo";
  }, [resumoClientes]);

  const alertasCount = useMemo(() => {
    let n = 0;
    resumoClientes.forEach((c) => {
      if (c.pontosVencendo90d > 0) n++;
      if (c.roiMedio < 0) n++;
      if (c.concentracaoMaxima > 60) n++;
    });
    return n;
  }, [resumoClientes]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-background text-sm text-muted-foreground">
        Carregando painel do gestor...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-background text-sm text-destructive">
        Falha ao carregar dados do gestor.
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-background p-4 pb-24">
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Centro estratégico de operação
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Ferramenta de priorização de clientes · Inteligência financeira B2B
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
              riscoGlobal === "baixo" &&
                "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
              riscoGlobal === "medio" &&
                "bg-amber-500/15 text-amber-700 dark:text-amber-400",
              riscoGlobal === "alto" && "bg-red-500/15 text-red-700 dark:text-red-400",
            )}
          >
            <Shield className="h-3.5 w-3.5" />
            Risco:{" "}
            {riscoGlobal === "baixo" ? "Baixo" : riscoGlobal === "medio" ? "Médio" : "Alto"}
          </span>
          <button
            type="button"
            onClick={toggleDark}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={darkMode ? "Modo claro" : "Modo escuro"}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <section className="mb-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          KPIs consolidados
        </p>
        <GestorKpis kpis={kpis} />
      </section>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="mt-4 space-y-3"
      >
        <TabsList className="flex w-full overflow-x-auto rounded-xl border border-border/80 bg-muted/30 p-1 scrollbar-hide">
          <TabsTrigger value="clientes" className="flex-1 min-w-0 rounded-lg text-xs">
            Clientes
          </TabsTrigger>
          <TabsTrigger value="vencendo" className="flex-1 min-w-0 rounded-lg text-xs">
            Vencendo
          </TabsTrigger>
          <TabsTrigger value="alertas" className="flex-1 min-w-0 rounded-lg text-xs">
            Alertas
          </TabsTrigger>
          <TabsTrigger value="rentabilidade" className="flex-1 min-w-0 rounded-lg text-xs">
            Rentab.
          </TabsTrigger>
          <TabsTrigger value="dre" className="flex-1 min-w-0 rounded-lg text-xs">
            DRE
          </TabsTrigger>
          <TabsTrigger value="comparativo" className="flex-1 min-w-0 rounded-lg text-xs">
            Comparar
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex-1 min-w-0 rounded-lg text-xs">
            Histórico
          </TabsTrigger>
          <TabsTrigger value="exportar" className="flex-1 min-w-0 rounded-lg text-xs">
            Exportar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clientes" className="mt-3">
          <GestorClientsTable clients={resumoClientes} onOpenClient={handleOpenClient} />
        </TabsContent>

        <TabsContent value="vencendo" className="mt-3 space-y-3">
          <Card className="rounded-xl border-border/80">
            <CardContent className="p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Próximos vencimentos (todos os clientes)
              </p>
              {vencimentosOrdenados.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum vencimento nos próximos 90 dias na carteira.
                </p>
              ) : (
                <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
                  {vencimentosOrdenados.map((item, idx) => (
                    <button
                      key={`${item.clienteId}-${item.programId}-${item.data}-${idx}`}
                      type="button"
                      onClick={() => handleOpenClient(item.clienteId)}
                      className="flex w-full flex-col gap-0.5 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{item.clienteNome}</span>
                        <span
                          className={
                            item.diasRestantes <= 30
                              ? "font-semibold text-red-600 dark:text-red-400"
                              : item.diasRestantes <= 60
                                ? "font-semibold text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                          }
                        >
                          {item.diasRestantes} dias
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{item.programName}</span>
                        <span>
                          {item.quantidade.toLocaleString("pt-BR")} pts · {item.data}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alertas" className="mt-3">
          <GestorAlertas clients={resumoClientes} onOpenClient={handleOpenClient} />
        </TabsContent>

        <TabsContent value="rentabilidade" className="mt-3">
          <GestorRentabilidade clients={resumoClientes} />
        </TabsContent>

        <TabsContent value="dre" className="mt-3">
          <GestorDre dre={dreConsolidado} />
        </TabsContent>

        <TabsContent value="comparativo" className="mt-3">
          <GestorComparativo clients={resumoClientes} />
        </TabsContent>

        <TabsContent value="historico" className="mt-3">
          <GestorHistorico logs={logs} loading={logsLoading} />
        </TabsContent>

        <TabsContent value="exportar" className="mt-3">
          <GestorExport
            clients={resumoClientes}
            vencimentos={vencimentosOrdenados}
            alertasCount={alertasCount}
            kpis={{
              totalClientesAtivos: kpis.totalClientesAtivos,
              valorEstrategicoTotal: kpis.valorEstrategicoTotal,
              economiaTotalGestao: kpis.economiaTotalGestao,
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GestorDashboard;
