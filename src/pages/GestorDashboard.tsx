import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clock, Shield, Moon, Sun } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const DARK_STORAGE_KEY = "mile-manager:theme";
const GESTOR_TABS = [
  "clientes",
  "vencendo",
  "alertas",
  "demandas",
  "rentabilidade",
  "dre",
  "comparativo",
  "historico",
  "exportar",
] as const;

type GestorTab = (typeof GESTOR_TABS)[number];
type DemandFilter = "todos" | "pendente" | "em_andamento" | "concluida";

const GestorDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedStatus = searchParams.get("status");
  const initialTab: GestorTab = GESTOR_TABS.includes(requestedTab as GestorTab)
    ? (requestedTab as GestorTab)
    : "clientes";
  const [activeTab, setActiveTab] = useState<GestorTab>(initialTab);
  const [darkMode, setDarkMode] = useState(false);
  const [updatingDemandId, setUpdatingDemandId] = useState<number | null>(null);
  const initialDemandFilter: DemandFilter =
    requestedStatus === "pendente" ||
    requestedStatus === "em_andamento" ||
    requestedStatus === "concluida"
      ? requestedStatus
      : "todos";
  const [demandStatusFilter, setDemandStatusFilter] = useState<DemandFilter>(initialDemandFilter);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(DARK_STORAGE_KEY);
    const prefer = stored === "dark";
    setDarkMode(prefer);
  }, []);

  const toggleDark = () => {
    const isDark = !darkMode;
    setDarkMode(isDark);
    window.localStorage.setItem(DARK_STORAGE_KEY, isDark ? "dark" : "light");
  };
  const {
    loading,
    error,
    resumoClientes,
    kpis,
    vencimentosTodosClientes,
    demandasGestor,
    dreConsolidado,
  } = useGestor();
  const { logs, loading: logsLoading } = useGestorLogs();
  const [demandasLocal, setDemandasLocal] = useState(demandasGestor);

  useEffect(() => {
    setDemandasLocal(demandasGestor);
  }, [demandasGestor]);

  useEffect(() => {
    if (requestedTab && GESTOR_TABS.includes(requestedTab as GestorTab)) {
      setActiveTab(requestedTab as GestorTab);
    }
  }, [requestedTab]);

  useEffect(() => {
    if (requestedStatus === "pendente" || requestedStatus === "em_andamento" || requestedStatus === "concluida") {
      setDemandStatusFilter(requestedStatus);
      return;
    }
    setDemandStatusFilter("todos");
  }, [requestedStatus]);

  const demandasFiltradas = useMemo(() => {
    if (demandStatusFilter === "todos") return demandasLocal;
    return demandasLocal.filter((d) => d.status === demandStatusFilter);
  }, [demandasLocal, demandStatusFilter]);

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
    const clientesComVencimento90d = new Set(
      vencimentosTodosClientes
        .filter((item) => item.quantidade > 0 && item.diasRestantes >= 0 && item.diasRestantes <= 90)
        .map((item) => item.clienteId),
    );
    if (clientesComVencimento90d.size > 0) return "alto";

    const clientesComVencimento150d = new Set(
      vencimentosTodosClientes
        .filter((item) => item.quantidade > 0 && item.diasRestantes >= 0 && item.diasRestantes <= 150)
        .map((item) => item.clienteId),
    );
    if (clientesComVencimento150d.size > 0) return "medio";

    return "baixo";
  }, [vencimentosTodosClientes]);

  const alertasCount = useMemo(() => {
    let n = 0;
    resumoClientes.forEach((c) => {
      if (c.pontosVencendo90d > 0) n++;
      if (c.roiMedio < 0) n++;
      if (c.concentracaoMaxima > 60) n++;
    });
    return n;
  }, [resumoClientes]);

  const handleUpdateDemandStatus = async (
    demandId: number,
    nextStatus: "pendente" | "em_andamento" | "concluida",
  ) => {
    setUpdatingDemandId(demandId);
    try {
      const { error: updateError } = await supabase
        .from("demandas_cliente")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", demandId);
      if (updateError) throw updateError;

      setDemandasLocal((prev) =>
        prev.map((d) => (d.id === demandId ? { ...d, status: nextStatus } : d)),
      );
      toast.success("Status da demanda atualizado.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o status.",
      );
    } finally {
      setUpdatingDemandId(null);
    }
  };

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
    <div className={cn(darkMode && "dark")}>
      <div className="mx-auto min-h-screen w-full max-w-md bg-slate-50/80 p-4 pb-24 dark:bg-background">
      <header className="mb-4 rounded-2xl border border-sky-100/70 bg-gradient-to-br from-white via-sky-50/50 to-cyan-50/40 p-4 shadow-[0_6px_18px_rgba(2,132,199,0.06)] dark:border-border dark:bg-card dark:shadow-none">
        <div className="mb-2 flex items-center justify-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-7 border-sky-200/70 bg-white/90 p-0 text-sky-700 hover:bg-sky-50 dark:border-border dark:bg-transparent dark:text-foreground"
            onClick={() => navigate("/")}
            aria-label="Voltar ao dashboard"
            title="Voltar ao dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Centro estratégico de operação
        </h1>
        <p className="mt-1 text-xs text-slate-600 dark:text-muted-foreground">
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
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-700 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
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
        <GestorKpis
          kpis={kpis}
          onOpenExpiringClients={() => {
            setActiveTab("vencendo");
          }}
        />
      </section>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as GestorTab)}
        className="mt-4 space-y-3"
      >
        <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList className="inline-flex h-auto w-max flex-nowrap gap-1 rounded-xl border border-slate-200/80 bg-white/85 p-1 shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-border dark:bg-muted/30 dark:shadow-none">
          <TabsTrigger value="demandas" className="shrink-0 rounded-lg px-2.5 text-xs">
            Demandas
          </TabsTrigger>
          <TabsTrigger value="clientes" className="shrink-0 rounded-lg px-2.5 text-xs">
            Clientes
          </TabsTrigger>
          <TabsTrigger value="vencendo" className="shrink-0 rounded-lg px-2.5 text-xs">
            Vencendo
          </TabsTrigger>
          <TabsTrigger value="alertas" className="shrink-0 rounded-lg px-2.5 text-xs">
            Alertas
          </TabsTrigger>
          <TabsTrigger value="rentabilidade" className="shrink-0 rounded-lg px-2.5 text-xs">
            Rentab.
          </TabsTrigger>
          <TabsTrigger value="dre" className="shrink-0 rounded-lg px-2.5 text-xs">
            DRE
          </TabsTrigger>
          <TabsTrigger value="comparativo" className="shrink-0 rounded-lg px-2.5 text-xs">
            Comparar
          </TabsTrigger>
          <TabsTrigger value="historico" className="shrink-0 rounded-lg px-2.5 text-xs">
            Histórico
          </TabsTrigger>
          <TabsTrigger value="exportar" className="shrink-0 rounded-lg px-2.5 text-xs">
            Exportar
          </TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="clientes" className="mt-3">
          <GestorClientsTable clients={resumoClientes} onOpenClient={handleOpenClient} />
        </TabsContent>

        <TabsContent value="vencendo" className="mt-3 space-y-3">
          <Card className="rounded-xl border-slate-200/80 bg-white/90 shadow-[0_4px_12px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card dark:shadow-none">
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
                      className="flex w-full flex-col gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-left transition-colors hover:bg-sky-50/70 dark:border-border/80 dark:bg-muted/30 dark:hover:bg-muted/60"
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

        <TabsContent value="demandas" className="mt-3">
          <Card className="rounded-xl border-slate-200/80 bg-white/90 shadow-[0_4px_12px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card dark:shadow-none">
            <CardContent className="p-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                Demandas solicitadas pelos clientes
              </p>
              <div className="mb-2 flex items-center gap-1 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setDemandStatusFilter("todos")}
                  className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                    demandStatusFilter === "todos"
                      ? "bg-primary text-primary-foreground"
                      : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setDemandStatusFilter("pendente")}
                  className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                    demandStatusFilter === "pendente"
                      ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                      : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                  }`}
                >
                  Pendentes
                </button>
                <button
                  type="button"
                  onClick={() => setDemandStatusFilter("em_andamento")}
                  className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                    demandStatusFilter === "em_andamento"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                  }`}
                >
                  Em andamento
                </button>
                <button
                  type="button"
                  onClick={() => setDemandStatusFilter("concluida")}
                  className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                    demandStatusFilter === "concluida"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                  }`}
                >
                  Concluídas
                </button>
              </div>
              {demandasFiltradas.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma demanda neste filtro.
                </p>
              ) : (
                <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
                  {demandasFiltradas.map((d) => {
                    const origem = String(d.payload.origem ?? "-");
                    const destino = String(d.payload.destino ?? "-");
                    const passageiros = Number(d.payload.passageiros ?? 0);
                    const dataIda = String(d.payload.dataIda ?? "");
                    const dataVolta = String(d.payload.dataVolta ?? "");
                    const diasViagemRaw = d.payload.diasViagem;
                    const diasViagem =
                      typeof diasViagemRaw === "number" && Number.isFinite(diasViagemRaw)
                        ? diasViagemRaw
                        : null;
                    const detalhes = String(d.payload.detalhes ?? "");
                    const statusLabel =
                      d.status === "concluida"
                        ? "Concluída"
                        : d.status === "em_andamento"
                          ? "Em andamento"
                          : "Pendente";
                    return (
                      <button
                        key={`demanda-${d.id}`}
                        type="button"
                        onClick={() => handleOpenClient(d.clienteId)}
                        className="flex w-full flex-col rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-left transition-colors hover:bg-sky-50/70 dark:border-border/70 dark:bg-muted/20 dark:hover:bg-muted/50"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold">{d.clienteNome}</span>
                          <span className="text-muted-foreground">
                            {new Date(d.createdAt).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Tipo: {d.tipo === "emissao" ? "Emissão" : "Outros"} · Status:{" "}
                          <span
                            className={
                              d.status === "concluida"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : d.status === "em_andamento"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-slate-500"
                            }
                          >
                            {statusLabel}
                          </span>
                        </p>
                        {d.tipo === "emissao" ? (
                          <>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {origem} → {destino} · {passageiros} passageiro(s)
                            </p>
                            {(dataIda || dataVolta || diasViagem !== null) && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {dataIda && dataVolta
                                  ? `${new Date(`${dataIda}T00:00:00`).toLocaleDateString("pt-BR")} - ${new Date(`${dataVolta}T00:00:00`).toLocaleDateString("pt-BR")}`
                                  : dataIda
                                    ? `Ida: ${new Date(`${dataIda}T00:00:00`).toLocaleDateString("pt-BR")}`
                                    : `Volta: ${new Date(`${dataVolta}T00:00:00`).toLocaleDateString("pt-BR")}`}
                                {diasViagem !== null
                                  ? ` · ${diasViagem} ${diasViagem === 1 ? "dia" : "dias"}`
                                  : ""}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {detalhes || "Sem detalhes"}
                          </p>
                        )}
                        <div
                          className="mt-2 flex items-center gap-1"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                              d.status === "pendente"
                                ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                                : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                            }`}
                            disabled={updatingDemandId === d.id}
                            onClick={() =>
                              void handleUpdateDemandStatus(d.id, "pendente")
                            }
                          >
                            Pendente
                          </button>
                          <button
                            type="button"
                            className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                              d.status === "em_andamento"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                            }`}
                            disabled={updatingDemandId === d.id}
                            onClick={() =>
                              void handleUpdateDemandStatus(d.id, "em_andamento")
                            }
                          >
                            Em andamento
                          </button>
                          <button
                            type="button"
                            className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                              d.status === "concluida"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-600 dark:bg-muted dark:text-muted-foreground"
                            }`}
                            disabled={updatingDemandId === d.id}
                            onClick={() =>
                              void handleUpdateDemandStatus(d.id, "concluida")
                            }
                          >
                            Concluída
                          </button>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
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
    </div>
  );
};

export default GestorDashboard;
