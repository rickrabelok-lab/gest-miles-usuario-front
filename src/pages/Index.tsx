import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calculator,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Plane,
  Plus,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardHeader from "@/components/DashboardHeader";
import BalanceTabs from "@/components/BalanceTabs";
import ProgramCard from "@/components/ProgramCard";
import DestinationCarousel from "@/components/DestinationCarousel";
import BonusPromotionsSection from "@/components/bonus/BonusPromotionsSection";
import BottomNav from "@/components/BottomNav";
import SmartRedemptionSuggestions from "@/components/SmartRedemptionSuggestions";
import NpsClientePrompt from "@/components/nps/NpsClientePrompt";
import CsatClientePrompt from "@/components/csat/CsatClientePrompt";
import ClientTimelineSection from "@/components/timeline/ClientTimelineSection";
import ClientInsightsSection from "@/components/insights/ClientInsightsSection";
import AirlineLogo from "@/components/AirlineLogo";
import { EmissaoResumoCard } from "@/components/emissao/EmissaoResumoCard";
import { cn } from "@/lib/utils";
import { ProgramSelectionSheet } from "@/components/ProgramSelectionSheet";
import { SolicitarCotacaoWizard, type WizardSubmitParams } from "@/components/SolicitarCotacaoWizard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useProgramasCliente } from "@/hooks/useProgramasCliente";
import { useBrandingConfig } from "@/hooks/useBrandingConfig";
import { supabase } from "@/lib/supabase";
import { CARD_DESTINATION_TO_AIRPORT_CODE } from "@/lib/airports";
import type { PersistedProgramState } from "@/lib/program-state";
import { deliverPdf, renderElementToA4Pdf } from "@/lib/pdfDelivery";
import airlineLatamLogo from "@/assets/airline-latam.png";
import airlineAzulLogo from "@/assets/airline-azul.png";
import airlineGolLogo from "@/assets/airline-gol.png";
import programAviosLogo from "@/assets/program-avios.svg";

const STORAGE_PREFIX = "mile-manager:program-state:";
const LOGO_STORAGE_PREFIX = "mile-manager:program-logo:";
const PROGRAM_CARDS_STORAGE_KEY = "mile-manager:program-cards";
const MIGRATION_FLAG_PREFIX = "mile-manager:migration:v1:";
const ORIGINS_STORAGE_PREFIX = "mile-manager:enabled-origins:";
const DEFAULT_ENABLED_ORIGINS = ["BHZ", "SAO", "RIO", "BSB"];
type SelectedDestinationSearch = {
  code: string;
  name: string;
};

type ProgramCardData = {
  programId: string;
  name: string;
  logo: string;
  logoColor: string;
  logoImageUrl?: string;
  balance: string;
  valueInBRL: string;
  lastUpdate: string;
  variation: "up" | "down" | "none";
  error?: string;
  expiring?: boolean;
  expiringTag?: "-90d" | "-60d" | "-30d";
};

type MovimentoTipo = "entrada" | "saida";

type ProgramMeta = {
  slug: string;
  name: string;
  logo: string;
  logoColor: string;
};

type ActionPlanDemandRow = {
  id: number;
  tipo: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type ActionPlanDemandItem = {
  id: number;
  origem: string | null;
  destino: string;
  status: string;
  createdAt: string;
};

const ACTION_PLAN_PROGRAM_LABELS = [
  ["latam", "Latam Pass"],
  ["azul", "Tudo Azul"],
  ["smiles", "Smiles"],
  ["avios", "Avios"],
] as const;

type ActionPlanProgramKey = (typeof ACTION_PLAN_PROGRAM_LABELS)[number][0];

const ACTION_PLAN_PROGRAM_ICON_BY_KEY: Partial<Record<ActionPlanProgramKey, string>> = {
  latam: airlineLatamLogo,
  azul: airlineAzulLogo,
  smiles: airlineGolLogo,
  avios: programAviosLogo,
};
const ACTION_PLAN_AIRLINE_BY_KEY: Partial<Record<ActionPlanProgramKey, string>> = {
  latam: "LATAM",
  azul: "AZUL",
  smiles: "GOL",
};

const DEMAND_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
const ACTION_PLAN_BUTTON_MAX_ICONS = 3;

type DemandGestorOption = {
  id: string;
  nome: string;
  perfil: "nacional" | "internacional";
};

const getDemandGestoresErrorMessage = (error: unknown) => {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          "message" in error &&
          typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";

  if (rawMessage.trim()) {
    console.warn("[Index] Falha ao carregar gestores da demanda", error);
  }

  return "Nao foi possivel carregar os gestores desta demanda.";
};

type VencimentoItem = {
  programSlug: string;
  programName: string;
  programLogo: string;
  programLogoColor: string;
  data: string;
  diasRestantes: number;
  quantidade: number;
};

type ExtratoItem = {
  id: string;
  /** `program_id` no Supabase — alinhado à carteira / APIs. */
  programId: string;
  programSlug: string;
  programName: string;
  programLogo: string;
  programLogoColor: string;
  /** Referência para ordenação (geralmente data do voo ou data do lançamento). */
  data: string;
  /** Valor bruto para exibir como data do voo (saídas). */
  dataVoo: string;
  /** Data em que a emissão foi registrada. */
  dataEmissao: string;
  dataVolta?: string;
  tipo: MovimentoTipo;
  descricao: string;
  milhas: number;
  origem?: string;
  destino?: string;
  taxas?: number;
  tarifaPagante?: number;
  economiaReal?: number;
  economiaPercent?: number;
  emissaoFornecedor?: boolean;
  custoFornecedor?: number;
  codigoReserva?: string;
  custoTotalEmissao?: number;
  sobrenomeEmissao?: string;
};

type EmissaoEconomiaItem = {
  id: string;
  programName: string;
  programLogo: string;
  programLogoColor: string;
  data: string;
  descricao: string;
  milhas: number;
  tarifaPagante: number;
  custoReal: number;
  economiaReal: number;
};

type CompraPontosItem = {
  id: string;
  programName: string;
  programLogo: string;
  programLogoColor: string;
  data: string;
  milhas: number;
  valorPago: number;
  custoMilheiro: number;
  descricao: string;
};

/** Resumo em dialog (clique nos cards de extrato / economia). */
type ResumoClientePayload = (
  | { kind: "extrato"; item: ExtratoItem }
  | { kind: "emissao"; item: EmissaoEconomiaItem }
  | { kind: "compra"; item: CompraPontosItem }
) & { gestorResponsavel?: string };

const PROGRAM_META_MAP: Record<string, Omit<ProgramMeta, "slug">> = {
  "latam-pass": { name: "LATAM Pass", logo: "LP", logoColor: "#1a3a6b" },
  livelo: { name: "Livelo", logo: "Lv", logoColor: "#e91e63" },
  esfera: { name: "Esfera", logo: "Es", logoColor: "#333333" },
  smiles: { name: "Smiles", logo: "Sm", logoColor: "#f59e42" },
  kmv: { name: "KMV", logo: "KM", logoColor: "#0046AD" },
  "tudo-azul": { name: "Tudo Azul", logo: "TA", logoColor: "#1d4ed8" },
  iberia: { name: "Ibéria", logo: "IB", logoColor: "#b91c1c" },
  "copa-airlines": { name: "Copa Airlines", logo: "CM", logoColor: "#00458c" },
  finnair: { name: "Finnair", logo: "FN", logoColor: "#2563eb" },
  "qatar-airways": { name: "Qatar Airways", logo: "QA", logoColor: "#5a1f3d" },
  "british-airways": { name: "British Airways", logo: "BA", logoColor: "#0f2f6d" },
  coopera: { name: "Coopera", logo: "CP", logoColor: "#2d6a4f" },
  tap: { name: "TAP Miles&Go", logo: "TP", logoColor: "#66aa00" },
  "all-accor": { name: "ALL Accor", logo: "AL", logoColor: "#c2a055" },
  "american-airlines": { name: "AAdvantage (AA)", logo: "AA", logoColor: "#0066B2" },
  "uau-caixa": { name: "Uau Caixa", logo: "UC", logoColor: "#005CA9" },
  "brb-dux": { name: "BRB Dux", logo: "BD", logoColor: "#004225" },
  "atomos-c6": { name: "Átomos C6", logo: "At", logoColor: "#1a1a1a" },
  itau: { name: "Itaú", logo: "It", logoColor: "#EC7000" },
  "inter-loop": { name: "Inter Loop", logo: "IL", logoColor: "#FF6B00" },
  amex: { name: "Amex Rewards", logo: "Am", logoColor: "#006FCF" },
};

const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, "-");

const prettyNameFromSlug = (slug: string) =>
  slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getProgramMetaFromSlug = (slug: string): ProgramMeta => {
  const known = PROGRAM_META_MAP[slug];
  if (known) return { slug, ...known };

  const name = prettyNameFromSlug(slug);
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return {
    slug,
    name,
    logo: initials || "PG",
    logoColor: "#64748b",
  };
};

