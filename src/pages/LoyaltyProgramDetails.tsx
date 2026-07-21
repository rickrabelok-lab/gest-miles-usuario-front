import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Settings2,
  Info,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Plus,
  Minus,
  Calendar,
  Filter,
  Plane,
  BarChart3,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Workspaces,
  WorkspaceTrigger,
  WorkspaceContent,
  type Workspace,
} from "@/components/ui/workspaces";
import { cn } from "@/lib/utils";
import { parseYmdToLocalDate } from "@/lib/dateYmd";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  normalizePersistedProgramState,
  reconstruirLotesDeMovimentos,
  stripPersistedMetaForServer,
  type PersistedProgramState,
} from "@/lib/program-state";
import { useProgramasCliente } from "@/hooks/useProgramasCliente";
import { useAuth } from "@/contexts/AuthContext";
import { logOperacional } from "@/lib/audit";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type MovimentoTipo = "entrada" | "saida";

type Movimento = {
  id: string;
  data: string;
  tipo: MovimentoTipo;
  descricao: string;
  milhas: number;
  lucrativa?: boolean;
  /** Valor pago (R$) na entrada, quando tipo === "entrada" */
  valorPago?: number;
  entradaTipo?: string;
  validadeLote?: string;
  origem?: string;
  destino?: string;
  classe?: string;
  passageiros?: number;
  taxas?: number;
  tarifaPagante?: number;
  economiaReal?: number;
  custoMilheiroBase?: number;
  codigoReserva?: string;
  sobrenomeEmissao?: string;
};

type LoteMilhas = {
  id: string;
  validadeLote: string;
  quantidade: number;
};

type ProgramState = {
  programId?: string;
  managerClientId?: string | null;
  managerClientName?: string | null;
  name: string;
  logo: string;
  logoColor: string;
  logoImageUrl?: string;
  balance: string;
  valueInBRL: string;
  lastUpdate: string;
  variation: "up" | "down" | "none";
};

const initialMovimentos: Movimento[] = [];

interface ProgramWorkspace extends Workspace {
  categoria: string;
  logo: string;
  plan: string;
}

type EntradaValidadeOpcao =
  | "6m"
  | "12m"
  | "24m"
  | "36m"
  | "60m"
  | "manual";

const SALDO_BASE_INICIAL = 0;
const CUSTO_MEDIO_BASE_INICIAL = 0;
const CUSTO_SALDO_BASE_INICIAL = 0;
const STORAGE_PREFIX = "mile-manager:program-state:";
type SaveSyncState = "local_only" | "saving" | "synced";

const ACTION_PLAN_LABEL_BY_KEY = {
  latam: "Latam Pass",
  azul: "Azul Fidelidade",
  smiles: "Smiles",
  avios: "Avios",
} as const;

type ActionPlanProgramKey = keyof typeof ACTION_PLAN_LABEL_BY_KEY;

const ACTION_PLAN_BY_PROGRAM_ID: Record<string, ActionPlanProgramKey> = {
  "latam-pass": "latam",
  latam: "latam",
  "tudo-azul": "azul",
  azul: "azul",
  smiles: "smiles",
  gol: "smiles",
  avios: "avios",
  iberia: "avios",
  "british-airways": "avios",
  "qatar-airways": "avios",
  finnair: "avios",
};

const normalizeProgramToken = (value?: string) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const resolveActionPlanProgramKey = (
  programId?: string,
  programName?: string,
): ActionPlanProgramKey | null => {
  const normalizedProgramId = normalizeProgramToken(programId);
  if (normalizedProgramId && ACTION_PLAN_BY_PROGRAM_ID[normalizedProgramId]) {
    return ACTION_PLAN_BY_PROGRAM_ID[normalizedProgramId];
  }

  const normalizedProgramName = normalizeProgramToken(programName);
  if (!normalizedProgramName) return null;
  if (normalizedProgramName.includes("latam")) return "latam";
  if (normalizedProgramName.includes("azul")) return "azul";
  if (normalizedProgramName.includes("smiles") || normalizedProgramName.includes("gol")) {
    return "smiles";
  }
  if (
    normalizedProgramName.includes("avios")
    || normalizedProgramName.includes("iberia")
    || normalizedProgramName.includes("british")
    || normalizedProgramName.includes("qatar")
    || normalizedProgramName.includes("finnair")
  ) {
    return "avios";
  }
  return null;
};

const formatDateYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseMovimentoDate = (value?: string) => {
  if (!value) return null;

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // dd/mm/yy or dd/mm/yyyy
  if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(value)) {
    const [dd, mm, yy] = value.split("/");
    const year = yy.length === 2 ? Number(`20${yy}`) : Number(yy);
    const d = new Date(year, Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const getEconomiaMovimentoSaida = (
  movimento: Movimento,
  custoMilheiroFallback: number,
) => {
  if (movimento.tipo !== "saida") return 0;
  if (typeof movimento.economiaReal === "number") return movimento.economiaReal;

  const milhas = Math.abs(movimento.milhas ?? 0);
  const taxas = movimento.taxas ?? 0;
  const tarifa = movimento.tarifaPagante ?? 0;
  const custoMilheiroBase = movimento.custoMilheiroBase ?? custoMilheiroFallback;

  if (milhas <= 0 || tarifa <= 0) return 0;

  const custoMilhas = (milhas / 1000) * custoMilheiroBase;
  return tarifa - (custoMilhas + taxas);
};

const readPersistedProgramState = (
  storageKey: string,
): PersistedProgramState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedProgramState;
    if (typeof parsed?.saldo !== "number" || !Array.isArray(parsed?.movimentos)) {
      return null;
    }
    if (typeof parsed?.custoSaldo !== "number") {
      parsed.custoSaldo = 0;
    }
    if (typeof parsed?.custoMedioMilheiro !== "number") {
      parsed.custoMedioMilheiro =
        parsed.saldo > 0 ? (parsed.custoSaldo / parsed.saldo) * 1000 : 0;
    }
    if (!Array.isArray(parsed.lotes)) {
      parsed.lotes = [];
    }
    return parsed;
  } catch {
    return null;
  }
};