const parseBrDate = (value?: string) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(value)) {
    const [dd, mm, yy] = value.split("/");
    const year = yy.length === 2 ? Number(`20${yy}`) : Number(yy);
    const d = new Date(year, Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

function formatExtratoDate(value?: string): string {
  if (!value?.trim()) return "—";
  const d = parseBrDate(value);
  if (!d) return value.trim();
  return d.toLocaleDateString("pt-BR");
}

const brlInteiro = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Mesmo id estável usado na lista do extrato quando `mov.id` não veio persistido. */
function stableExtratoMovimentoId(
  mov: { id?: string; data?: string; descricao?: string },
  meta: ProgramMeta,
): string {
  return mov.id ?? `${meta.slug}-${mov.data ?? "sem-data"}-${mov.descricao ?? "mov"}`;
}

function parseIataRouteFromText(text: string): { origem: string; destino: string } {
  const m = text.match(/([A-Za-z]{3})\s*[–—-]\s*([A-Za-z]{3})/);
  if (m) return { origem: m[1].toUpperCase(), destino: m[2].toUpperCase() };
  return { origem: "—", destino: "—" };
}

function resumoClienteLinha(label: string, value: ReactNode) {
  return (
    <div className="border-b border-border/60 py-2.5 last:border-0">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function ResumoParaClienteBody({
  payload,
  equipeNome,
}: {
  payload: ResumoClientePayload;
  equipeNome?: string | null;
}) {
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (payload.kind === "emissao") {
    const e = payload.item;
    const route = parseIataRouteFromText(e.descricao);
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F0EBF7]/30 py-2 [-webkit-overflow-scrolling:touch]">
        <div className="flex justify-center px-1 pb-1">
          <EmissaoResumoCard
            variant="dialog"
            equipeNome={equipeNome ?? undefined}
            gestorResponsavel={payload.gestorResponsavel}
            programa={e.programName}
            descricao={e.descricao}
            tipoPill="Emissão · Saída de Milhas"
            milhas={-Math.abs(e.milhas)}
            origem={route.origem}
            destino={route.destino}
            companhia={e.programName}
            dataDocumento={formatExtratoDate(e.data)}
            dataEmissao="—"
            dataVooIda="—"
            dataVooVolta="—"
            tarifaPagante={e.tarifaPagante}
            custoReal={e.custoReal}
            economiaReal={e.economiaReal}
          />
        </div>
      </div>
    );
  }

  if (payload.kind === "extrato" && payload.item.tipo === "saida") {
    const item = payload.item;
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F0EBF7]/30 py-2 [-webkit-overflow-scrolling:touch]">
        <div className="flex justify-center px-1 pb-1">
          <EmissaoResumoCard
            variant="dialog"
            equipeNome={equipeNome ?? undefined}
            gestorResponsavel={payload.gestorResponsavel}
            programa={item.programName}
            descricao={item.descricao}
            tipoPill="Emissão · Saída de Milhas"
            milhas={item.milhas}
            origem={item.origem?.trim() ? item.origem.toUpperCase() : "—"}
            destino={item.destino?.trim() ? item.destino.toUpperCase() : "—"}
            companhia={item.programName}
            dataDocumento={formatExtratoDate(item.dataEmissao || item.data)}
            dataEmissao={formatExtratoDate(item.dataEmissao)}
            dataVooIda={formatExtratoDate(item.dataVoo)}
            dataVooVolta={item.dataVolta ? formatExtratoDate(item.dataVolta) : "—"}
            taxas={item.taxas}
            tarifaPagante={item.tarifaPagante}
            economiaReal={item.economiaReal}
          />
        </div>
      </div>
    );
  }

  if (payload.kind === "compra") {
    const c = payload.item;
    return (
      <div className="max-h-[min(70dvh,520px)] overflow-y-auto pr-1">
        {payload.gestorResponsavel
          ? resumoClienteLinha("Gestor responsável", payload.gestorResponsavel)
          : null}
        {resumoClienteLinha("Programa", c.programName)}
        {resumoClienteLinha("Data", formatExtratoDate(c.data))}
        {resumoClienteLinha("Descrição", c.descricao)}
        {resumoClienteLinha(
          "Milhas",
          <span className="tabular-nums">{c.milhas.toLocaleString("pt-BR")}</span>,
        )}
        {resumoClienteLinha("Valor pago", <span className="tabular-nums">{brl(c.valorPago)}</span>)}
        {resumoClienteLinha(
          "Custo por milheiro",
          <span className="tabular-nums font-semibold text-amber-800">{brl(c.custoMilheiro)}</span>,
        )}
      </div>
    );
  }

  const item = payload.item;
  return (
    <div className="max-h-[min(70dvh,560px)] overflow-y-auto pr-1">
      {payload.gestorResponsavel
        ? resumoClienteLinha("Gestor responsável", payload.gestorResponsavel)
        : null}
      {resumoClienteLinha("Programa", item.programName)}
      {resumoClienteLinha("Descrição", item.descricao)}
      {resumoClienteLinha("Tipo", "Compra / entrada de milhas")}
      {resumoClienteLinha(
        "Milhas",
        <span className="tabular-nums">
          +
          {Math.abs(item.milhas).toLocaleString("pt-BR")}
        </span>,
      )}
      {resumoClienteLinha("Data do lançamento", formatExtratoDate(item.data))}
    </div>
  );
}

function resumoClienteDialogTitle(p: ResumoClientePayload): string {
  if (p.kind === "compra") return "Resumo da compra de pontos";
  if (p.kind === "emissao") return "Resumo da emissão";
  return p.item.tipo === "saida" ? "Resumo da emissão" : "Resumo da compra de milhas";
}

function resumoClienteMostraCardEmissao(p: ResumoClientePayload | null): boolean {
  if (!p) return false;
  if (p.kind === "emissao") return true;
  return p.kind === "extrato" && p.item.tipo === "saida";
}

const AVAILABLE_PROGRAM_OPTIONS: Array<{
  programId: string;
  name: string;
  logo: string;
  logoColor: string;
}> = [
  {
    programId: "latam-pass",
    name: "Latam Pass",
    logo: "LP",
    logoColor: "#1a3a6b",
  },
  {
    programId: "livelo",
    name: "Livelo",
    logo: "Lv",
    logoColor: "#e91e63",
  },
  {
    programId: "esfera",
    name: "Esfera",
    logo: "Es",
    logoColor: "#333333",
  },
  {
    programId: "smiles",
    name: "Smiles",
    logo: "Sm",
    logoColor: "#f59e42",
  },
  {
    programId: "iberia",
    name: "Ibéria",
    logo: "IB",
    logoColor: "#b91c1c",
  },
  {
    programId: "tudo-azul",
    name: "Tudo azul",
    logo: "TA",
    logoColor: "#1d4ed8",
  },
  {
    programId: "finnair",
    name: "Finnair",
    logo: "FN",
    logoColor: "#2563eb",
  },
  {
    programId: "qatar-airways",
    name: "Qatar Airways",
    logo: "QA",
    logoColor: "#5a1f3d",
  },
  {
    programId: "british-airways",
    name: "British Airways",
    logo: "BA",
    logoColor: "#0f2f6d",
  },
  {
    programId: "copa-airlines",
    name: "Copa Airlines",
    logo: "CM",
    logoColor: "#00458c",
  },
  {
    programId: "coopera",
    name: "Coopera",
    logo: "CP",
    logoColor: "#2d6a4f",
  },
  {
    programId: "tap",
    name: "TAP Miles&Go",
    logo: "TP",
    logoColor: "#66aa00",
  },
  {
    programId: "all-accor",
    name: "ALL Accor",
    logo: "AL",
    logoColor: "#c2a055",
  },
  {
    programId: "american-airlines",
    name: "AAdvantage (AA)",
    logo: "AA",
    logoColor: "#0066B2",
  },
  {
    programId: "kmv",
    name: "KMV",
    logo: "KM",
    logoColor: "#0046AD",
  },
  {
    programId: "uau-caixa",
    name: "Uau Caixa",
    logo: "UC",
    logoColor: "#005CA9",
  },
  {
    programId: "brb-dux",
    name: "BRB Dux",
    logo: "BD",
    logoColor: "#004225",
  },
  {
    programId: "atomos-c6",
    name: "Átomos C6",
    logo: "At",
    logoColor: "#1a1a1a",
  },
  {
    programId: "itau",
    name: "Itaú",
    logo: "It",
    logoColor: "#EC7000",
  },
  {
    programId: "inter-loop",
    name: "Inter Loop",
    logo: "IL",
    logoColor: "#FF6B00",
  },
  {
    programId: "amex",
    name: "Amex Rewards",
    logo: "Am",
    logoColor: "#006FCF",
  },
];

const basePrograms: ProgramCardData[] = AVAILABLE_PROGRAM_OPTIONS.filter((option) =>
  ["latam-pass", "livelo", "esfera", "smiles", "iberia", "tudo-azul"].includes(
    option.programId,
  ),
).map((option) => ({
  programId: option.programId,
  name: option.name,
  logo: option.logo,
  logoColor: option.logoColor,
  balance: "0",
  valueInBRL: "0",
  lastUpdate: "CPM",
  variation: "none" as const,
}));

const getProgramInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "PG";

const normalizeProgramCards = (value: unknown): ProgramCardData[] => {
  if (!Array.isArray(value)) return basePrograms;
  const validIds = new Set(AVAILABLE_PROGRAM_OPTIONS.map((option) => option.programId));

  const normalized = value
    .map((item): ProgramCardData | null => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<ProgramCardData>;
      if (
        typeof candidate.programId !== "string" ||
        typeof candidate.name !== "string"
      ) {
        return null;
      }
      if (!validIds.has(candidate.programId)) {
        return null;
      }

      return {
        programId: candidate.programId,
        name: candidate.name,
        logo: typeof candidate.logo === "string" ? candidate.logo : getProgramInitials(candidate.name),
        logoColor:
          typeof candidate.logoColor === "string" ? candidate.logoColor : "#64748b",
        logoImageUrl:
          typeof candidate.logoImageUrl === "string"
            ? candidate.logoImageUrl
            : undefined,
        balance: typeof candidate.balance === "string" ? candidate.balance : "0",
        valueInBRL: typeof candidate.valueInBRL === "string" ? candidate.valueInBRL : "0",
        lastUpdate:
          typeof candidate.lastUpdate === "string" ? candidate.lastUpdate : "CPM",
        variation:
          candidate.variation === "up" ||
          candidate.variation === "down" ||
          candidate.variation === "none"
            ? candidate.variation
            : "none",
        error: typeof candidate.error === "string" ? candidate.error : undefined,
        expiring: Boolean(candidate.expiring),
        expiringTag:
          candidate.expiringTag === "-30d" ||
          candidate.expiringTag === "-60d" ||
          candidate.expiringTag === "-90d"
            ? candidate.expiringTag
            : undefined,
      };
    })
    .filter((item): item is ProgramCardData => !!item);

  return normalized.length > 0 ? normalized : basePrograms;
};

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role, user } = useAuth();
  const brandingConfig = useBrandingConfig();
  const advancedClientId = role === "cliente_gestao" ? user?.id ?? null : null;
  const canShowTimeline = role === "cliente_gestao" && !!user?.id;
  const canShowInsights = false;
  const demandTargetClientId = user?.id ?? null;
  const [activeTab, setActiveTab] = useState("saldo");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (searchParams.get("view") !== "programas") return;
    setActiveTab("saldo");
    const t = window.setTimeout(() => {
      document.getElementById("meus-programas")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
    return () => clearTimeout(t);
  }, [searchParams]);
  const [programDefs, setProgramDefs] = useState<ProgramCardData[]>(basePrograms);
  const [programs, setPrograms] = useState<ProgramCardData[]>(basePrograms);
  const [economiaPeriodoMeses, setEconomiaPeriodoMeses] = useState<1 | 6 | 12>(12);
  const [isAddProgramMenuOpen, setIsAddProgramMenuOpen] = useState(false);
  const [isDemandDialogOpen, setIsDemandDialogOpen] = useState(false);
  const [demandSubmitting, setDemandSubmitting] = useState(false);
  const [demandaGestores, setDemandaGestores] = useState<DemandGestorOption[]>([]);
  const [demandGestoresLoading, setDemandGestoresLoading] = useState(false);
  const [demandGestoresError, setDemandGestoresError] = useState<string | null>(null);
  const [actionPlanProgramKeys, setActionPlanProgramKeys] = useState<ActionPlanProgramKey[]>([]);
  const [actionPlanDemands, setActionPlanDemands] = useState<ActionPlanDemandItem[]>([]);
  const [actionPlanError, setActionPlanError] = useState<string | null>(null);
  const [optionLogoImages, setOptionLogoImages] = useState<Record<string, string>>(
    {},
  );
  const [enabledOrigins, setEnabledOrigins] = useState<string[]>(DEFAULT_ENABLED_ORIGINS);
  const economiaReportRef = useRef<HTMLDivElement | null>(null);
  const vencendoSectionRef = useRef<HTMLDivElement | null>(null);
  const {
    byProgramId: remoteByProgramId,
    data: remotePrograms,
    saveProgramState,
  } = useProgramasCliente(null);

  const [resumoCliente, setResumoCliente] = useState<ResumoClientePayload | null>(null);

  const dataOwnerId: string | null = user?.id ?? null;

  useEffect(() => {
    if (typeof window === "undefined" || !dataOwnerId) {
      if (!dataOwnerId) setEnabledOrigins(DEFAULT_ENABLED_ORIGINS);
      return;
    }
    const key = `${ORIGINS_STORAGE_PREFIX}${dataOwnerId}`;
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      setEnabledOrigins(DEFAULT_ENABLED_ORIGINS);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setEnabledOrigins(DEFAULT_ENABLED_ORIGINS);
        return;
      }

      const sanitized = parsed
        .map((item) => String(item).trim().toUpperCase())
        .filter(Boolean);
      setEnabledOrigins(sanitized.length > 0 ? sanitized : DEFAULT_ENABLED_ORIGINS);
    } catch {
      setEnabledOrigins(DEFAULT_ENABLED_ORIGINS);
    }
  }, [dataOwnerId]);

  /** Logos no seletor: globais (admin_master / «Marca e imagens») + eventual override local legacy. */
  const programLogoImagesForSheet = useMemo(() => {
    const out: Record<string, string> = { ...brandingConfig.data.programCardLogos };
    for (const [k, v] of Object.entries(optionLogoImages)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  }, [brandingConfig.data.programCardLogos, optionLogoImages]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!dataOwnerId) {
      setProgramDefs(basePrograms);
      setPrograms(basePrograms);
      return;
    }
    const key = `${PROGRAM_CARDS_STORAGE_KEY}${dataOwnerId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      setProgramDefs(basePrograms);
      setPrograms(basePrograms);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeProgramCards(parsed);
      setProgramDefs(normalized);
      setPrograms(normalized);
    } catch {
      setProgramDefs(basePrograms);
      setPrograms(basePrograms);
    }
  }, [dataOwnerId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!dataOwnerId) {
      setOptionLogoImages({});
      return;
    }

    const hydrateOptionLogos = () => {
      const next: Record<string, string> = {};
      AVAILABLE_PROGRAM_OPTIONS.forEach((option) => {
        const stored = window.localStorage.getItem(
          `${LOGO_STORAGE_PREFIX}${dataOwnerId}:${option.programId}`,
        );
        if (stored) next[option.programId] = stored;
      });
      setOptionLogoImages(next);
    };

    hydrateOptionLogos();
    window.addEventListener("storage", hydrateOptionLogos);
    return () => window.removeEventListener("storage", hydrateOptionLogos);
  }, [dataOwnerId]);

  useEffect(() => {
    const hydrateProgramsFromStorage = () => {
      if (typeof window === "undefined") return;
      if (!dataOwnerId) {
        setPrograms(basePrograms);
        return;
      }

      const nextPrograms = programDefs.map((program) => {
        const slug = program.programId;
        const nameSlug = slugify(program.name);
        const remoteRow = remoteByProgramId.get(slug);
        const storedLogoImage = window.localStorage.getItem(
          `${LOGO_STORAGE_PREFIX}${dataOwnerId}:${slug}`,
        );
        const globalProgramLogo = brandingConfig.data.programCardLogos[slug]?.trim();
        const resolveCardLogo = () => {
          const r = remoteRow?.logo_image_url?.trim();
          if (r) return r;
          if (storedLogoImage?.trim()) return storedLogoImage;
          if (globalProgramLogo) return globalProgramLogo;
          return undefined;
        };
        const storageKey = `${STORAGE_PREFIX}${dataOwnerId}:${slug}:${nameSlug}`;
        const raw = window.localStorage.getItem(storageKey);
        const remoteRaw = remoteRow?.state
          ? JSON.stringify(remoteRow.state)
          : null;
        const sourceRaw = remoteRaw ?? raw;

        if (!sourceRaw) {
          return {
            ...program,
            logoImageUrl: resolveCardLogo(),
          };
        }

        try {
          const parsed = JSON.parse(sourceRaw) as PersistedProgramState;
          const saldo = typeof parsed.saldo === "number" ? parsed.saldo : 0;
          const custoMedio =
            typeof parsed.custoMedioMilheiro === "number"
              ? parsed.custoMedioMilheiro
              : 0;
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          const expiringDays = (parsed.movimentos ?? [])
            .filter((mov) => mov.tipo === "entrada" && !!mov.validadeLote && (mov.milhas ?? 0) > 0)
            .map((mov) => {
              const validade = new Date(`${mov.validadeLote}T00:00:00`);
              return Math.ceil(
                (validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
              );
            })
            .filter((days) => days >= 0 && days <= 90);

          const hasExpiringMiles = expiringDays.length > 0;
          const nearestExpiringDays = hasExpiringMiles
            ? Math.min(...expiringDays)
            : null;
          const expiringTag: ProgramCardData["expiringTag"] =
            nearestExpiringDays === null
              ? undefined
              : nearestExpiringDays <= 30
                ? "-30d"
                : nearestExpiringDays <= 60
                  ? "-60d"
                  : "-90d";
          const showExpiring = false;

          const ultimoMovimentoTipo = parsed.movimentos?.[0]?.tipo;
          const variation: ProgramCardData["variation"] =
            ultimoMovimentoTipo === "saida"
              ? "down"
              : ultimoMovimentoTipo === "entrada"
                ? "up"
                : "none";

          return {
            ...program,
            logoImageUrl: resolveCardLogo(),
            balance: saldo.toLocaleString("pt-BR"),
            // Exibe no card o custo médio por milheiro informado na tela interna.
            valueInBRL: custoMedio.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            variation,
            expiring: showExpiring,
            error: showExpiring ? "Milhas a vencer" : program.error,
            expiringTag: showExpiring ? expiringTag : undefined,
          };
        } catch {
          return program;
        }
      });

      setPrograms(nextPrograms);
    };

    hydrateProgramsFromStorage();
    window.addEventListener("focus", hydrateProgramsFromStorage);
    window.addEventListener("storage", hydrateProgramsFromStorage);

    return () => {
      window.removeEventListener("focus", hydrateProgramsFromStorage);
      window.removeEventListener("storage", hydrateProgramsFromStorage);
    };
  }, [programDefs, remoteByProgramId, dataOwnerId, brandingConfig.data]);

  useEffect(() => {
    if (!user?.id) return;
    if (typeof window === "undefined") return;

    const migrationKey = `${MIGRATION_FLAG_PREFIX}${user.id}`;
    const alreadyMigrated = window.localStorage.getItem(migrationKey) === "1";
    if (alreadyMigrated) return;

    const runMigration = async () => {
      for (const program of programDefs) {
        const slug = program.programId;
        const nameSlug = slugify(program.name);
        // Só migra dados do próprio usuário (chave com user.id). Nunca migrar da chave antiga
        // sem user id, para não copiar dados de outro usuário para a conta nova.
        const storageKey = `${STORAGE_PREFIX}${user.id}:${slug}:${nameSlug}`;
        const rawState = window.localStorage.getItem(storageKey);
        if (!rawState) continue;

        try {
          const parsed = JSON.parse(rawState) as PersistedProgramState;
          const hasMeaningfulData =
            Number(parsed.saldo ?? 0) > 0 ||
            Number(parsed.custoSaldo ?? 0) > 0 ||
            Number(parsed.custoMedioMilheiro ?? 0) > 0 ||
            (parsed.movimentos?.length ?? 0) > 0 ||
            (parsed.lotes?.length ?? 0) > 0;

          if (!hasMeaningfulData) continue;

          const logoImage =
            window.localStorage.getItem(`${LOGO_STORAGE_PREFIX}${user.id}:${slug}`) ?? null;

          await saveProgramState({
            programId: slug,
            programName: program.name,
            logo: program.logo,
            logoColor: program.logoColor,
            logoImageUrl: logoImage,
            state: {
              saldo: Number(parsed.saldo ?? 0),
              custoSaldo: Number(parsed.custoSaldo ?? 0),
              custoMedioMilheiro: Number(parsed.custoMedioMilheiro ?? 0),
              movimentos: Array.isArray(parsed.movimentos) ? parsed.movimentos : [],
              lotes: Array.isArray(parsed.lotes) ? parsed.lotes : [],
            },
          });
        } catch {
          // ignora item corrompido sem quebrar migração total
        }
      }

      window.localStorage.setItem(migrationKey, "1");
    };

    void runMigration();
  }, [user?.id, programDefs, saveProgramState]);

  const handleToggleProgramCard = (
    option: (typeof AVAILABLE_PROGRAM_OPTIONS)[number],
  ) => {
    if (!dataOwnerId) return;
    const jaExiste = programDefs.some((program) => program.programId === option.programId);

    setProgramDefs((prev) => {
      const next = jaExiste
        ? prev.filter((program) => program.programId !== option.programId)
        : [
            {
              programId: option.programId,
              name: option.name,
              logo: option.logo || getProgramInitials(option.name),
              logoColor: option.logoColor,
              balance: "0",
              valueInBRL: "0",
              lastUpdate: "CPM",
              variation: "none" as const,
            },
            ...prev,
          ];
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          PROGRAM_CARDS_STORAGE_KEY + dataOwnerId,
          JSON.stringify(next),
        );
      }
      return next;
    });
    setShowAll(true);
  };

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

      const { error } = await supabase.rpc("cliente_criar_demanda", {
        p_cliente_id: demandTargetClientId,
        p_tipo: params.tipo,
        p_payload: payload,
      });
      if (error) throw error;

      toast.success("Demanda enviada para o gestor com sucesso.");
      setIsDemandDialogOpen(false);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Erro ao enviar demanda.";
      console.warn("[Index] Falha ao enviar demanda", err);
      const msg = /row-level security|permission denied|new row violates/i.test(rawMsg)
        ? "Sem permissão para abrir demanda para este cliente. Verifique o vínculo do gestor com a equipe."
        : "Não foi possível enviar a demanda agora. Tente novamente em instantes.";
      toast.error(msg);
    } finally {
      setDemandSubmitting(false);
    }
  };

  const handleSearchEmissionFromDestinationCard = ({
    code,
  }: SelectedDestinationSearch) => {
    const destinationAirportCode = CARD_DESTINATION_TO_AIRPORT_CODE[code] ?? code;
    navigate(`/search-flights?destination=${encodeURIComponent(destinationAirportCode)}`);
  };

  const visiblePrograms = showAll ? programs : programs.slice(0, 4);

  const saudacaoLabel = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  }, []);

  const clienteFirstName = useMemo(() => {
    const meta = (user?.user_metadata as Record<string, unknown> | undefined)?.full_name;
    const base =
      typeof meta === "string" && meta.trim() ? meta.trim() : (user?.email?.split("@")[0] ?? "");
    const first = base.split(/[\s._-]+/)[0] ?? "";
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
  }, [user]);

  const loadDemandGestores = useCallback(async () => {
    if (!isDemandDialogOpen || !demandTargetClientId) return;

    const inferPerfil = (nome: string, tema: Record<string, unknown>) => {
      const raw = String(tema?.gestorPerfilDemanda ?? tema?.especialidadeGestor ?? "")
        .trim()
        .toLowerCase();
      if (raw === "nacional" || raw === "internacional") return raw as "nacional" | "internacional";
      // Regra operacional atual: Silmaria/Silmara atua como gestora internacional.
      if (/silmaria|silmara/i.test(nome)) return "internacional";
      return /internacional/i.test(nome) ? "internacional" : "nacional";
    };

    setDemandGestoresLoading(true);
    setDemandGestoresError(null);

    try {
      const { data: links, error: linksErr } = await supabase
        .from("cliente_gestores")
        .select("gestor_id")
        .eq("cliente_id", demandTargetClientId);
      if (linksErr) {
        throw linksErr;
      }
      const gestorIds = [...new Set((links ?? []).map((l) => l.gestor_id as string).filter(Boolean))];
      if (gestorIds.length === 0) {
        setDemandaGestores([]);
        return;
      }

      const { data: perfis, error: perfisErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo, configuracao_tema")
        .in("usuario_id", gestorIds);
      if (perfisErr) {
        throw perfisErr;
      }

      const options = (perfis ?? [])
        .map((p) => {
          const nome = String(p.nome_completo ?? "Gestor").trim() || "Gestor";
          const tema = (p.configuracao_tema ?? {}) as Record<string, unknown>;
          return {
            id: String(p.usuario_id ?? ""),
            nome,
            perfil: inferPerfil(nome, tema),
          } satisfies DemandGestorOption;
        })
        .filter((p) => p.id)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      setDemandaGestores(options);
    } catch (error) {
      setDemandaGestores([]);
      setDemandGestoresError(getDemandGestoresErrorMessage(error));
    } finally {
      setDemandGestoresLoading(false);
    }
  }, [isDemandDialogOpen, demandTargetClientId]);

  useEffect(() => {
    void loadDemandGestores();
  }, [loadDemandGestores]);

  const actionPlanSelectedPrograms = useMemo(() => {
    return actionPlanProgramKeys.map((key) => {
      const label =
        ACTION_PLAN_PROGRAM_LABELS.find(([programKey]) => programKey === key)?.[1]
        ?? "Plano de Ação";
      const fallbackIcon = label
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      return {
        key,
        label,
        iconSrc: ACTION_PLAN_PROGRAM_ICON_BY_KEY[key],
        fallbackIcon: fallbackIcon || "PA",
      };
    });
  }, [actionPlanProgramKeys]);

  const actionPlanButtonIcons = useMemo(
    () => actionPlanSelectedPrograms.slice(0, ACTION_PLAN_BUTTON_MAX_ICONS),
    [actionPlanSelectedPrograms],
  );
  const actionPlanButtonOverflowCount = Math.max(
    0,
    actionPlanSelectedPrograms.length - ACTION_PLAN_BUTTON_MAX_ICONS,
  );

  useEffect(() => {
    if (!demandTargetClientId) return;
    let isMounted = true;

    const loadActionPlan = async () => {
      setActionPlanError(null);

      try {
        const perfilPromise = supabase
          .from("perfis")
          .select("configuracao_tema")
          .eq("usuario_id", demandTargetClientId)
          .limit(1);

        setActionPlanDemands([]);
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : typeof error === "object" && error !== null && "message" in error
              ? String((error as { message: unknown }).message)
              : "Erro ao carregar plano de ação.";
        setActionPlanError(msg);
      }
    };

    void loadActionPlan();

    return () => {
      isMounted = false;
    };
  }, [demandTargetClientId]);

  const programMetaBySlug = useMemo(() => {
    const bySlug = new Map<string, ProgramMeta>();
    programDefs.forEach((program) => {
      const slug = program.programId;
      if (!bySlug.has(slug)) {
        bySlug.set(slug, {
          slug,
          name: program.name,
          logo: program.logo,
          logoColor: program.logoColor,
        });
      }
    });
    return bySlug;
  }, [programDefs]);

  const allPersistedPrograms = useMemo(() => {
    if (!dataOwnerId || !remotePrograms || remotePrograms.length === 0) {
      return [] as Array<{ meta: ProgramMeta; state: PersistedProgramState }>;
    }

    return remotePrograms
      .filter((row) => row.cliente_id === user?.id)
      .map((row) => {
        const state = row.state as PersistedProgramState | null;
        if (!state) return null;
        const meta = programMetaBySlug.get(row.program_id) ?? {
          slug: row.program_id,
          name: row.program_name,
          logo: row.logo ?? getProgramInitials(row.program_name),
          logoColor: row.logo_color ?? "#64748b",
        };
        return { meta, state };
      })
      .filter(
        (item): item is { meta: ProgramMeta; state: PersistedProgramState } =>
          !!item,
      );
  }, [programMetaBySlug, remotePrograms, dataOwnerId, user?.id]);

  const vencimentosGlobais = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const msDia = 1000 * 60 * 60 * 24;
    const items: VencimentoItem[] = [];

    allPersistedPrograms.forEach(({ meta, state }) => {
      const lotes = (state.lotes ?? [])
        .filter((l) => !!l.validadeLote && (l.quantidade ?? 0) > 0)
        .map((l) => ({
          validadeLote: l.validadeLote as string,
          quantidade: Number(l.quantidade ?? 0),
        }));

      const fallbackLotes =
        lotes.length > 0
          ? lotes
          : (state.movimentos ?? [])
              .filter(
                (mov) =>
                  mov.tipo === "entrada" &&
                  !!mov.validadeLote &&
                  Number(mov.milhas ?? 0) > 0,
              )
              .map((mov) => ({
                validadeLote: mov.validadeLote as string,
                quantidade: Number(mov.milhas ?? 0),
              }));

      fallbackLotes.forEach((lote) => {
        const validade = new Date(`${lote.validadeLote}T00:00:00`);
        if (Number.isNaN(validade.getTime())) return;
        const diasRestantes = Math.ceil((validade.getTime() - hoje.getTime()) / msDia);
        items.push({
          programSlug: meta.slug,
          programName: meta.name,
          programLogo: meta.logo,
          programLogoColor: meta.logoColor,
          data: validade.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
          diasRestantes,
          quantidade: lote.quantidade,
        });
      });
    });

    return items
      .filter((i) => i.diasRestantes > 0)
      .sort((a, b) => a.diasRestantes - b.diasRestantes);
  }, [allPersistedPrograms]);

  const vencimentosBands = useMemo(
    () => ({
      critico: vencimentosGlobais.filter((i) => i.diasRestantes <= 30),
      atencao: vencimentosGlobais.filter((i) => i.diasRestantes > 30 && i.diasRestantes <= 60),
      ok: vencimentosGlobais.filter((i) => i.diasRestantes > 60),
    }),
    [vencimentosGlobais],
  );

  const extratoGlobal = useMemo(() => {
    const items: ExtratoItem[] = [];

    allPersistedPrograms.forEach(({ meta, state }) => {
      const programId = meta.slug;
      const custoMilheiroPrograma = Number(state.custoMedioMilheiro ?? 0);
      (state.movimentos ?? []).forEach((mov) => {
        const tipo: MovimentoTipo = mov.tipo === "saida" ? "saida" : "entrada";
        const milhasVal = Number(mov.milhas ?? 0);
        const milhasAbs = Math.abs(milhasVal);

        let taxas: number | undefined;
        let tarifaPagante: number | undefined;
        let economiaReal: number | undefined;
        let economiaPercent: number | undefined;
        let custoTotalEmissao: number | undefined;

        if (tipo === "saida") {
          taxas = Number(mov.taxas ?? 0);
          tarifaPagante = Number(mov.tarifaPagante ?? 0);

          if (mov.emissaoFornecedor && typeof mov.custoFornecedor === "number") {
            const custoReal = mov.custoFornecedor + taxas;
            custoTotalEmissao = custoReal;
            const er =
              typeof mov.economiaReal === "number"
                ? mov.economiaReal
                : tarifaPagante > 0
                  ? tarifaPagante - custoReal
                  : undefined;
            economiaReal = er;
            economiaPercent =
              tarifaPagante > 0 && typeof er === "number" && !Number.isNaN(er)
                ? (er / tarifaPagante) * 100
                : undefined;
          } else if (milhasAbs > 0) {
            const custoMilheiroBase = Number(
              mov.custoMilheiroBase ?? custoMilheiroPrograma ?? 0,
            );
            const custoMilhas = (milhasAbs / 1000) * custoMilheiroBase;
            const custoReal = custoMilhas + taxas;
            custoTotalEmissao = custoReal;
            const er =
              typeof mov.economiaReal === "number"
                ? mov.economiaReal
                : tarifaPagante > 0
                  ? tarifaPagante - custoReal
                  : undefined;
            economiaReal = er;
            economiaPercent =
              tarifaPagante > 0 && typeof er === "number" && !Number.isNaN(er)
                ? (er / tarifaPagante) * 100
                : undefined;
          }
        }

        const dataRef = mov.data ?? "-";
        const dataVoo =
          tipo === "saida"
            ? (mov.dataIda?.trim() || mov.data?.trim() || "")
            : "";
        const dataEmissaoStr = mov.dataEmissao?.trim() || mov.data?.trim() || "";

        const baseLineId = stableExtratoMovimentoId(mov, meta);

        items.push({
          id: baseLineId,
          programId,
          programSlug: meta.slug,
          programName: meta.name,
          programLogo: meta.logo,
          programLogoColor: meta.logoColor,
          data: dataRef,
          dataVoo,
          dataEmissao: dataEmissaoStr,
          dataVolta: mov.dataVolta,
          tipo,
          descricao:
            mov.descricao ??
            (tipo === "entrada" ? "Entrada de milhas" : "Saída de milhas"),
          milhas: milhasVal,
          origem: mov.origem,
          destino: mov.destino,
          taxas,
          tarifaPagante,
          economiaReal,
          economiaPercent,
          emissaoFornecedor: mov.emissaoFornecedor,
          custoFornecedor: mov.custoFornecedor,
          codigoReserva: mov.codigoReserva,
          sobrenomeEmissao: mov.sobrenomeEmissao,
          custoTotalEmissao,
        });
      });
    });

    return items.sort((a, b) => {
      const da = parseBrDate(a.data)?.getTime() ?? 0;
      const db = parseBrDate(b.data)?.getTime() ?? 0;
      return db - da;
    });
  }, [allPersistedPrograms]);

  const analiseEconomia = useMemo(() => {
    const limite = new Date();
    limite.setMonth(limite.getMonth() - economiaPeriodoMeses);
    limite.setHours(0, 0, 0, 0);

    const emissoes: EmissaoEconomiaItem[] = [];
    const compras: CompraPontosItem[] = [];

    allPersistedPrograms.forEach(({ meta, state }) => {
      const custoMilheiroPrograma = Number(state.custoMedioMilheiro ?? 0);

      (state.movimentos ?? []).forEach((mov) => {
        const dataMov = parseBrDate(mov.data);
        if (!dataMov || dataMov < limite) return;

        if (mov.tipo === "saida") {
          const milhas = Math.abs(Number(mov.milhas ?? 0));
          if (milhas <= 0) return;

          const custoMilheiroBase = Number(
            mov.custoMilheiroBase ?? custoMilheiroPrograma ?? 0,
          );
          const taxa = Number(mov.taxas ?? 0);
          const tarifaPagante = Number(mov.tarifaPagante ?? 0);
          const custoMilhas = (milhas / 1000) * custoMilheiroBase;
          const custoReal = custoMilhas + taxa;
          const economiaReal =
            typeof mov.economiaReal === "number"
              ? mov.economiaReal
              : tarifaPagante - custoReal;

          emissoes.push({
            id: mov.id ?? `${meta.slug}-${mov.data ?? "sem-data"}-${milhas}`,
            programName: meta.name,
            programLogo: meta.logo,
            programLogoColor: meta.logoColor,
            data: mov.data ?? "-",
            descricao:
              mov.descricao ??
              (mov.origem && mov.destino
                ? `${mov.origem.toUpperCase()} - ${mov.destino.toUpperCase()}`
                : "Emissão com milhas"),
            milhas,
            tarifaPagante,
            custoReal,
            economiaReal,
          });
        }

        if (mov.tipo === "entrada") {
          const milhas = Number(mov.milhas ?? 0);
          const valorPago = Number(mov.valorPago ?? 0);
          if (milhas <= 0 || valorPago <= 0) return;

          const custoMilheiro = (valorPago / milhas) * 1000;
          compras.push({
            id: mov.id ?? `${meta.slug}-${mov.data ?? "sem-data"}-${milhas}`,
            programName: meta.name,
            programLogo: meta.logo,
            programLogoColor: meta.logoColor,
            data: mov.data ?? "-",
            milhas,
            valorPago,
            custoMilheiro,
            descricao: mov.descricao ?? mov.entradaTipo ?? "Compra de pontos",
          });
        }
      });
    });

    emissoes.sort((a, b) => (parseBrDate(b.data)?.getTime() ?? 0) - (parseBrDate(a.data)?.getTime() ?? 0));
    compras.sort((a, b) => (parseBrDate(b.data)?.getTime() ?? 0) - (parseBrDate(a.data)?.getTime() ?? 0));

    const economiaTotal = emissoes.reduce((acc, item) => acc + item.economiaReal, 0);
    const custoTotalCompras = compras.reduce((acc, item) => acc + item.valorPago, 0);
    const trend: "up" | "down" | "none" =
      economiaTotal > 0 ? "up" : economiaTotal < 0 ? "down" : "none";

    return {
      economiaTotal,
      custoTotalCompras,
      trend,
      emissoes,
      compras,
    };
  }, [allPersistedPrograms, economiaPeriodoMeses]);

  const patrimonio = useMemo(() => {
    let milhas = 0;
    let valor = 0;
    allPersistedPrograms.forEach(({ state }) => {
      const saldo = Number(state.saldo ?? 0);
      if (saldo > 0) milhas += saldo;
      const cpm = Number(state.custoMedioMilheiro ?? 0);
      if (saldo > 0 && cpm > 0) valor += (saldo / 1000) * cpm;
    });
    return { milhas, valor };
  }, [allPersistedPrograms]);

  const vencimentoCritico = vencimentosGlobais.find((i) => i.diasRestantes <= 30) ?? null;
  const ultimosMovimentos = extratoGlobal.slice(0, 4);

  const [emissoesProgramFilter, setEmissoesProgramFilter] = useState<
    "all" | "latam" | "smiles" | "tudoazul" | "livelo" | "esfera"
  >("all");
  const [emissoesSortOrder, setEmissoesSortOrder] = useState<"recentes" | "antigas">(
    "recentes",
  );

  const emissoesFiltradasOrdenadas = useMemo(() => {
    let list = analiseEconomia.emissoes;

    if (emissoesProgramFilter !== "all") {
      list = list.filter((item) => {
        const name = item.programName.toLowerCase();
        switch (emissoesProgramFilter) {
          case "latam":
            return name.includes("latam");
          case "smiles":
            return name.includes("smiles");
          case "tudoazul":
            return (
              name.includes("tudoazul") ||
              name.includes("tudo azul") ||
              name.includes("azul")
            );
          case "livelo":
            return name.includes("livelo");
          case "esfera":
            return name.includes("esfera");
          default:
            return true;
        }
      });
    }

    const sorted = [...list].sort((a, b) => {
      const da = parseBrDate(a.data)?.getTime() ?? 0;
      const db = parseBrDate(b.data)?.getTime() ?? 0;
      return emissoesSortOrder === "recentes" ? db - da : da - db;
    });

    return sorted;
  }, [analiseEconomia.emissoes, emissoesProgramFilter, emissoesSortOrder]);

  useEffect(() => {
    if (activeTab === "vencendo" && vencendoSectionRef.current) {
      vencendoSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeTab]);

  useEffect(() => {
    // Evita "tela em branco": se a aba ativa não é permitida para o role atual, volta para a home.
    if (activeTab === "timeline" && !canShowTimeline) setActiveTab("saldo");
    if (activeTab === "insights" && !canShowInsights) setActiveTab("saldo");
  }, [activeTab, canShowInsights, canShowTimeline]);

  const handleDownloadEconomiaPdf = async () => {
    if (!economiaReportRef.current) return;
    try {
      const pdf = await renderElementToA4Pdf(economiaReportRef.current, "#F7F7F8");
      const dataArquivo = new Date().toISOString().slice(0, 10);
      await deliverPdf(pdf, `analise-economia-${economiaPeriodoMeses}m-${dataArquivo}.pdf`);
    } catch (err) {
      console.warn("[Index] PDF economia:", err);
      toast.error("Não foi possível gerar o PDF. Tente novamente.");
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-28 pt-[var(--gm-safe-top)]">
      <DashboardHeader />



      <BalanceTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        canShowInsights={canShowInsights}
        canShowTimeline={canShowTimeline}
      />



      {activeTab === "saldo" && (
        <>
          <div className="px-5 pt-3 text-sm text-nubank-text-secondary">
            {saudacaoLabel},{" "}
            <span className="font-bold text-nubank-text">{clienteFirstName || "viajante"}</span>
          </div>

          <div className="px-5 pt-3">
            <div className="rounded-3xl bg-white p-5 shadow-nubank-card">
              <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                Patrimônio em milhas
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <span className="font-display text-4xl font-bold tabular-nums leading-none tracking-tight text-nubank-text">
                  {patrimonio.milhas.toLocaleString("pt-BR")}
                </span>
                <span className="text-sm font-medium text-nubank-text-secondary">milhas</span>
              </div>
              {(patrimonio.valor > 0 || analiseEconomia.economiaTotal > 0) && (
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {patrimonio.valor > 0 && (
                    <span className="rounded-full bg-[#F1F0F3] px-3 py-1.5 text-[12.5px] font-semibold tabular-nums text-nubank-text">
                      ≈ {brlInteiro(patrimonio.valor)}
                    </span>
                  )}
                  {analiseEconomia.economiaTotal > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-[12.5px] font-semibold tabular-nums text-success-strong">
                      <TrendingUp size={12} strokeWidth={2.4} aria-hidden />
                      {brlInteiro(analiseEconomia.economiaTotal)} · {economiaPeriodoMeses}m
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between px-5 pt-5">
            {[
              { label: "Cotação", Icon: Plane, onClick: () => setIsDemandDialogOpen(true), badge: 0 },
              { label: "Buscar voos", Icon: Search, onClick: () => navigate("/search-flights"), badge: 0 },
              {
                label: "Vencimentos",
                Icon: Clock,
                onClick: () => setActiveTab("vencendo"),
                badge: vencimentosBands.critico.length,
              },
              { label: "Economia", Icon: BarChart3, onClick: () => setActiveTab("economia"), badge: 0 },
            ].map(({ label, Icon, onClick, badge }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className="flex w-[74px] flex-col items-center gap-2"
              >
                <span className="relative flex h-[54px] w-[54px] items-center justify-center rounded-[20px] border border-nubank-border bg-white text-primary shadow-nubank transition-colors hover:bg-nubank-bg">
                  <Icon size={22} strokeWidth={1.75} aria-hidden />
                  {badge > 0 && (
                    <span className="absolute -right-1 -top-1 min-h-[18px] min-w-[18px] rounded-full bg-nubank-notification px-1 text-center text-[10.5px] font-bold leading-[18px] text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap text-[11px] font-semibold text-[#54535A]">
                  {label}
                </span>
              </button>
            ))}
          </div>

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
                  logoImages={programLogoImagesForSheet}
                />

          <section id="meus-programas" className="mt-6 flex items-center justify-between px-5 pb-3">
            <span className="section-label mb-0">Meus programas</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsAddProgramMenuOpen(true)}
                aria-label="Adicionar programa"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-nubank-tint text-nubank-dark transition-colors hover:bg-primary/15"
              >
                <Plus size={15} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-[13px] font-semibold text-primary"
              >
                Ver todos →
              </button>
            </div>
          </section>
          <div className="grid grid-cols-2 gap-2.5 px-5 pb-2">
            {visiblePrograms.map((prog) => (
              <ProgramCard key={prog.programId} {...prog} />
            ))}
          </div>

          {!showAll && programs.length > 4 && (
            <button
              onClick={() => setShowAll(true)}
              className="mx-auto mt-1.5 flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold text-nubank-text-secondary transition-colors hover:bg-white/80 hover:text-nubank-text"
            >
              <ChevronDown size={18} strokeWidth={2} />
              Ver todos
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate("/simular-compra-milhas")}
            className="mx-5 mt-3 flex items-center gap-3 rounded-[20px] bg-white p-4 text-left shadow-nubank-card transition-colors hover:bg-nubank-bg/60"
          >
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] bg-nubank-tint text-nubank-primary">
              <Calculator size={20} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-nubank-text">Simular compra de milhas</span>
              <span className="block text-[12.5px] text-nubank-text-secondary">
                Compare o custo do milheiro antes de comprar
              </span>
            </span>
            <ChevronRight size={17} strokeWidth={2} className="shrink-0 text-[#C4C3C9]" aria-hidden />
          </button>

          {vencimentoCritico && (
            <div className="mx-5 mt-5 flex items-center gap-3 rounded-[20px] border-l-4 border-[#E4574A] bg-white p-4 shadow-nubank-card">
              <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] bg-destructive-soft text-destructive">
                <Clock size={20} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-nubank-text">
                  {vencimentoCritico.quantidade.toLocaleString("pt-BR")} milhas vencem em{" "}
                  {vencimentoCritico.diasRestantes}{" "}
                  {vencimentoCritico.diasRestantes === 1 ? "dia" : "dias"}
                </span>
                <span className="block text-[12.5px] text-nubank-text-secondary">
                  {vencimentoCritico.programName} · lote de {vencimentoCritico.data}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setActiveTab("vencendo")}
                className="shrink-0 text-[13px] font-semibold text-primary"
              >
                Ver opções
              </button>
            </div>
          )}

          {ultimosMovimentos.length > 0 && (
            <div className="mt-6 px-5">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="section-label mb-0">Últimos movimentos</span>
                <button
                  type="button"
                  onClick={() => setActiveTab("extrato")}
                  className="text-[13px] font-semibold text-primary"
                >
                  Extrato completo →
                </button>
              </div>
              <div className="rounded-[20px] bg-white px-1 py-1 shadow-nubank-card">
                {ultimosMovimentos.map((item, idx) => {
                  const isSaida = item.tipo === "saida";
                  const rota =
                    item.origem?.trim() && item.destino?.trim()
                      ? `${item.origem.toUpperCase()} → ${item.destino.toUpperCase()}`
                      : null;
                  const isEmissao = isSaida && !!rota;
                  const MovIcon = isEmissao ? Plane : isSaida ? ArrowUpRight : ArrowDownLeft;
                  const tintClass = isEmissao
                    ? "bg-primary-soft text-primary"
                    : isSaida
                      ? "bg-destructive-soft text-destructive-strong"
                      : "bg-success-soft text-success-strong";
                  const valorClass = isEmissao
                    ? "text-primary"
                    : isSaida
                      ? "text-destructive-strong"
                      : "text-success-strong";
                  return (
                    <div key={`${item.programSlug}-${item.id}`}>
                      {idx > 0 && <div className="mx-3.5 h-px bg-[#F1F0F3]" />}
                      <button
                        type="button"
                        onClick={() => setResumoCliente({ kind: "extrato", item })}
                        className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left transition-colors hover:bg-nubank-bg/60"
                      >
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] ${tintClass}`}
                        >
                          <MovIcon size={17} strokeWidth={2} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-nubank-text">
                            {isEmissao ? `Emissão · ${rota}` : item.descricao}
                          </span>
                          <span className="block truncate text-xs text-nubank-text-secondary">
                            {item.programName} · {formatExtratoDate(item.data)}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 font-display text-[14.5px] font-semibold tabular-nums ${valorClass}`}
                        >
                          {isSaida ? "−" : "+"}
                          {Math.abs(item.milhas).toLocaleString("pt-BR")}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-6">
            <DestinationCarousel
              origins={enabledOrigins}
              onDestinationClick={handleSearchEmissionFromDestinationCard}
            />
          </div>

          <div className="mt-6">
            <BonusPromotionsSection />
          </div>

        </>
      )}

      {activeTab === "vencendo" && (
        <div ref={vencendoSectionRef} className="flex flex-col gap-3 px-4 py-3">
          <>
              {vencimentosGlobais.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <span className="text-5xl opacity-20">🎉</span>
                  <p className="text-[14px] font-bold text-gray-700">Tudo em dia!</p>
                  <p className="text-[12px] leading-relaxed text-gray-400">
                    Nenhuma milha vencendo nos próximos dias.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {vencimentosBands.critico.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 px-0.5">
                        <div className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />
                        <span className="flex-1 text-[11px] font-extrabold uppercase tracking-wide text-red-700">Crítico</span>
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">≤ 30 dias</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {vencimentosBands.critico.map((item, idx) => (
                          <div key={`${item.programSlug}-${item.data}-${item.quantidade}-${idx}`} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                            <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px] text-[11px] font-black text-white" style={{ backgroundColor: item.programLogoColor }}>{item.programLogo}</div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-bold text-gray-900">{item.programName}</div>
                              <div className="mt-0.5 text-[10px] text-gray-400">{item.quantidade.toLocaleString("pt-BR")} pts · {item.data}</div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-[14px] font-black leading-none text-red-500">{item.diasRestantes}</div>
                              <div className="mt-0.5 text-[9px] font-semibold text-gray-400">dias</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {vencimentosBands.critico.length > 0 && vencimentosBands.atencao.length > 0 && (
                    <div className="h-px bg-gray-200" />
                  )}
                  {vencimentosBands.atencao.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 px-0.5">
                        <div className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-500" />
                        <span className="flex-1 text-[11px] font-extrabold uppercase tracking-wide text-amber-800">Atenção</span>
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">31 – 60 dias</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {vencimentosBands.atencao.map((item, idx) => (
                          <div key={`${item.programSlug}-${item.data}-${item.quantidade}-${idx}`} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                            <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px] text-[11px] font-black text-white" style={{ backgroundColor: item.programLogoColor }}>{item.programLogo}</div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-bold text-gray-900">{item.programName}</div>
                              <div className="mt-0.5 text-[10px] text-gray-400">{item.quantidade.toLocaleString("pt-BR")} pts · {item.data}</div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-[14px] font-black leading-none text-amber-500">{item.diasRestantes}</div>
                              <div className="mt-0.5 text-[9px] font-semibold text-gray-400">dias</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(vencimentosBands.critico.length > 0 || vencimentosBands.atencao.length > 0) && vencimentosBands.ok.length > 0 && (
                    <div className="h-px bg-gray-200" />
                  )}
                  {vencimentosBands.ok.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 px-0.5">
                        <div className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                        <span className="flex-1 text-[11px] font-extrabold uppercase tracking-wide text-green-800">Tranquilo</span>
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-800">&gt; 60 dias</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {vencimentosBands.ok.map((item, idx) => (
                          <div key={`${item.programSlug}-${item.data}-${item.quantidade}-${idx}`} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                            <div className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px] text-[11px] font-black text-white" style={{ backgroundColor: item.programLogoColor }}>{item.programLogo}</div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-bold text-gray-900">{item.programName}</div>
                              <div className="mt-0.5 text-[10px] text-gray-400">{item.quantidade.toLocaleString("pt-BR")} pts · {item.data}</div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-[14px] font-black leading-none text-green-500">{item.diasRestantes}</div>
                              <div className="mt-0.5 text-[9px] font-semibold text-gray-400">dias</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
        </div>
      )}

      {activeTab === "extrato" && (
        <div className="space-y-2 px-5 py-2">
          {extratoGlobal.length === 0 && (
            <div className="rounded-2xl border border-nubank-border bg-white p-6 text-center text-sm text-nubank-text-secondary shadow-nubank">
              Nenhuma entrada ou saída registrada ainda.
            </div>
          )}
          {extratoGlobal.map((item) => {
            const routeTitle =
              item.origem?.trim() && item.destino?.trim()
                ? `${item.origem.toUpperCase()} → ${item.destino.toUpperCase()}`
                : item.descricao;
            const isFornecedor =
              item.tipo === "saida" && Boolean(item.emissaoFornecedor);
            const fornecedorHeroValor =
              typeof item.custoFornecedor === "number"
                ? item.custoFornecedor
                : typeof item.custoTotalEmissao === "number"
                  ? item.custoTotalEmissao
                  : null;
            const lucrativa =
              item.tipo === "saida" &&
              typeof item.economiaReal === "number" &&
              !Number.isNaN(item.economiaReal) &&
              item.economiaReal >= 0;

            return (
              <div
                key={`${item.programSlug}-${item.id}`}
                role="button"
                tabIndex={0}
                className="flex cursor-pointer overflow-hidden rounded-2xl border border-nubank-border bg-white shadow-nubank transition-all hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nubank-primary/40 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/80"
                onClick={() =>
                  setResumoCliente({
                    kind: "extrato",
                    item
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setResumoCliente({
                      kind: "extrato",
                      item
                    });
                  }
                }}
              >
                <div
                  className={`w-1 shrink-0 ${
                    item.tipo === "saida" ? "bg-red-500" : "bg-emerald-500"
                  }`}
                />

                <div className="min-w-0 flex-1 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <p className="text-[15px] font-black tracking-tight text-slate-900 dark:text-slate-100">
                          {routeTitle}
                        </p>
                        {item.tipo === "saida" ? (
                          <span className="rounded-full bg-rose-100 px-2 py-px text-[10px] font-semibold text-rose-800 ring-1 ring-rose-200/80 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-800">
                            Saída
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-px text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-800">
                            Entrada
                          </span>
                        )}
                        {isFornecedor && (
                          <span className="rounded-full bg-amber-100 px-2 py-px text-[10px] font-semibold text-amber-900 ring-1 ring-amber-200/90 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800">
                            Fornecedor
                          </span>
                        )}
                        {lucrativa && (
                          <span className="rounded-full bg-emerald-100 px-2 py-px text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800">
                            ✓ Lucrativa
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>{item.programName}</span>
                        {item.tipo === "saida" && item.codigoReserva?.trim() && (
                          <>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span>
                              Reserva{" "}
                              <span className="font-mono font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                                {item.codigoReserva.trim()}
                              </span>
                            </span>
                          </>
                        )}
                        {item.tipo === "saida" && item.sobrenomeEmissao?.trim() && (
                          <>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                            <span className="text-slate-600 dark:text-slate-300">
                              {item.sobrenomeEmissao.trim()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      {isFornecedor && fornecedorHeroValor !== null ? (
                        <>
                          <p className="text-[19px] font-black tabular-nums text-[#A86E3D] dark:text-amber-200">
                            {fornecedorHeroValor.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                            fornecedor
                          </p>
                        </>
                      ) : (
                        <>
                          <p
                            className={`text-[19px] font-black tabular-nums ${
                              item.tipo === "entrada"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {item.tipo === "entrada" ? "+" : "−"}
                            {Math.abs(item.milhas).toLocaleString("pt-BR")}
                          </p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                            milhas
                          </p>
                        </>
                      )}
                      <ChevronRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 dark:text-slate-500"
                        aria-hidden
                      />
                    </div>
                  </div>

                  <div className="mb-3 h-px bg-slate-100 dark:bg-slate-700" />

                  {item.tipo === "saida" && (
                    <>
                      <div className="mb-2 grid grid-cols-2 gap-2">
                        {item.dataVolta?.trim() ? (
                          <div className="col-span-2 flex items-center rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 dark:border-indigo-900 dark:bg-indigo-950/30">
                            <div className="flex-1">
                              <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-400">
                                ✈ Ida
                              </p>
                              <p className="text-[12px] font-bold text-slate-900 dark:text-slate-100">
                                {item.dataVoo ? formatExtratoDate(item.dataVoo) : "—"}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-center px-3 text-lg leading-none text-indigo-300">
                              →
                              <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-widest text-indigo-200">
                                retorno
                              </span>
                            </div>
                            <div className="flex-1 text-right">
                              <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-400">
                                Volta ✈
                              </p>
                              <p className="text-[12px] font-bold text-slate-900 dark:text-slate-100">
                                {formatExtratoDate(item.dataVolta)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="mb-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                              ✈ Data do voo
                            </p>
                            <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                              {item.dataVoo ? formatExtratoDate(item.dataVoo) : "—"}
                            </p>
                          </div>
                        )}

                        <div>
                          <p className="mb-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                            Data da emissão
                          </p>
                          <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                            {item.dataEmissao ? formatExtratoDate(item.dataEmissao) : "—"}
                          </p>
                        </div>

                        <div>
                          <p className="mb-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                            Taxas
                          </p>
                          <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                            {typeof item.taxas === "number"
                              ? item.taxas.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })
                              : "—"}
                          </p>
                        </div>

                        <div>
                          <p className="mb-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                            Tarifa pagante
                          </p>
                          <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                            {typeof item.tarifaPagante === "number" && item.tarifaPagante > 0
                              ? item.tarifaPagante.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })
                              : "—"}
                          </p>
                        </div>

                        <div className={item.dataVolta?.trim() ? "" : "col-span-2"}>
                          <p className="mb-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                            {isFornecedor ? "Custo (fornecedor)" : "Custo total"}
                          </p>
                          <p className="text-[12px] font-bold text-indigo-800 dark:text-indigo-300">
                            {typeof item.custoTotalEmissao === "number"
                              ? item.custoTotalEmissao.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })
                              : "—"}
                          </p>
                        </div>
                      </div>

                      {typeof item.economiaReal === "number" &&
                        !Number.isNaN(item.economiaReal) && (
                          <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Economia gerada
                            </p>
                            <div className="text-right">
                              <p
                                className={`text-[14px] font-black ${
                                  item.economiaReal >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-600 dark:text-red-400"
                                }`}
                              >
                                {item.economiaReal.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}
                              </p>
                              {typeof item.economiaPercent === "number" &&
                                !Number.isNaN(item.economiaPercent) && (
                                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {Math.abs(item.economiaPercent).toFixed(1)}% da tarifa pagante
                                  </p>
                                )}
                            </div>
                          </div>
                        )}
                    </>
                  )}

                  {item.tipo === "entrada" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="mb-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                          Data
                        </p>
                        <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">
                          {formatExtratoDate(item.data)}
                        </p>
                      </div>
                      <div>
                        <p className="mb-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                          Milhas
                        </p>
                        <p className="text-[12px] font-bold tabular-nums text-emerald-600">
                          +{Math.abs(item.milhas).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "economia" && (
        <div className="space-y-3 px-5">
          <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-full border border-nubank-border bg-white p-1 shadow-nubank">
              {[
                { label: "1M", value: 1 as const },
                { label: "6M", value: 6 as const },
                { label: "12M", value: 12 as const },
              ].map((opcao) => {
                const active = economiaPeriodoMeses === opcao.value;
                return (
                  <button
                    key={opcao.value}
                    type="button"
                    onClick={() => setEconomiaPeriodoMeses(opcao.value)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                      active
                        ? "bg-slate-900 text-white"
                        : "text-nubank-text-secondary hover:bg-primary/5"
                    }`}
                  >
                    {opcao.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/minha-economia")}
                className="inline-flex items-center gap-1 rounded-full border border-nubank-border bg-white px-3 py-1.5 text-xs font-semibold text-nubank-text shadow-nubank transition-colors hover:bg-white/90"
              >
                <FileText size={14} />
                Relatório completo
              </button>
              <button
                type="button"
                onClick={handleDownloadEconomiaPdf}
                className="inline-flex items-center gap-1 rounded-full border border-nubank-border bg-white px-3 py-1.5 text-xs font-semibold text-nubank-text shadow-nubank transition-colors hover:bg-white/90"
              >
                <Download size={14} />
                Baixar PDF
              </button>
            </div>
          </div>
          <div ref={economiaReportRef} className="space-y-3">
            <div className="rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-nubank-text">
                  Economia total das emissões (últimos {economiaPeriodoMeses}{" "}
                  {economiaPeriodoMeses === 1 ? "mês" : "meses"})
                </p>
                {analiseEconomia.trend === "up" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <ArrowUpRight size={14} />
                    Economia
                  </span>
                )}
                {analiseEconomia.trend === "down" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                    <ArrowDownRight size={14} />
                    Prejuízo
                  </span>
                )}
              </div>
              <p
                className={`mt-2 text-xl font-bold ${
                  analiseEconomia.economiaTotal >= 0
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {analiseEconomia.economiaTotal.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
              <p className="mt-1 text-[11px] text-nubank-text-secondary">
                Custo de compra de pontos no período:{" "}
                {analiseEconomia.custoTotalCompras.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
            </div>

            <div className="rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank">
              <p className="text-xs font-semibold text-nubank-text">
                Total de emissões realizadas
              </p>
              <p className="mt-2 text-2xl font-bold text-nubank-text">
                {analiseEconomia.emissoes.length.toLocaleString("pt-BR")}
              </p>
              <p className="mt-1 text-[11px] text-nubank-text-secondary">
                Considerando apenas o período selecionado acima.
              </p>
            </div>

            <div className="rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank">
              <p className="text-xs font-semibold text-nubank-text">
                Passagens emitidas que geraram economia/prejuízo
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "all"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("all")}
                  >
                    Ver todos
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "latam"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("latam")}
                  >
                    LATAM Pass
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "smiles"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("smiles")}
                  >
                    Smiles
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "tudoazul"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("tudoazul")}
                  >
                    TudoAzul
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "livelo"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("livelo")}
                  >
                    Livelo
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesProgramFilter === "esfera"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesProgramFilter("esfera")}
                  >
                    Esfera
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesSortOrder === "recentes"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesSortOrder("recentes")}
                  >
                    Mais recentes
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 font-semibold ${
                      emissoesSortOrder === "antigas"
                        ? "bg-nubank-primary text-white"
                        : "bg-nubank-bg text-nubank-text-secondary"
                    }`}
                    onClick={() => setEmissoesSortOrder("antigas")}
                  >
                    Mais antigas
                  </button>
                </div>
              </div>
              {emissoesFiltradasOrdenadas.length === 0 && (
                <p className="mt-3 text-xs text-nubank-text-secondary">
                  Nenhuma emissão encontrada para os filtros selecionados.
                </p>
              )}
            <div className="mt-3 space-y-2">
              {emissoesFiltradasOrdenadas.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-nubank-border bg-white/80 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-black/10"
                      style={{
                        backgroundColor: `${item.programLogoColor}1f`,
                        color: item.programLogoColor,
                      }}
                    >
                      {item.programLogo}
                    </span>
                    <p className="text-[11px] font-semibold text-nubank-text">
                      {item.programName} • {item.data}
                    </p>
                  </div>
                  <p className="mt-1 text-xs font-medium text-nubank-text">
                    {item.descricao}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-nubank-text-secondary">
                    <span>{item.milhas.toLocaleString("pt-BR")} milhas</span>
                    <span>
                      Tarifa:{" "}
                      {item.tarifaPagante.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-nubank-text-secondary">
                      Custo real:{" "}
                      {item.custoReal.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                    <span
                      className={
                        item.economiaReal >= 0
                          ? "font-semibold text-emerald-700"
                          : "font-semibold text-red-700"
                      }
                    >
                      {item.economiaReal >= 0 ? "Economia" : "Prejuízo"}:{" "}
                      {Math.abs(item.economiaReal).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-nubank-border bg-white p-4 shadow-nubank">
            <p className="text-xs font-semibold text-nubank-text">
              Pontos comprados e custos (últimos {economiaPeriodoMeses}{" "}
              {economiaPeriodoMeses === 1 ? "mês" : "meses"})
            </p>
            {analiseEconomia.compras.length === 0 && (
              <p className="mt-3 text-xs text-nubank-text-secondary">
                Nenhuma compra de pontos registrada no período selecionado.
              </p>
            )}
            <div className="mt-3 space-y-2">
              {analiseEconomia.compras.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-nubank-border bg-white/80 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-black/10"
                      style={{
                        backgroundColor: `${item.programLogoColor}1f`,
                        color: item.programLogoColor,
                      }}
                    >
                      {item.programLogo}
                    </span>
                    <p className="text-[11px] font-semibold text-nubank-text">
                      {item.programName} • {item.data}
                    </p>
                  </div>
                  <p className="mt-1 text-xs font-medium text-nubank-text">
                    {item.descricao}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-nubank-text-secondary">
                    <span>{item.milhas.toLocaleString("pt-BR")} milhas</span>
                    <span>
                      Custo:{" "}
                      {item.valorPago.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-amber-700">
                    Custo por milheiro:{" "}
                    {item.custoMilheiro.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </p>
                </div>
              ))}
            </div>
          </div>
          </div>
          </>
        </div>
      )}

      {activeTab === "timeline" && canShowTimeline && advancedClientId && (
        <ClientTimelineSection
          enabled={true}
          clienteId={advancedClientId}
        />
      )}

      {activeTab === "insights" && canShowInsights && advancedClientId && (
        <ClientInsightsSection enabled={true} clienteId={advancedClientId} />
      )}

      {activeTab === "sugestoes" && (
        <SmartRedemptionSuggestions
          clientId={user?.id ?? null}
        />
      )}

      <Dialog
        open={!!resumoCliente}
        onOpenChange={(open) => {
          if (!open) setResumoCliente(null);
        }}
      >
        <DialogContent
          className={cn(
            "w-[calc(100vw-1.5rem)]",
            resumoClienteMostraCardEmissao(resumoCliente)
              ? "flex max-h-[min(92dvh,680px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(100vw-1.5rem,360px)]"
              : "max-w-md",
          )}
        >
          <DialogHeader
            className={cn(
              "shrink-0",
              resumoClienteMostraCardEmissao(resumoCliente) && "sr-only",
            )}
          >
            <DialogTitle>
              {resumoCliente ? resumoClienteDialogTitle(resumoCliente) : "Resumo"}
            </DialogTitle>
            <DialogDescription>
              Informações organizadas para apresentar ao cliente.
            </DialogDescription>
          </DialogHeader>
          {resumoCliente ? (
            <ResumoParaClienteBody payload={resumoCliente} equipeNome={undefined} />
          ) : null}
          <DialogFooter
            className={cn(
              "gap-2 sm:gap-0",
              resumoClienteMostraCardEmissao(resumoCliente) &&
                "shrink-0 border-t border-border/60 px-4 pb-4 pt-3",
            )}
          >
            <Button type="button" variant="default" onClick={() => setResumoCliente(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            gestoresLoading={demandGestoresLoading}
            gestoresError={demandGestoresError}
            onRetryGestores={loadDemandGestores}
            submitting={demandSubmitting}
            onSubmit={handleSubmitDemand}
          />
        </DialogContent>
      </Dialog>



      <CsatClientePrompt />
      <NpsClientePrompt />

      <BottomNav />
    </div>
  );
};

export default Index;