const LoyaltyProgramDetails = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { role } = useAuth();
  const { programId } = useParams();

  const program = (location.state as { program?: ProgramState } | null)?.program;
  const managerClientId =
    program?.managerClientId ??
    ((role === "gestor" || role === "admin")
      ? searchParams.get("clientId")
      : null);
  const managerClientName = program?.managerClientName ?? null;
  const isManagerView = !!managerClientId && (role === "gestor" || role === "admin");
  const roleViewLabel = role === "cs"
    ? "CS"
    : role === "admin"
      ? "admin"
      : "gestor";

  const {
    byProgramId: remoteByProgramId,
    saveProgramState,
    clientId: effectiveClientId,
  } = useProgramasCliente(managerClientId);

  const programName = program?.name ?? "Programa de Milhas";
  const lastUpdate = program?.lastUpdate ?? "03/03";
  const [updatedAtDisplay, setUpdatedAtDisplay] = useState(
    `${lastUpdate} às 17:40`,
  );
  const dataOwnerId = effectiveClientId ?? "anonymous";
  const storageKey = useMemo(
    () =>
      `${STORAGE_PREFIX}${dataOwnerId}:${programId ?? "default"}:${programName
        .toLowerCase()
        .replace(/\s+/g, "-")}`,
    [dataOwnerId, programId, programName],
  );

  const programWorkspaces = useMemo<ProgramWorkspace[]>(
    () => [
      {
        id: "sem-clube",
        name: "Sem Clube",
        categoria: "Diamante",
        logo:
          "https://images.unsplash.com/photo-1431540015161-0bf868a2d407?auto=format&fit=crop&w=80&q=80",
        plan: "Sem assinatura mensal",
      },
      {
        id: "clube-pro-1000",
        name: "Clube Pro 1.000",
        categoria: "Diamante",
        logo:
          "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=80&q=80",
        plan: "Acúmulo mensal de 1.000",
      },
      {
        id: "clube-master-2500",
        name: "Clube Master 2.500",
        categoria: "Diamante",
        logo:
          "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=80&q=80",
        plan: "Acúmulo mensal de 2.500",
      },
      {
        id: "clube-vip-5000",
        name: "Clube Vip 5.000",
        categoria: "Diamante",
        logo:
          "https://images.unsplash.com/photo-1523952578875-e6bb18b26645?auto=format&fit=crop&w=80&q=80",
        plan: "Acúmulo mensal de 5.000",
      },
      {
        id: "clube-exclusive-20000",
        name: "Clube Exclusive 20.000",
        categoria: "Diamante",
        logo:
          "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=80&q=80",
        plan: "Acúmulo mensal de 20.000",
      },
    ],
    [],
  );
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("sem-clube");
  const selectedWorkspace = useMemo(
    () =>
      programWorkspaces.find((w) => w.id === selectedWorkspaceId) ??
      programWorkspaces[0],
    [programWorkspaces, selectedWorkspaceId],
  );

  // Estado financeiro inicial a partir do card / estado persistido
  const saldoInicial = SALDO_BASE_INICIAL;
  const persistedState = useMemo(
    () => readPersistedProgramState(storageKey),
    [storageKey],
  );

  const [saldo, setSaldo] = useState<number>(
    persistedState?.saldo ?? saldoInicial,
  );
  const [movimentos, setMovimentos] = useState<Movimento[]>(
    persistedState?.movimentos ?? initialMovimentos,
  );
  const [lotes, setLotes] = useState<LoteMilhas[]>(
    persistedState?.lotes ?? [],
  );
  const [custoSaldo, setCustoSaldo] = useState<number>(
    persistedState?.custoSaldo ?? 0,
  );
  const [custoMedioMilheiro, setCustoMedioMilheiro] = useState<number>(
    persistedState?.custoMedioMilheiro ?? CUSTO_MEDIO_BASE_INICIAL,
  );
  const [saveSyncState, setSaveSyncState] = useState<SaveSyncState>(
    programId && effectiveClientId ? "saving" : "local_only",
  );
  const custoTotal = custoSaldo;
  const [actionPlanFollowupOpen, setActionPlanFollowupOpen] = useState(false);
  const [actionPlanFollowupSaving, setActionPlanFollowupSaving] = useState(false);
  const actionPlanProgramKey = useMemo(
    () => resolveActionPlanProgramKey(programId, programName),
    [programId, programName],
  );
  const actionPlanProgramLabel = actionPlanProgramKey
    ? ACTION_PLAN_LABEL_BY_KEY[actionPlanProgramKey]
    : null;

  const maybeAskActionPlanFollowup = async () => {
    if (!effectiveClientId || !actionPlanProgramKey || !actionPlanProgramLabel) return;
    try {
      const { data: perfilRows, error } = await supabase
        .from("perfis")
        .select("id, slug, configuracao_tema")
        .eq("usuario_id", effectiveClientId)
        .limit(1);
      if (error) throw error;
      const perfil = (perfilRows ?? [])[0] as
        | { id?: string; slug?: string | null; configuracao_tema?: Record<string, unknown> | null }
        | undefined;

      const perfilCfg = (perfil?.configuracao_tema ?? {}) as Record<string, unknown>;
      const clientePerfil = (perfilCfg.clientePerfil ?? {}) as Record<string, unknown>;
      const planoAcao = (clientePerfil.planoAcao ?? {}) as Record<string, unknown>;
      if (planoAcao[actionPlanProgramKey] !== true) return;

      setActionPlanFollowupOpen(true);
    } catch {
      // Não bloqueia o fluxo de emissão caso a leitura do plano falhe.
    }
  };

  const handleConfirmActionPlanFollowup = async (keepInPlan: boolean) => {
    if (!effectiveClientId || !actionPlanProgramKey || !actionPlanProgramLabel) {
      setActionPlanFollowupOpen(false);
      return;
    }

    setActionPlanFollowupSaving(true);
    try {
      const fallbackSuffix = effectiveClientId.slice(0, 8);
      const { error } = await supabase.rpc("cliente_set_action_plan", {
        p_usuario_id: effectiveClientId,
        p_plano_acao: { [actionPlanProgramKey]: keepInPlan },
        p_slug: `cliente-${fallbackSuffix}`,
        p_nome_completo: `Cliente ${fallbackSuffix}`,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["cliente_gestores_perfis"] });
      setActionPlanFollowupOpen(false);
      toast.success(
        keepInPlan
          ? `${actionPlanProgramLabel} mantido no plano de ação.`
          : `${actionPlanProgramLabel} removido do plano de ação.`,
      );
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : "Não foi possível atualizar o plano de ação.";
      const message = /row-level security|permission denied|violates/i.test(rawMessage)
        ? "Sem permissão para atualizar o plano de ação deste cliente."
        : "Não foi possível atualizar o plano de ação agora. Tente novamente em instantes.";
      if (message !== rawMessage) {
        console.warn("Falha ao atualizar plano de ação do cliente", error);
      }
      toast.error(message);
    } finally {
      setActionPlanFollowupSaving(false);
    }
  };

  const handleAtualizarTela = () => {
    // Recalcula os indicadores a partir do estado atual e carimba a última atualização.
    const custoSaldoRecalculado = (saldo / 1000) * custoMedioMilheiro;
    setCustoSaldo(custoSaldoRecalculado);

    const agora = new Date();
    const data = agora.toLocaleDateString("pt-BR");
    const hora = agora.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setUpdatedAtDisplay(`${data} às ${hora}`);
    if (isManagerView) {
      void logOperacional({
        tipoAcao: "atualizacao_manual_programa",
        entidadeAfetada: "programa_cliente",
        entidadeId: programId,
        details: { managerClientId, programName },
      });
    }
  };

  const handleResetarTodosSaldos = () => {
    if (typeof window === "undefined") return;

    const confirmar = window.confirm(
      "Tem certeza que deseja resetar todos os saldos e históricos?",
    );
    if (!confirmar) return;

    const prefixOwner = `${STORAGE_PREFIX}${dataOwnerId}:`;
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(prefixOwner))
      .forEach((key) => window.localStorage.removeItem(key));

    setSaldo(0);
    setMovimentos([]);
    setLotes([]);
    setCustoSaldo(0);
    setCustoMedioMilheiro(0);
    setUpdatedAtDisplay("Resetado agora");
    if (isManagerView) {
      void logOperacional({
        tipoAcao: "reset_saldos",
        entidadeAfetada: "programa_cliente",
        entidadeId: programId,
        details: { managerClientId, programName },
      });
    }
  };

  useEffect(() => {
    const nextState = readPersistedProgramState(storageKey);
    setSaldo(nextState?.saldo ?? saldoInicial);
    setMovimentos(nextState?.movimentos ?? initialMovimentos);
    if (nextState?.lotes?.length) {
      setLotes(nextState.lotes);
    } else {
      // Sem lotes persistidos: reconstrói do histórico (entradas − saídas via FIFO),
      // NÃO só das entradas — senão sum(lotes) > saldo (milhas já emitidas "a vencer").
      // Passa o saldo como teto: movimentos incompletos não podem inflar os lotes.
      setLotes(
        reconstruirLotesDeMovimentos(
          nextState?.movimentos ?? initialMovimentos,
          nextState?.saldo ?? saldoInicial,
        ),
      );
    }
    setCustoSaldo(nextState?.custoSaldo ?? CUSTO_SALDO_BASE_INICIAL);
    setCustoMedioMilheiro(
      nextState?.custoMedioMilheiro ?? CUSTO_MEDIO_BASE_INICIAL,
    );
  }, [storageKey, saldoInicial]);

  /**
   * Sincroniza com Supabase sem apagar edições locais:
   * - refetch após save / HMR não pode trazer snapshot mais “antigo” que o que o usuário acabou de digitar.
   * - Se houver mais movimentos no storage local que no servidor, não sobrescreve.
   * - Se a quantidade for igual, só aplica remoto se `updated_at` do servidor for mais recente
   *   que `_localRevisionMs` (folga de relógio).
   */
  useEffect(() => {
    const row = remoteByProgramId.get(programId ?? "");
    if (!row?.state) return;

    const remoteNorm = normalizePersistedProgramState(row.state as PersistedProgramState);
    const remoteTs = new Date(row.updated_at).getTime();
    const local = readPersistedProgramState(storageKey);
    const localRev = local?._localRevisionMs ?? 0;
    const localMov = local?.movimentos?.length ?? 0;
    const remoteMov = remoteNorm.movimentos.length;

    if (localMov > remoteMov) return;

    const CLOCK_SKEW_MS = 3_000;
    if (localMov === remoteMov && localRev > remoteTs + CLOCK_SKEW_MS) return;

    setSaldo(remoteNorm.saldo);
    setMovimentos(remoteNorm.movimentos);
    setLotes(remoteNorm.lotes);
    setCustoSaldo(remoteNorm.custoSaldo);
    setCustoMedioMilheiro(remoteNorm.custoMedioMilheiro);
  }, [remoteByProgramId, programId, storageKey]);

  // Regra de negócio: custo do saldo = saldo * custo médio por milheiro / 1000
  useEffect(() => {
    const custoSaldoEsperado = (saldo / 1000) * custoMedioMilheiro;
    if (Math.abs(custoSaldo - custoSaldoEsperado) > 0.0001) {
      setCustoSaldo(custoSaldoEsperado);
    }
  }, [saldo, custoMedioMilheiro, custoSaldo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stateToPersist: PersistedProgramState = {
      saldo,
      movimentos,
      custoSaldo,
      custoMedioMilheiro,
      lotes,
      _localRevisionMs: Date.now(),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(stateToPersist));
    if (programId && effectiveClientId) {
      let cancelled = false;
      setSaveSyncState("saving");
      void saveProgramState({
        programId,
        programName,
        logo: program?.logo ?? null,
        logoColor: program?.logoColor ?? null,
        logoImageUrl: program?.logoImageUrl ?? null,
        state: stripPersistedMetaForServer(stateToPersist),
      })
        .then(() => {
          if (!cancelled) setSaveSyncState("synced");
        })
        .catch(() => {
          if (!cancelled) setSaveSyncState("local_only");
        });

      return () => {
        cancelled = true;
      };
    }

    setSaveSyncState("local_only");
  }, [
    storageKey,
    saldo,
    movimentos,
    custoSaldo,
    custoMedioMilheiro,
    lotes,
    programId,
    programName,
    program?.logoImageUrl,
    program?.logo,
    program?.logoColor,
    effectiveClientId,
    saveProgramState,
  ]);

  const pontosAVencer = useMemo<
    Array<{ data: string; quantidade: number; diasRestantes: number }>
  >(() => {
    const lotesPorValidade = new Map<string, number>();
    lotes
      .filter((l) => l.quantidade > 0)
      .forEach((lote) => {
        const atual = lotesPorValidade.get(lote.validadeLote) ?? 0;
        lotesPorValidade.set(lote.validadeLote, atual + lote.quantidade);
      });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const msDia = 1000 * 60 * 60 * 24;

    return Array.from(lotesPorValidade.entries())
      .map(([validadeLote, quantidade]) => {
        const validade = new Date(`${validadeLote}T00:00:00`);
        const diasRestantes = Math.ceil(
          (validade.getTime() - hoje.getTime()) / msDia,
        );

        return {
          data: validade.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
          quantidade,
          diasRestantes,
        };
      })
      .sort((a, b) => a.diasRestantes - b.diasRestantes);
  }, [lotes]);

  /** Milhas que vencem nos próximos 30 dias */
  const milhasVencendoUltimos30Dias = useMemo(
    () =>
      pontosAVencer
        .filter((p) => p.diasRestantes >= 0 && p.diasRestantes <= 30)
        .reduce((acc, p) => acc + p.quantidade, 0),
    [pontosAVencer],
  );

  const valorEstimadoMilheiro = 18.85; // exemplo de valuation
  const valorEstrategicoEstimado = useMemo(
    () => (saldo / 1000) * valorEstimadoMilheiro,
    [saldo],
  );

  const economiaRealUltimos12Meses = useMemo(() => {
    const limite = new Date();
    limite.setMonth(limite.getMonth() - 12);
    limite.setHours(0, 0, 0, 0);

    return movimentos
      .filter((m) => m.tipo === "saida")
      .filter((m) => {
        const data = parseMovimentoDate(m.data);
        return !!data && data >= limite;
      })
      .reduce(
        (acc, m) => acc + getEconomiaMovimentoSaida(m, custoMedioMilheiro),
        0,
      );
  }, [movimentos, custoMedioMilheiro]);

  // Modais
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [saidaOpen, setSaidaOpen] = useState(false);
  const [movimentoDetalheOpen, setMovimentoDetalheOpen] = useState(false);
  const [movimentoSelecionado, setMovimentoSelecionado] =
    useState<Movimento | null>(null);

  // Entrada de milhas
  const [entradaTipo, setEntradaTipo] = useState("compra");
  const [entradaQuantidade, setEntradaQuantidade] = useState(0);
  const [entradaValorPago, setEntradaValorPago] = useState(0);
  const [entradaData, setEntradaData] = useState("");
  const [entradaValidadeOpcao, setEntradaValidadeOpcao] =
    useState<EntradaValidadeOpcao>("12m");
  const [entradaValidadeLote, setEntradaValidadeLote] = useState("");
  const [entradaObs, setEntradaObs] = useState("");

  const custoMilheiroOperacao = useMemo(
    () =>
      entradaQuantidade > 0
        ? (entradaValorPago / entradaQuantidade) * 1000
        : 0,
    [entradaValorPago, entradaQuantidade],
  );

  const novoCustoMedioPonderado = useMemo(() => {
    if (entradaQuantidade <= 0) return custoMedioMilheiro;
    const novoSaldo = saldo + entradaQuantidade;
    const novoCustoTotal = custoSaldo + entradaValorPago;
    if (novoSaldo <= 0) return 0;
    return (novoCustoTotal / novoSaldo) * 1000;
  }, [saldo, custoSaldo, entradaQuantidade, entradaValorPago, custoMedioMilheiro]);

  const handleSalvarEntrada = () => {
    if (entradaQuantidade <= 0) return;

    const novoSaldo = saldo + entradaQuantidade;
    const novoCustoSaldo = custoSaldo + entradaValorPago;
    const novoCustoMedio =
      novoSaldo > 0 ? (novoCustoSaldo / novoSaldo) * 1000 : 0;

    setSaldo(novoSaldo);
    setCustoSaldo(novoCustoSaldo);
    setCustoMedioMilheiro(novoCustoMedio);

    const hoje = new Date();
    const dataMovimento =
      entradaData || hoje.toLocaleDateString("pt-BR", { timeZone: "UTC" });
    const baseDate = entradaData
      ? new Date(`${entradaData}T00:00:00`)
      : new Date();

    const validadeMesesMap: Record<Exclude<EntradaValidadeOpcao, "manual">, number> =
      {
        "6m": 6,
        "12m": 12,
        "24m": 24,
        "36m": 36,
        "60m": 60,
      };

    const validadeLoteFinal =
      entradaValidadeOpcao === "manual"
        ? entradaValidadeLote
        : (() => {
            const validade = new Date(baseDate);
            validade.setMonth(validade.getMonth() + validadeMesesMap[entradaValidadeOpcao]);
            return formatDateYmd(validade);
          })();

    const descricaoBase =
      entradaTipo === "compra"
        ? "Compra de milhas"
        : entradaTipo === "transferencia"
          ? "Transferência de milhas"
          : entradaTipo === "bonus"
            ? "Bônus de milhas"
            : entradaTipo === "clube"
              ? "Crédito Clube de milhas"
              : "Ajuste de milhas";

    const novoMovimento: Movimento = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      data: dataMovimento,
      tipo: "entrada",
      descricao: entradaObs ? `${descricaoBase} – ${entradaObs}` : descricaoBase,
      milhas: entradaQuantidade,
      valorPago: entradaValorPago,
      entradaTipo,
      validadeLote: validadeLoteFinal || undefined,
    };

    setMovimentos((anterior) => [novoMovimento, ...anterior]);

    if (validadeLoteFinal) {
      setLotes((anteriores) => {
        const existing = anteriores.find(
          (l) => l.validadeLote === validadeLoteFinal,
        );
        if (existing) {
          return anteriores.map((l) =>
            l.validadeLote === validadeLoteFinal
              ? { ...l, quantidade: l.quantidade + entradaQuantidade }
              : l,
          );
        }
        return [
          ...anteriores,
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            validadeLote: validadeLoteFinal,
            quantidade: entradaQuantidade,
          },
        ];
      });
    }

    setEntradaOpen(false);
    setEntradaQuantidade(0);
    setEntradaValorPago(0);
    setEntradaData("");
    setEntradaValidadeOpcao("12m");
    setEntradaValidadeLote("");
    setEntradaObs("");
    setEntradaTipo("compra");
    if (isManagerView) {
      void logOperacional({
        tipoAcao: "registro_entrada_milhas",
        entidadeAfetada: "movimentos_programa",
        entidadeId: novoMovimento.id,
        details: {
          managerClientId,
          programId,
          programName,
          milhas: entradaQuantidade,
          valorPago: entradaValorPago,
        },
      });
    }
  };

  // Saída / emissão
  const [emitDescricao, setEmitDescricao] = useState("");
  const [emitOrigem, setEmitOrigem] = useState("");
  const [emitDestino, setEmitDestino] = useState("");
  const [emitTipoViagem, setEmitTipoViagem] = useState<"somente_ida" | "ida_e_volta">(
    "somente_ida",
  );
  const [emitDataIda, setEmitDataIda] = useState("");
  const [emitDataVolta, setEmitDataVolta] = useState("");
  const [emitPax, setEmitPax] = useState(1);
  const [emitClasse, setEmitClasse] = useState("executiva");
  const [emitBagagem, setEmitBagagem] = useState(false);
  const [emitAssento, setEmitAssento] = useState(false);
  const [emitSeguro, setEmitSeguro] = useState(false);
  const [emitSobrenomeEmissao, setEmitSobrenomeEmissao] = useState("");
  const [emitCodigoReserva, setEmitCodigoReserva] = useState("");

  const [emitMilhas, setEmitMilhas] = useState(0);
  const [emitTaxas, setEmitTaxas] = useState(0);
  const [emitTarifaPagante, setEmitTarifaPagante] = useState(0);
  const [emitObs, setEmitObs] = useState("");

  // Usa o custo médio atual do programa como base do cálculo.
  const custoMedioMilheiroReferencia = custoMedioMilheiro;

  const custoMilhasNaEmissao = useMemo(
    () => (emitMilhas / 1000) * custoMedioMilheiroReferencia,
    [emitMilhas, custoMedioMilheiroReferencia],
  );

  const custoRealEmissaoMilhasETaxas = useMemo(
    () => custoMilhasNaEmissao + emitTaxas,
    [custoMilhasNaEmissao, emitTaxas],
  );

  // Economia real da emissão = tarifa pagante - (custo das milhas + taxas)
  const economiaRealEmissao = useMemo(
    () => emitTarifaPagante - custoRealEmissaoMilhasETaxas,
    [custoRealEmissaoMilhasETaxas, emitTarifaPagante],
  );

  const valorMilheiroReal = useMemo(() => {
    if (emitMilhas <= 0) return 0;
    return (economiaRealEmissao / emitMilhas) * 1000;
  }, [economiaRealEmissao, emitMilhas]);

  const roiEmissao = useMemo(() => {
    const investimento = custoRealEmissaoMilhasETaxas;
    if (investimento <= 0) return 0;
    return (economiaRealEmissao / investimento) * 100;
  }, [custoRealEmissaoMilhasETaxas, economiaRealEmissao]);

  const descontoReal = useMemo(() => {
    if (emitTarifaPagante <= 0) return 0;
    return (economiaRealEmissao / emitTarifaPagante) * 100;
  }, [economiaRealEmissao, emitTarifaPagante]);

  const classificacaoEmissao = useMemo<"vantajosa" | "mais_cara">(() => {
    // Verde quando emitir com milhas sai igual/mais barato que tarifa pagante.
    if (custoRealEmissaoMilhasETaxas <= emitTarifaPagante) return "vantajosa";
    // Vermelho quando emitir com milhas fica mais caro que pagar a tarifa.
    return "mais_cara";
  }, [custoRealEmissaoMilhasETaxas, emitTarifaPagante]);

  const corClassificacao =
    classificacaoEmissao === "vantajosa" ? "text-success" : "text-destructive";

  const handleSalvarSaida = () => {
    if (emitMilhas <= 0) {
      toast.error("Informe as milhas utilizadas (maior que zero).");
      return;
    }
    if (!emitCodigoReserva.trim()) {
      toast.error("Informe o código da reserva (PNR / localizador).");
      return;
    }
    if (!emitSobrenomeEmissao.trim()) {
      toast.error("Informe o sobrenome na emissão (como na bilheteira) para localizar a reserva.");
      return;
    }
    if (emitMilhas > saldo) {
      toast.error(
        `Saldo insuficiente. Disponível: ${saldo.toLocaleString("pt-BR")} milhas.`,
      );
      return;
    }
    const milhasSaida = Math.min(emitMilhas, saldo);
    const novoSaldo = Math.max(saldo - milhasSaida, 0);
    const custoRemovido = (milhasSaida / 1000) * custoMedioMilheiro;
    const novoCustoSaldo = Math.max(custoSaldo - custoRemovido, 0);

    setSaldo(novoSaldo);
    setCustoSaldo(novoCustoSaldo);

    // Regra: saída sempre debita primeiro dos lotes mais próximos de vencer.
    setLotes((anteriores) => {
      const ordenados = [...anteriores]
        .filter((l) => l.quantidade > 0)
        .sort(
          (a, b) =>
            new Date(a.validadeLote).getTime() - new Date(b.validadeLote).getTime(),
        );

      let restante = milhasSaida;
      const atualizados = ordenados.map((lote) => {
        if (restante <= 0) return lote;
        const debitado = Math.min(lote.quantidade, restante);
        restante -= debitado;
        return {
          ...lote,
          quantidade: lote.quantidade - debitado,
        };
      });

      // Mantém lotes sem validade não afetados e remove lotes zerados.
      const semValidade = anteriores.filter((l) => !l.validadeLote);
      return [...atualizados, ...semValidade].filter((l) => l.quantidade > 0);
    });

    const hoje = new Date();
    const dataMovimento =
      emitDataIda || hoje.toLocaleDateString("pt-BR", { timeZone: "UTC" });

    const rota =
      emitOrigem && emitDestino ? `${emitOrigem.toUpperCase()} – ${emitDestino.toUpperCase()}` : "";

    const descricaoBase =
      emitDescricao || (rota ? `Emissão ${rota}` : "Emissão com milhas");

    const movimentoEmissao: Movimento = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      data: dataMovimento,
      tipo: "saida",
      descricao: emitObs
        ? `${descricaoBase} – ${emitObs}`
        : descricaoBase,
      milhas: -emitMilhas,
      lucrativa: roiEmissao >= 0,
      origem: emitOrigem || undefined,
      destino: emitDestino || undefined,
      classe: emitClasse || undefined,
      passageiros: emitPax,
      taxas: emitTaxas,
      tarifaPagante: emitTarifaPagante,
      economiaReal: economiaRealEmissao,
      custoMilheiroBase: custoMedioMilheiroReferencia,
      codigoReserva: emitCodigoReserva.trim() || undefined,
      sobrenomeEmissao: emitSobrenomeEmissao.trim(),
    };

    setMovimentos((anterior) => [movimentoEmissao, ...anterior]);

    // Aqui você registraria histórico + ROI individual da emissão no backend.
    setSaidaOpen(false);
    if (isManagerView) {
      void logOperacional({
        tipoAcao: "registro_saida_milhas",
        entidadeAfetada: "movimentos_programa",
        entidadeId: movimentoEmissao.id,
        details: {
          managerClientId,
          programId,
          programName,
          milhas: milhasSaida,
          economiaReal: economiaRealEmissao,
        },
      });
    }
    void maybeAskActionPlanFollowup();
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-nubank-bg text-nubank-text pt-[var(--gm-safe-top)]">
      {/* Header */}
      <header className="px-5 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-[16px] border border-nubank-border bg-white text-nubank-text transition-colors hover:bg-nubank-bg"
          >
            <ArrowLeft size={19} strokeWidth={2} />
          </button>
          <span className="min-w-0 truncate px-1 text-center font-display text-base font-semibold tracking-tight text-nubank-text">
            {programName}
          </span>
          <div className="flex flex-none items-center gap-2">
            <button
              type="button"
              onClick={handleAtualizarTela}
              className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-nubank-border bg-white text-[#54535A] transition-colors hover:bg-nubank-bg"
              aria-label="Recarregar página"
              title="Recarregar"
            >
              <RefreshCw size={17} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={handleResetarTodosSaldos}
              className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-destructive-soft text-destructive-strong transition-colors hover:bg-destructive/15"
              aria-label="Resetar todos os saldos"
              title="Resetar saldos"
            >
              <Trash2 size={17} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        {(managerClientId || saveSyncState !== "synced") && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
            {managerClientId && (
              <span className="rounded-full bg-nubank-tint px-2.5 py-1 text-[10.5px] font-semibold leading-none text-nubank-dark">
                {`Visualizando como ${roleViewLabel}`}
                {managerClientName ? ` · ${managerClientName}` : ""}
              </span>
            )}
            {saveSyncState !== "synced" && (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10.5px] font-semibold leading-none",
                  saveSyncState === "saving"
                    ? "bg-[#F1F0F3] text-[#54535A]"
                    : "bg-warning-soft text-warning-strong",
                )}
              >
                {saveSyncState === "saving"
                  ? "Sincronizando"
                  : "Salvo só neste aparelho"}
              </span>
            )}
          </div>
        )}
      </header>

      <Tabs defaultValue="resumo" className="flex flex-1 flex-col">
        <TabsList className="mx-5 mb-3 grid h-auto grid-cols-3 rounded-[16px] bg-[#EDECEF] p-1 text-xs">
          {(["resumo", "extrato", "analise"] as const).map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-[13px] py-2 text-[13px] font-medium text-nubank-text-secondary data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-nubank-text data-[state=active]:shadow-[0_1px_4px_rgba(24,6,38,0.08)]"
            >
              {tab === "resumo" ? "Resumo" : tab === "extrato" ? "Extrato" : "Análise"}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Resumo */}
        <TabsContent value="resumo" className="flex-1">
          <ScrollArea className="h-[calc(100vh-150px)] px-4 pb-6">
            {/* Card principal */}
            <Card className="mb-3 rounded-3xl border-0 bg-white shadow-nubank-card">
              <CardContent className="p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-nubank-tint text-nubank-primary">
                      <Plane className="h-5 w-5" strokeWidth={1.75} />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Clube
                      </p>
                      <Workspaces
                        workspaces={programWorkspaces}
                        selectedWorkspaceId={selectedWorkspaceId}
                        onWorkspaceChange={(workspace) =>
                          setSelectedWorkspaceId((workspace as ProgramWorkspace).id)
                        }
                      >
                        <WorkspaceTrigger
                          className="text-xs font-semibold text-nubank-dark"
                          renderTrigger={(workspace) => (
                            <span className="inline-flex items-center gap-1 rounded-full bg-nubank-tint px-2.5 py-1 text-xs font-semibold leading-none text-nubank-dark">
                              {(workspace as ProgramWorkspace).name}
                            </span>
                          )}
                        />
                        <WorkspaceContent title="Plano de clube" />
                      </Workspaces>
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground">
                    <p>Atualização</p>
                    <p className="font-medium">{updatedAtDisplay}</p>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Saldo de milhas
                  </p>
                  <p className="mt-1 font-display text-[38px] font-bold tabular-nums leading-tight tracking-tight text-nubank-text">
                    {saldo.toLocaleString("pt-BR")}
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <span className="rounded-full border border-nubank-border bg-white px-3 py-1.5 text-[12.5px] font-semibold tabular-nums leading-none text-nubank-text">
                      Custo{" "}
                      {custoTotal.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        maximumFractionDigits: 0,
                      })}
                    </span>
                    <span className="rounded-full border border-nubank-border bg-white px-3 py-1.5 text-[12.5px] font-semibold tabular-nums leading-none text-nubank-text">
                      CPM{" "}
                      {custoMedioMilheiro.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                    {economiaRealUltimos12Meses > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-3 py-1.5 text-[12.5px] font-semibold tabular-nums leading-none text-success-strong">
                        <TrendingUp className="h-3 w-3" strokeWidth={2.4} />
                        {economiaRealUltimos12Meses.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })}{" "}
                        · 12m
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ações imediatamente abaixo do card estratégico */}
            <div className="mb-4 grid grid-cols-2 gap-2.5">
              <Button
                type="button"
                className="h-[50px] rounded-[16px] text-sm font-semibold"
                onClick={() => setEntradaOpen(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" strokeWidth={2.2} />
                Entrada
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-[50px] rounded-[16px] border-0 bg-destructive-soft text-sm font-semibold text-destructive-strong hover:bg-destructive/15"
                onClick={() => setSaidaOpen(true)}
              >
                <Minus className="mr-1.5 h-4 w-4" strokeWidth={2.2} />
                Saída
              </Button>
            </div>

            {/* Bloco financeiro */}
            <div className="mb-4">
              <p className="section-label px-0.5">Inteligência de custo</p>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-[18px] bg-white p-3.5 shadow-nubank-card">
                  <p className="text-xs text-nubank-text-secondary">Custo do saldo</p>
                  <p className="mt-1 font-display text-[19px] font-bold tabular-nums text-nubank-text">
                    {custoTotal.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
                <div className="rounded-[18px] bg-white p-3.5 shadow-nubank-card">
                  <p className="text-xs text-nubank-text-secondary">CPM médio pago</p>
                  <p className="mt-1 font-display text-[19px] font-bold tabular-nums text-nubank-text">
                    {custoMedioMilheiro.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </p>
                </div>
                <div className="rounded-[18px] bg-white p-3.5 shadow-nubank-card">
                  <p className="text-xs text-nubank-text-secondary">Economia 12m</p>
                  <p className="mt-1 font-display text-[19px] font-bold tabular-nums text-success-strong">
                    {economiaRealUltimos12Meses.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
                <div className="rounded-[18px] bg-white p-3.5 shadow-nubank-card">
                  <p className="text-xs text-nubank-text-secondary">Vencendo em 30d</p>
                  <p
                    className={cn(
                      "mt-1 font-display text-[19px] font-bold tabular-nums",
                      milhasVencendoUltimos30Dias > 0
                        ? "text-destructive-strong"
                        : "text-nubank-text",
                    )}
                  >
                    {milhasVencendoUltimos30Dias.toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            </div>

            {/* Lotes a vencer */}
            <div className="mb-4">
              <p className="section-label px-0.5">Lotes a vencer</p>
              <div className="rounded-[20px] bg-white py-1 shadow-nubank-card">
                {pontosAVencer.length === 0 ? (
                  <p className="px-4 py-4 text-[12.5px] text-nubank-text-secondary">
                    Nenhum lote com validade informado ainda.
                  </p>
                ) : (
                  pontosAVencer.map((ponto, idx) => {
                    const vencido = ponto.diasRestantes < 0;
                    const critico = ponto.diasRestantes >= 0 && ponto.diasRestantes <= 30;
                    const atencao = ponto.diasRestantes > 30 && ponto.diasRestantes <= 90;
                    const tintClass = vencido || critico
                      ? "bg-destructive-soft text-destructive-strong"
                      : atencao
                        ? "bg-warning-soft text-warning-strong"
                        : "bg-info-soft text-info-strong";
                    return (
                      <div key={`${ponto.data}-${ponto.quantidade}`}>
                        {idx > 0 && <div className="mx-3.5 h-px bg-[#F1F0F3]" />}
                        <div className="flex items-center gap-3 px-3.5 py-3">
                          <span
                            className={cn(
                              "flex h-10 w-10 flex-none items-center justify-center rounded-[13px]",
                              tintClass,
                            )}
                          >
                            <Calendar size={18} strokeWidth={1.75} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-display text-sm font-semibold tabular-nums text-nubank-text">
                              {ponto.quantidade.toLocaleString("pt-BR")} milhas
                            </span>
                            <span className="block text-xs text-nubank-text-secondary">
                              {vencido ? "venceu em" : "vencem em"} {ponto.data}
                            </span>
                          </span>
                          <span
                            className={cn(
                              "flex-none rounded-full px-2.5 py-1 text-[11px] font-bold leading-none",
                              tintClass,
                            )}
                          >
                            {vencido
                              ? `há ${Math.abs(ponto.diasRestantes)}d`
                              : `${ponto.diasRestantes} dias`}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Extrato */}
        <TabsContent value="extrato" className="flex-1">
          <div className="flex items-center justify-between px-4 pb-2 pt-1 text-xs text-muted-foreground">
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-nubank-border bg-white px-3 py-1 text-[11px] text-nubank-text-secondary"
              >
                <Filter className="h-3 w-3" />
                Período
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-nubank-border bg-white px-3 py-1 text-[11px] text-nubank-text-secondary"
              >
                Tipo
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border border-nubank-border bg-white px-3 py-1 text-[11px] text-nubank-text-secondary"
              >
                Emissões lucrativas
              </button>
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-150px)] px-4 pb-6">
            <Card className="rounded-[20px] border-0 bg-white shadow-nubank-card">
              <CardContent className="divide-y divide-[#F1F0F3] p-0">
                {movimentos.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    Nenhuma movimentação registrada ainda.
                  </div>
                )}
                {movimentos.map((mov) => (
                  <button
                    key={mov.id}
                    type="button"
                    onClick={() => {
                      setMovimentoSelecionado(mov);
                      setMovimentoDetalheOpen(true);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs"
                  >
                    <div className="w-16">
                      <p className="text-[11px] text-muted-foreground">{mov.data}</p>
                      <p
                        className={cn(
                          "mt-0.5 text-xs font-semibold",
                          mov.tipo === "entrada"
                            ? "text-success-strong"
                            : "text-destructive-strong",
                        )}
                      >
                        {mov.tipo === "entrada" ? "Entrada" : "Saída"}
                      </p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] text-nubank-text">
                        {mov.descricao}
                      </p>
                      {mov.tipo === "saida" && mov.codigoReserva && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Reserva: {mov.codigoReserva}
                        </p>
                      )}
                      {mov.lucrativa !== undefined && (
                        <p
                          className={cn(
                            "mt-0.5 text-[10px]",
                            mov.lucrativa
                              ? "text-success-strong"
                              : "text-destructive-strong",
                          )}
                        >
                          {mov.lucrativa
                            ? "Emissão lucrativa"
                            : "Abaixo do custo médio"}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "text-xs font-semibold",
                          mov.milhas >= 0
                            ? "text-success-strong"
                            : "text-destructive-strong",
                        )}
                      >
                        {mov.milhas >= 0 ? "+" : "-"}{" "}
                        {Math.abs(mov.milhas).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </button>
                ))}
              </CardContent>
            </Card>
          </ScrollArea>
        </TabsContent>

        {/* Análise */}
        <TabsContent value="analise" className="flex-1">
          <ScrollArea className="h-[calc(100vh-150px)] px-4 pb-6">
            <Card className="mb-4 rounded-[20px] border-0 bg-white shadow-nubank-card">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-nubank-text">
                    Evolução do saldo
                  </span>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="h-24 rounded-2xl bg-nubank-bg text-[11px] text-muted-foreground">
                  <p className="p-3 text-sm text-muted-foreground">
                    Gráfico saldo vs. tempo — em breve (dados agregados do programa).
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-4 rounded-[20px] border-0 bg-white shadow-nubank-card">
              <CardContent className="space-y-3 p-4">
                <span className="text-xs font-medium text-nubank-text">
                  Custo médio vs. valor obtido
                </span>
                <div className="space-y-2 text-[11px] text-nubank-text-secondary">
                  <p>
                    Custo médio atual:{" "}
                    <span className="font-semibold text-nubank-text">
                      {custoMedioMilheiro.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}{" "}
                      / milheiro
                    </span>
                  </p>
                  <p>
                    Melhor emissão recente (exemplo):{" "}
                    <span className="font-semibold text-success-strong">
                      R$ 34,00 / milheiro
                    </span>{" "}
                    {(((34 - custoMedioMilheiro) / custoMedioMilheiro) * 100).toFixed(
                      1,
                    )}
                    % acima do custo.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[20px] border-0 bg-white shadow-nubank-card">
              <CardContent className="space-y-3 p-4">
                <span className="text-xs font-medium text-nubank-text">
                  Ranking das melhores emissões
                </span>
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between rounded-2xl bg-nubank-bg px-3 py-2">
                    <div>
                      <p className="text-nubank-text">GRU – MCO Executiva</p>
                      <p className="text-[10px] text-muted-foreground">
                        {">"} R$ 34/milheiro • ROI +61%
                      </p>
                    </div>
                    <Badge className="rounded-full bg-emerald-100 text-[10px] text-success-strong ring-1 ring-emerald-200">
                      Excelente uso
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-nubank-bg px-3 py-2">
                    <div>
                      <p className="text-nubank-text">GRU – SSA Econômica</p>
                      <p className="text-[10px] text-muted-foreground">
                        R$ 22/milheiro • ROI +15%
                      </p>
                    </div>
                    <Badge className="rounded-full bg-amber-100 text-[10px] text-amber-700 ring-1 ring-amber-200">
                      Uso moderado
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-nubank-bg px-3 py-2">
                    <div>
                      <p className="text-nubank-text">CGH – SDU Ponte aérea</p>
                      <p className="text-[10px] text-muted-foreground">
                        R$ 15/milheiro • ROI -10%
                      </p>
                    </div>
                    <Badge className="rounded-full bg-red-100 text-[10px] text-destructive-strong ring-1 ring-red-200">
                      Abaixo do custo
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Modal entrada */}
      <Dialog open={movimentoDetalheOpen} onOpenChange={setMovimentoDetalheOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes da movimentação</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Informações completas da movimentação selecionada.
            </DialogDescription>
          </DialogHeader>
          {movimentoSelecionado && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-nubank-bg p-3">
                  <p className="text-muted-foreground">Data</p>
                  <p className="font-semibold text-nubank-text">
                    {movimentoSelecionado.data}
                  </p>
                </div>
                <div className="rounded-xl bg-nubank-bg p-3">
                  <p className="text-muted-foreground">Tipo</p>
                  <p
                    className={cn(
                      "font-semibold",
                      movimentoSelecionado.tipo === "entrada"
                        ? "text-success-strong"
                        : "text-destructive-strong",
                    )}
                  >
                    {movimentoSelecionado.tipo === "entrada"
                      ? "Entrada"
                      : "Saída"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-nubank-bg p-3">
                <p className="text-muted-foreground">Descrição</p>
                <p className="font-semibold text-nubank-text">
                  {movimentoSelecionado.descricao}
                </p>
              </div>

              <div className="rounded-xl bg-nubank-bg p-3">
                <p className="text-muted-foreground">Milhas</p>
                <p
                  className={cn(
                    "font-semibold",
                    movimentoSelecionado.milhas >= 0
                      ? "text-success-strong"
                      : "text-destructive-strong",
                  )}
                >
                  {movimentoSelecionado.milhas >= 0 ? "+" : "-"}{" "}
                  {Math.abs(movimentoSelecionado.milhas).toLocaleString("pt-BR")}
                </p>
              </div>

              {movimentoSelecionado.tipo === "entrada" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-nubank-bg p-3">
                    <p className="text-muted-foreground">Tipo de entrada</p>
                    <p className="font-semibold text-nubank-text">
                      {movimentoSelecionado.entradaTipo ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-nubank-bg p-3">
                    <p className="text-muted-foreground">Valor pago</p>
                    <p className="font-semibold text-nubank-text">
                      {(movimentoSelecionado.valorPago ?? 0).toLocaleString(
                        "pt-BR",
                        {
                          style: "currency",
                          currency: "BRL",
                        },
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl bg-nubank-bg p-3 col-span-2">
                    <p className="text-muted-foreground">Validade do lote</p>
                    <p className="font-semibold text-nubank-text">
                      {movimentoSelecionado.validadeLote ?? "-"}
                    </p>
                  </div>
                </div>
              )}

              {movimentoSelecionado.tipo === "saida" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-nubank-bg p-3 col-span-2">
                    <p className="text-muted-foreground">Código da reserva</p>
                    <p className="font-semibold text-nubank-text">
                      {movimentoSelecionado.codigoReserva ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-nubank-bg p-3">
                    <p className="text-muted-foreground">Rota</p>
                    <p className="font-semibold text-nubank-text">
                      {movimentoSelecionado.origem && movimentoSelecionado.destino
                        ? `${movimentoSelecionado.origem.toUpperCase()} - ${movimentoSelecionado.destino.toUpperCase()}`
                        : "-"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-nubank-bg p-3">
                    <p className="text-muted-foreground">Classe / Pax</p>
                    <p className="font-semibold text-nubank-text">
                      {(movimentoSelecionado.classe ?? "-").toUpperCase()} /{" "}
                      {movimentoSelecionado.passageiros ?? "-"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-nubank-bg p-3">
                    <p className="text-muted-foreground">Taxas</p>
                    <p className="font-semibold text-nubank-text">
                      {(movimentoSelecionado.taxas ?? 0).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </p>
                  </div>
                  <div className="rounded-xl bg-nubank-bg p-3">
                    <p className="text-muted-foreground">Tarifa pagante</p>
                    <p className="font-semibold text-nubank-text">
                      {(movimentoSelecionado.tarifaPagante ?? 0).toLocaleString(
                        "pt-BR",
                        {
                          style: "currency",
                          currency: "BRL",
                        },
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal entrada */}
      <Dialog open={entradaOpen} onOpenChange={setEntradaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Entrada de milhas</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Registre compras, transferências, bônus ou ajustes. O custo médio
              será recalculado automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">Tipo</p>
              <div className="grid grid-cols-3 gap-1.5">
                {["compra", "transferencia", "bonus", "clube", "ajuste"].map(
                  (tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setEntradaTipo(tipo)}
                      className={cn(
                        "rounded-full border px-2 py-1 capitalize",
                        entradaTipo === tipo
                          ? "border-success/40 bg-success-soft text-success-strong"
                          : "border-nubank-border bg-white text-nubank-text-secondary",
                      )}
                    >
                      {tipo}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">
                  Quantidade de milhas
                </p>
                <Input
                  type="number"
                  value={entradaQuantidade || ""}
                  onChange={(event) =>
                    setEntradaQuantidade(Number(event.target.value) || 0)
                  }
                  className="no-spinner h-9 text-xs"
                  min={0}
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">
                  Valor pago (R$)
                </p>
                <Input
                  type="number"
                  value={entradaValorPago || ""}
                  onChange={(event) =>
                    setEntradaValorPago(Number(event.target.value) || 0)
                  }
                  className="no-spinner h-9 text-xs"
                  min={0}
                />
              </div>
            </div>

            <div className="rounded-xl bg-nubank-bg p-3 text-[11px] text-muted-foreground">
              Custo do milheiro nessa operação:{" "}
              <span className="font-semibold text-success-strong">
                {custoMilheiroOperacao.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
                {" / 1.000 milhas"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">Data</p>
                <DatePickerField
                  value={entradaData}
                  onChange={setEntradaData}
                  placeholder="Escolher data"
                  triggerClassName="h-9 text-xs"
                  contentClassName="border-nubank-border"
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">
                  Validade do lote
                </p>
                <Select
                  value={entradaValidadeOpcao}
                  onValueChange={(value) =>
                    setEntradaValidadeOpcao(value as EntradaValidadeOpcao)
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione a validade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6m">6 meses</SelectItem>
                    <SelectItem value="12m">12 meses</SelectItem>
                    <SelectItem value="24m">24 meses</SelectItem>
                    <SelectItem value="36m">36 meses</SelectItem>
                    <SelectItem value="60m">60 meses</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {entradaValidadeOpcao === "manual" && (
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    Validade manual (data)
                  </p>
                  <DatePickerField
                    value={entradaValidadeLote}
                    onChange={setEntradaValidadeLote}
                    placeholder="Escolher data"
                    triggerClassName="h-9 text-xs"
                    contentClassName="border-nubank-border"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="mb-1 text-[11px] text-muted-foreground">Observações</p>
                <Input
                  value={entradaObs}
                  onChange={(event) => setEntradaObs(event.target.value)}
                  className="h-9 text-xs"
                  placeholder="Promoção, parceiro, etc."
                />
              </div>
            </div>

            <div className="mt-1 rounded-2xl bg-nubank-bg p-3 text-[11px] text-muted-foreground">
              <p className="mb-1 font-medium text-nubank-text">
                Novo custo médio projetado
              </p>
              <p>
                Atual:{" "}
                <span className="font-semibold text-nubank-text">
                  {custoMedioMilheiro.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}{" "}
                  / milheiro
                </span>
              </p>
              <p>
                Projetado:{" "}
                <span className="font-semibold text-success-strong">
                  {novoCustoMedioPonderado.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}{" "}
                  / milheiro
                </span>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setEntradaOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className="text-xs font-semibold"
                onClick={handleSalvarEntrada}
              >
                Salvar entrada
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal saída / emissão */}
      <Dialog open={saidaOpen} onOpenChange={setSaidaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Saída de milhas (emissão)</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Registre a emissão completa para medir o ROI real de cada voo.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-4 pb-2 text-xs">
              {/* 1. Informações da emissão */}
              <div className="space-y-2 rounded-2xl bg-nubank-bg p-3">
                <p className="text-[11px] font-medium text-muted-foreground">
                  1. Informações da emissão
                </p>
                <Input
                  value={emitDescricao}
                  onChange={(event) => setEmitDescricao(event.target.value)}
                  placeholder="Ex: GRU – MCO Executiva férias família"
                  className="h-8 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={emitOrigem}
                    onChange={(event) => setEmitOrigem(event.target.value)}
                    placeholder="Origem (GRU)"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={emitDestino}
                    onChange={(event) => setEmitDestino(event.target.value)}
                    placeholder="Destino (MCO)"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <p className="mb-1 text-[11px] text-muted-foreground">Tipo de viagem</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEmitTipoViagem("somente_ida")}
                        className={cn(
                          "rounded-full border px-2 py-1 text-[11px]",
                          emitTipoViagem === "somente_ida"
                            ? "border-[#E5CCF2] bg-nubank-tint text-nubank-dark"
                            : "border-nubank-border bg-white text-nubank-text-secondary",
                        )}
                      >
                        Apenas ida
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmitTipoViagem("ida_e_volta")}
                        className={cn(
                          "rounded-full border px-2 py-1 text-[11px]",
                          emitTipoViagem === "ida_e_volta"
                            ? "border-[#E5CCF2] bg-nubank-tint text-nubank-dark"
                            : "border-nubank-border bg-white text-nubank-text-secondary",
                        )}
                      >
                        Ida e volta
                      </button>
                    </div>
                  </div>
                  <DatePickerField
                    value={emitDataIda}
                    onChange={(ymd) => {
                      setEmitDataIda(ymd);
                      if (emitDataVolta && emitDataVolta < ymd) setEmitDataVolta("");
                    }}
                    placeholder="Data de ida"
                    triggerClassName="h-8 px-2.5 text-xs"
                    contentClassName="border-nubank-border"
                  />
                  {emitTipoViagem === "ida_e_volta" ? (
                    <DatePickerField
                      value={emitDataVolta}
                      onChange={setEmitDataVolta}
                      placeholder="Data de volta"
                      disabled={
                        emitDataIda
                          ? { before: parseYmdToLocalDate(emitDataIda)! }
                          : undefined
                      }
                      triggerClassName="h-8 px-2.5 text-xs"
                      contentClassName="border-nubank-border"
                    />
                  ) : (
                    <Input
                      type="number"
                      min={1}
                      value={emitPax}
                      onChange={(event) => setEmitPax(Number(event.target.value) || 1)}
                      className="h-8 text-xs"
                      placeholder="Qtd. passageiros"
                    />
                  )}
                </div>
                {emitTipoViagem === "ida_e_volta" && (
                  <Input
                    type="number"
                    min={1}
                    value={emitPax}
                    onChange={(event) => setEmitPax(Number(event.target.value) || 1)}
                    className="h-8 text-xs"
                    placeholder="Qtd. passageiros"
                  />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Select value={emitClasse} onValueChange={setEmitClasse}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Classe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="economica">Econômica</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="executiva">Executiva</SelectItem>
                      <SelectItem value="primeira">Primeira</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={emitBagagem}
                        onChange={(event) => setEmitBagagem(event.target.checked)}
                        className="h-3 w-3 rounded border-nubank-border bg-white text-primary"
                      />
                      Bagagem
                    </label>
                    <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={emitAssento}
                        onChange={(event) => setEmitAssento(event.target.checked)}
                        className="h-3 w-3 rounded border-nubank-border bg-white text-primary"
                      />
                      Assento
                    </label>
                    <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={emitSeguro}
                        onChange={(event) => setEmitSeguro(event.target.checked)}
                        className="h-3 w-3 rounded border-nubank-border bg-white text-primary"
                      />
                      Seguro
                    </label>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    Sobrenome na emissão — obrigatório{" "}
                    <span className="text-destructive">*</span>
                  </p>
                  <Input
                    value={emitSobrenomeEmissao}
                    onChange={(event) => setEmitSobrenomeEmissao(event.target.value)}
                    placeholder="Sobrenome na emissão"
                    className="h-8 text-xs"
                    required
                    aria-required
                    autoComplete="family-name"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Como consta na bilheteira, para localizar a reserva junto ao PNR.
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    Código da reserva (PNR / localizador) — obrigatório{" "}
                    <span className="text-destructive">*</span>
                  </p>
                  <Input
                    value={emitCodigoReserva}
                    onChange={(event) => setEmitCodigoReserva(event.target.value)}
                    placeholder="Ex.: ABC123"
                    className="h-8 text-xs"
                    required
                    aria-required
                  />
                </div>
              </div>

              {/* 2. Dados financeiros */}
              <div className="space-y-2 rounded-2xl bg-nubank-bg p-3">
                <p className="text-[11px] font-medium text-muted-foreground">
                  2. Dados financeiros da emissão
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">
                      Milhas utilizadas *
                    </p>
                    <Input
                      type="number"
                      min={0}
                      value={emitMilhas || ""}
                      onChange={(event) =>
                        setEmitMilhas(Number(event.target.value) || 0)
                      }
                      className="no-spinner h-8 text-xs"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-muted-foreground">
                      Taxas pagas (R$) *
                    </p>
                    <Input
                      type="number"
                      min={0}
                      value={emitTaxas || ""}
                      onChange={(event) =>
                        setEmitTaxas(Number(event.target.value) || 0)
                      }
                      className="no-spinner h-8 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    Tarifa pagante (R$) *
                  </p>
                  <Input
                    type="number"
                    min={0}
                    value={emitTarifaPagante || ""}
                    onChange={(event) =>
                      setEmitTarifaPagante(Number(event.target.value) || 0)
                    }
                    className="no-spinner h-8 text-xs"
                  />
                </div>
              </div>

              {/* 3. Calculadora inteligente */}
              <div className="space-y-2 rounded-2xl bg-nubank-bg p-3">
                <p className="text-[11px] font-medium text-muted-foreground">
                  3. Calculadora inteligente de valor do milheiro
                </p>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <p>
                    Base de custo médio do milheiro:{" "}
                    <span className="font-semibold text-nubank-text">
                      {custoMedioMilheiroReferencia.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </p>
                  <p>
                    Custo da emissão (milhas + taxas):{" "}
                    <span className="font-semibold text-warning-strong">
                      {custoRealEmissaoMilhasETaxas.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </p>
                  <p>
                    Desconto obtido vs tarifa pagante:{" "}
                    <span className="font-semibold text-success-strong">
                      {descontoReal.toFixed(1)}%
                    </span>
                    {" • "}
                    <span className="font-semibold text-success-strong">
                      {economiaRealEmissao.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </p>
                </div>
              </div>

              {/* 4. Resumo estratégico */}
              <div className="space-y-2 rounded-2xl bg-nubank-bg p-3">
                <p className="text-[11px] font-medium text-muted-foreground">
                  4. Resumo estratégico da emissão
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="space-y-1 rounded-2xl bg-white p-2">
                    <p className="text-muted-foreground">Milhas usadas</p>
                    <p className="text-sm font-semibold text-nubank-text">
                      {emitMilhas.toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="space-y-1 rounded-2xl bg-white p-2">
                    <p className="text-muted-foreground">Economia real</p>
                    <p className="text-sm font-semibold text-success-strong">
                      {economiaRealEmissao.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </p>
                  </div>
                  <div className="space-y-1 rounded-2xl bg-white p-2">
                    <p className="text-muted-foreground">Valor do milheiro</p>
                    <p className="text-sm font-semibold text-success-strong">
                      {custoMedioMilheiro.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </p>
                  </div>
                  <div className="space-y-1 rounded-2xl bg-white p-2">
                    <p className="text-muted-foreground">Desconto real</p>
                    <p className="text-sm font-semibold text-success-strong">
                      {descontoReal.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">
                    <p>Classificação da emissão</p>
                    <p className={cn("mt-0.5 text-sm font-semibold", corClassificacao)}>
                      {classificacaoEmissao === "vantajosa"
                        ? "🟢 Abaixo do custo da pagante"
                        : "🔴 Mais caro que tarifa pagante"}
                    </p>
                  </div>
                </div>
              </div>

              {/* 5. Observações */}
              <div className="space-y-2 rounded-2xl bg-nubank-bg p-3">
                <p className="text-[11px] font-medium text-muted-foreground">
                  5. Observações estratégicas
                </p>
                <Textarea
                  value={emitObs}
                  onChange={(event) => setEmitObs(event.target.value)}
                  rows={3}
                  className="text-xs"
                  placeholder="Insights sobre a emissão, aprendizados, contexto etc."
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => setSaidaOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-destructive text-xs font-semibold text-white hover:bg-destructive/90"
                  onClick={handleSalvarSaida}
                >
                  Salvar emissão
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={actionPlanFollowupOpen} onOpenChange={setActionPlanFollowupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Plano de ação</DialogTitle>
            <DialogDescription>
              {actionPlanProgramLabel
                ? `Você finalizou a emissão da passagem que estava no plano de ação. Deseja manter ${actionPlanProgramLabel} como plano de ação para futuras emissões ou tirar do plano de ação?`
                : "Deseja manter este programa no plano de ação para futuras emissões?"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleConfirmActionPlanFollowup(false)}
              disabled={actionPlanFollowupSaving}
            >
              Tirar do plano
            </Button>
            <Button
              type="button"
              onClick={() => void handleConfirmActionPlanFollowup(true)}
              disabled={actionPlanFollowupSaving}
            >
              Manter no plano
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LoyaltyProgramDetails;
