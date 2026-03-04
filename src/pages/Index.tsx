import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Download,
  Plus,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import DashboardHeader from "@/components/DashboardHeader";
import BalanceTabs from "@/components/BalanceTabs";
import ProgramCard from "@/components/ProgramCard";
import QuickSearch from "@/components/QuickSearch";
import ExploreDestinations from "@/components/ExploreDestinations";
import BottomNav from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useProgramasCliente } from "@/hooks/useProgramasCliente";
import { useGestor } from "@/hooks/useGestor";
import { useVincularCliente } from "@/hooks/useVincularCliente";

const STORAGE_PREFIX = "mile-manager:program-state:";
const LOGO_STORAGE_PREFIX = "mile-manager:program-logo:";
const PROGRAM_CARDS_STORAGE_KEY = "mile-manager:program-cards";
const MIGRATION_FLAG_PREFIX = "mile-manager:migration:v1:";
const MANAGER_ACCESSED_CLIENTS_PREFIX = "mile-manager:manager-accessed-clients:";

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

type PersistedProgramState = {
  saldo?: number;
  custoMedioMilheiro?: number;
  movimentos?: Array<{
    id?: string;
    data?: string;
    tipo?: MovimentoTipo;
    descricao?: string;
    lucrativa?: boolean;
    validadeLote?: string;
    milhas?: number;
    valorPago?: number;
    taxas?: number;
    tarifaPagante?: number;
    economiaReal?: number;
    custoMilheiroBase?: number;
    origem?: string;
    destino?: string;
    classe?: string;
    passageiros?: number;
    entradaTipo?: string;
  }>;
  lotes?: Array<{
    validadeLote?: string;
    quantidade?: number;
  }>;
};

type ProgramMeta = {
  slug: string;
  name: string;
  logo: string;
  logoColor: string;
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
  programSlug: string;
  programName: string;
  programLogo: string;
  programLogoColor: string;
  data: string;
  tipo: MovimentoTipo;
  descricao: string;
  milhas: number;
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

const PROGRAM_META_MAP: Record<string, Omit<ProgramMeta, "slug">> = {
  "latam-pass": { name: "LATAM Pass", logo: "LP", logoColor: "#1a3a6b" },
  livelo: { name: "Livelo", logo: "Lv", logoColor: "#e91e63" },
  esfera: { name: "Esfera", logo: "Es", logoColor: "#333333" },
  smiles: { name: "Smiles", logo: "Sm", logoColor: "#f59e42" },
  kmv: { name: "KMV", logo: "KM", logoColor: "#2e7d32" },
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
    programId: "coopera",
    name: "Coopera",
    logo: "CP",
    logoColor: "#2d6a4f",
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
  const managerClientIdParam = searchParams.get("clientId");
  const managerClientId =
    role === "gestor" || role === "admin" ? managerClientIdParam : null;
  const managerMode = role === "gestor" || role === "admin";
  const [activeTab, setActiveTab] = useState("saldo");
  const [activeNav, setActiveNav] = useState("programas");
  const [showAll, setShowAll] = useState(false);
  const [programDefs, setProgramDefs] = useState<ProgramCardData[]>(basePrograms);
  const [programs, setPrograms] = useState<ProgramCardData[]>(basePrograms);
  const [economiaPeriodoMeses, setEconomiaPeriodoMeses] = useState<1 | 6 | 12>(12);
  const [isAddProgramMenuOpen, setIsAddProgramMenuOpen] = useState(false);
  const [isClientesAtivosOpen, setIsClientesAtivosOpen] = useState(false);
  const [vincularIdInput, setVincularIdInput] = useState("");
  const [optionLogoImages, setOptionLogoImages] = useState<Record<string, string>>(
    {},
  );
  const [accessedClientsVersion, setAccessedClientsVersion] = useState(0);
  const economiaReportRef = useRef<HTMLDivElement | null>(null);
  const {
    byProgramId: remoteByProgramId,
    data: remotePrograms,
    saveProgramState,
  } =
    useProgramasCliente(managerClientId);
  const { resumoClientes, kpis: gestorKpis } = useGestor(managerMode);
  const { vincular, isVincularLoading, getErrorMessage } = useVincularCliente(managerMode ? user?.id : undefined);

  const dataOwnerId = managerClientId ?? user?.id ?? "anonymous";

  const gestorScore = useMemo(() => {
    if (!managerMode || !gestorKpis) return 0;
    const { economiaTotalGestao, totalClientesAtivos, roiMedio } = gestorKpis;
    const porEconomia = Math.min(600, (economiaTotalGestao / 50));
    const porClientes = Math.min(300, totalClientesAtivos * 60);
    const porRoi = Math.min(100, Math.max(0, roiMedio / 20));
    return Math.round(Math.min(1000, porEconomia + porClientes + porRoi));
  }, [managerMode, gestorKpis]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${PROGRAM_CARDS_STORAGE_KEY}${dataOwnerId}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeProgramCards(parsed);
      setProgramDefs(normalized);
      setPrograms(normalized);
    } catch {
      // mantém base padrão
    }
  }, [dataOwnerId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

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

      const nextPrograms = programDefs.map((program) => {
        const slug = program.programId;
        const nameSlug = slugify(program.name);
        const remoteRow = remoteByProgramId.get(slug);
        const storedLogoImage = window.localStorage.getItem(
          `${LOGO_STORAGE_PREFIX}${dataOwnerId}:${slug}`,
        );
        const storageKey = `${STORAGE_PREFIX}${dataOwnerId}:${slug}:${nameSlug}`;
        const raw = window.localStorage.getItem(storageKey);
        const remoteRaw = remoteRow?.state
          ? JSON.stringify(remoteRow.state)
          : null;
        const sourceRaw = remoteRaw ?? raw;

        if (!sourceRaw) {
          return {
            ...program,
            logoImageUrl:
              remoteRow?.logo_image_url ?? storedLogoImage ?? undefined,
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

          const ultimoMovimentoTipo = parsed.movimentos?.[0]?.tipo;
          const variation: ProgramCardData["variation"] =
            ultimoMovimentoTipo === "saida"
              ? "down"
              : ultimoMovimentoTipo === "entrada"
                ? "up"
                : "none";

          return {
            ...program,
            logoImageUrl:
              remoteRow?.logo_image_url ?? storedLogoImage ?? undefined,
            balance: saldo.toLocaleString("pt-BR"),
            // Exibe no card o custo médio por milheiro informado na tela interna.
            valueInBRL: custoMedio.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            variation,
            expiring: hasExpiringMiles,
            error: hasExpiringMiles
              ? "Milhas a vencer"
              : program.error,
            expiringTag,
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
  }, [programDefs, remoteByProgramId, dataOwnerId]);

  useEffect(() => {
    if (!user?.id || managerClientId) return;
    if (typeof window === "undefined") return;

    const migrationKey = `${MIGRATION_FLAG_PREFIX}${user.id}`;
    const alreadyMigrated = window.localStorage.getItem(migrationKey) === "1";
    if (alreadyMigrated) return;

    const runMigration = async () => {
      for (const program of programDefs) {
        const slug = program.programId;
        const nameSlug = slugify(program.name);
        const storageKey = `${STORAGE_PREFIX}${slug}:${nameSlug}`;
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
            window.localStorage.getItem(`${LOGO_STORAGE_PREFIX}${slug}`) ?? null;

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
  }, [user?.id, managerClientId, programDefs, saveProgramState]);

  const handleProgramLogoChange = (programName: string, imageDataUrl: string) => {
    const slug = programName;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        `${LOGO_STORAGE_PREFIX}${dataOwnerId}:${slug}`,
        imageDataUrl,
      );
    }
    setOptionLogoImages((prev) => ({ ...prev, [slug]: imageDataUrl }));

    const syncLogo = (cards: ProgramCardData[]) =>
      cards.map((program) =>
        program.programId === slug
          ? { ...program, logoImageUrl: imageDataUrl }
          : program,
      );

    setPrograms((prev) => syncLogo(prev));
    setProgramDefs((prev) => {
      const next = syncLogo(prev);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          PROGRAM_CARDS_STORAGE_KEY + dataOwnerId,
          JSON.stringify(next),
        );
      }
      return next;
    });
  };

  const handleToggleProgramCard = (
    option: (typeof AVAILABLE_PROGRAM_OPTIONS)[number],
  ) => {
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

  const visiblePrograms = showAll ? programs : programs.slice(0, 4);
  const gestorClientOptions = useMemo(
    () =>
      resumoClientes.map((client) => ({
        id: client.clienteId,
        name: client.nome,
      })),
    [resumoClientes],
  );

  const clientsForBottomNav = useMemo(() => {
    if (!managerMode || typeof window === "undefined" || !user?.id)
      return gestorClientOptions;
    const key = `${MANAGER_ACCESSED_CLIENTS_PREFIX}${user.id}`;
    const raw = window.localStorage.getItem(key);
    let accessed: Array<{ id: string; name?: string }> = [];
    if (raw) {
      try {
        accessed = JSON.parse(raw);
        if (!Array.isArray(accessed)) accessed = [];
      } catch {
        accessed = [];
      }
    }
    const fromApiIds = new Set(gestorClientOptions.map((c) => c.id));
    const onlyAccessed = accessed.filter((a) => !fromApiIds.has(a.id));
    return [
      ...gestorClientOptions,
      ...onlyAccessed.map((a) => ({
        id: a.id,
        name: a.name ?? `Cliente ${a.id.slice(0, 8)}${a.id.length > 8 ? "…" : ""}`,
      })),
    ];
  }, [
    managerMode,
    user?.id,
    gestorClientOptions,
    accessedClientsVersion,
  ]);

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
    if (remotePrograms && remotePrograms.length > 0) {
      return remotePrograms
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
    }

    if (typeof window === "undefined") return [] as Array<{
      meta: ProgramMeta;
      state: PersistedProgramState;
    }>;

    const prefixWithOwner = `${STORAGE_PREFIX}${dataOwnerId}:`;
    const keys = Object.keys(window.localStorage).filter((key) =>
      key.startsWith(prefixWithOwner),
    );

    return keys
      .map((key) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        try {
          const state = JSON.parse(raw) as PersistedProgramState;
          // key format: STORAGE_PREFIX + dataOwnerId + ":" + slug + ":" + nameSlug
          const afterPrefix = key.replace(prefixWithOwner, "");
          const parts = afterPrefix.split(":");
          const slug = (parts[0] ?? "programa").toLowerCase();
          const meta = programMetaBySlug.get(slug) ?? getProgramMetaFromSlug(slug);
          return { meta, state };
        } catch {
          return null;
        }
      })
      .filter((item): item is { meta: ProgramMeta; state: PersistedProgramState } => !!item);
  }, [programMetaBySlug, remotePrograms, dataOwnerId]);

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

    return items.sort((a, b) => a.diasRestantes - b.diasRestantes);
  }, [allPersistedPrograms]);

  const extratoGlobal = useMemo(() => {
    const items: ExtratoItem[] = [];

    allPersistedPrograms.forEach(({ meta, state }) => {
      (state.movimentos ?? []).forEach((mov) => {
        const tipo: MovimentoTipo = mov.tipo === "saida" ? "saida" : "entrada";
        items.push({
          id: mov.id ?? `${meta.slug}-${mov.data ?? "sem-data"}-${mov.descricao ?? "mov"}`,
          programSlug: meta.slug,
          programName: meta.name,
          programLogo: meta.logo,
          programLogoColor: meta.logoColor,
          data: mov.data ?? "-",
          tipo,
          descricao:
            mov.descricao ??
            (tipo === "entrada" ? "Entrada de milhas" : "Saída de milhas"),
          milhas: Number(mov.milhas ?? 0),
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

  const handleDownloadEconomiaPdf = async () => {
    if (!economiaReportRef.current) return;

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const canvas = await html2canvas(economiaReportRef.current, {
      scale: 2,
      backgroundColor: "#f8fafc",
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 12;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 6;
    pdf.addImage(imgData, "PNG", 6, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 12;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + 6;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 6, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - 12;
    }

    const dataArquivo = new Date().toISOString().slice(0, 10);
    pdf.save(`analise-economia-12m-${dataArquivo}.pdf`);
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <DashboardHeader />

      <BalanceTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        economyTrend={analiseEconomia.trend}
      />

      {managerClientId && (
        <div className="px-5 pb-2">
          <div className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
            Visualizando como gestor
          </div>
        </div>
      )}

      {activeTab === "saldo" && (
        <>
          <div className="px-5 pb-2">
            <div className="relative inline-block">
              {managerMode && !managerClientId ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsClientesAtivosOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Plus size={14} />
                    {gestorKpis.totalClientesAtivos} clientes ativos
                  </button>
                  {isClientesAtivosOpen && (
                    <div className="absolute left-0 z-20 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Clientes vinculados (ativos)
                      </p>
                      {resumoClientes.length > 0 ? (
                        <ul className="mb-3 max-h-32 space-y-1 overflow-y-auto text-xs">
                          {resumoClientes.map((c) => (
                            <li key={c.clienteId} className="flex items-center justify-between rounded-lg px-2 py-1.5 bg-muted/50">
                              <span className="truncate">{c.nome}</span>
                              <span className="text-muted-foreground tabular-nums shrink-0">{c.milhas.toLocaleString("pt-BR")} pts</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mb-3 text-xs text-muted-foreground">Nenhum cliente vinculado ainda.</p>
                      )}
                      <div className="border-t border-slate-200 dark:border-slate-600 pt-2">
                        <p className="mb-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400">Vincular novo cliente</p>
                        <p className="mb-1.5 text-[10px] text-muted-foreground">Peça o ID da conta do cliente (menu ☰ na conta dele) e cole abaixo.</p>
                        <div className="flex gap-2">
                          <Input
                            placeholder="UUID do cliente"
                            value={vincularIdInput}
                            onChange={(e) => setVincularIdInput(e.target.value)}
                            className="h-9 text-xs font-mono"
                          />
                          <Button
                            size="sm"
                            className="h-9 shrink-0"
                            disabled={!vincularIdInput.trim() || isVincularLoading}
                            onClick={async () => {
                              const id = vincularIdInput.trim();
                              if (!id) return;
                              try {
                                await vincular(id);
                                setVincularIdInput("");
                                setIsClientesAtivosOpen(false);
                                toast.success("Cliente vinculado. Agora ele entra nos cálculos dos cards.");
                              } catch (err: unknown) {
                                toast.error(getErrorMessage(err));
                              }
                            }}
                          >
                            {isVincularLoading ? "..." : "Vincular"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsAddProgramMenuOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Plus size={14} />
                    Adicionar programa
                  </button>

                  {isAddProgramMenuOpen && (
                    <div className="absolute left-0 z-20 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Selecione os programas
                      </p>
                      <div className="space-y-1">
                        {AVAILABLE_PROGRAM_OPTIONS.map((option) => (
                          <label
                            key={option.programId}
                            className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-left text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={programDefs.some(
                                (program) => program.programId === option.programId,
                              )}
                              onChange={() => handleToggleProgramCard(option)}
                              className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                            />
                            <span
                              className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold ring-1 ring-black/10"
                              style={{
                                backgroundColor: `${option.logoColor}1f`,
                                color: option.logoColor,
                              }}
                            >
                              {optionLogoImages[option.programId] ? (
                                <img
                                  src={optionLogoImages[option.programId]}
                                  alt={`Logo ${option.name}`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                option.logo
                              )}
                            </span>
                            <span>{option.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {managerMode && !managerClientId ? (
            <div className="grid grid-cols-2 gap-3 px-5">
              <div
                className={`relative col-span-2 cursor-default rounded-2xl border-2 p-4 shadow-sm ${
                  gestorScore >= 600
                    ? "border-emerald-500/60 bg-emerald-500/5 dark:bg-emerald-500/10"
                    : gestorScore >= 300
                      ? "border-amber-500/60 bg-amber-500/5 dark:bg-amber-500/10"
                      : "border-red-500/50 bg-red-500/5 dark:bg-red-500/10"
                }`}
              >
                <p className="text-[11px] font-medium text-muted-foreground">Score de desempenho do gestor</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  <span
                    className={
                      gestorScore >= 600
                        ? "text-emerald-600 dark:text-emerald-400"
                        : gestorScore >= 300
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                    }
                  >
                    {gestorScore}
                  </span>
                  <span className="text-muted-foreground font-normal text-sm"> / 1.000</span>
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Avaliação da economia trazida para todos os clientes sob gestão
                </p>
              </div>
              <div className="relative cursor-default rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <p className="text-[11px] font-medium text-muted-foreground">Economia total gerada</p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {gestorKpis.economiaTotalGestao.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0,
                    minimumFractionDigits: 0,
                  })}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">sob gestão (todos os clientes)</p>
              </div>
              <div className="relative cursor-default rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <p className="text-[11px] font-medium text-muted-foreground">ROI médio</p>
                <p className="mt-2 text-lg font-semibold tabular-nums">
                  {gestorKpis.roiMedio.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    maximumFractionDigits: 0,
                    minimumFractionDigits: 0,
                  })}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">consolidado (todos os clientes)</p>
              </div>
              <div className="relative col-span-2 cursor-default rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <p className="text-[11px] font-medium text-muted-foreground">Clientes com milhas vencendo &lt;90 dias</p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  {gestorKpis.clientesComVencendo90d}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">clientes com pontos a vencer nos próximos 90 dias</p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 px-5">
                {visiblePrograms.map((prog) => (
                  <ProgramCard
                    key={prog.programId}
                    {...prog}
                    managerClientId={managerClientId}
                    onLogoImageChange={(imageDataUrl) =>
                      handleProgramLogoChange(prog.programId, imageDataUrl)
                    }
                  />
                ))}
              </div>

              {!showAll && programs.length > 4 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="mx-auto mt-3 flex items-center gap-1 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown size={16} />
                  Ver todos
                </button>
              )}

              <QuickSearch />
              <ExploreDestinations />
            </>
          )}

        </>
      )}

      {activeTab === "vencendo" && (
        <div className="space-y-3 px-5">
          {vencimentosGlobais.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
              Nenhum vencimento encontrado nos programas registrados.
            </div>
          )}
          {vencimentosGlobais.map((item) => (
            <div
              key={`${item.programSlug}-${item.data}-${item.quantidade}`}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-black/10"
                    style={{
                      backgroundColor: `${item.programLogoColor}1f`,
                      color: item.programLogoColor,
                    }}
                  >
                    {item.programLogo}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      {item.programName}
                    </p>
                    <p className="text-[11px] text-slate-500">{item.data}</p>
                  </div>
                </div>
                <p className="text-xs font-semibold text-slate-900">
                  {item.quantidade.toLocaleString("pt-BR")} milhas
                </p>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {item.diasRestantes < 0
                  ? `Venceu há ${Math.abs(item.diasRestantes)} dias`
                  : `Vence em ${item.diasRestantes} dias`}
              </p>
            </div>
          ))}
        </div>
      )}

      {activeTab === "extrato" && (
        <div className="space-y-2 px-5">
          {extratoGlobal.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
              Nenhuma entrada ou saída registrada ainda.
            </div>
          )}
          {extratoGlobal.map((item) => (
            <div
              key={`${item.programSlug}-${item.id}`}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-1 ring-black/10"
                style={{
                  backgroundColor: `${item.programLogoColor}1f`,
                  color: item.programLogoColor,
                }}
              >
                {item.programLogo}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-900">
                  {item.descricao}
                </p>
                <p className="text-[11px] text-slate-500">
                  {item.programName} • {item.data}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`text-xs font-semibold ${
                    item.tipo === "entrada" ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {item.tipo === "entrada" ? "+" : "-"}
                  {Math.abs(item.milhas).toLocaleString("pt-BR")}
                </p>
                <p className="text-[10px] text-slate-500">
                  {item.tipo === "entrada" ? "Entrada" : "Saída"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "economia" && (
        <div className="space-y-3 px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
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
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {opcao.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={handleDownloadEconomiaPdf}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <Download size={14} />
              Baixar PDF
            </button>
          </div>
          <div ref={economiaReportRef} className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">
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
            <p className="mt-1 text-[11px] text-slate-500">
              Custo de compra de pontos no período:{" "}
              {analiseEconomia.custoTotalCompras.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-700">
              Passagens emitidas que geraram economia/prejuízo
            </p>
            {analiseEconomia.emissoes.length === 0 && (
              <p className="mt-3 text-xs text-slate-500">
                Nenhuma emissão registrada no período selecionado.
              </p>
            )}
            <div className="mt-3 space-y-2">
              {analiseEconomia.emissoes.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
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
                    <p className="text-[11px] font-semibold text-slate-800">
                      {item.programName} • {item.data}
                    </p>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-900">
                    {item.descricao}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
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
                    <span className="text-slate-600">
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

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-700">
              Pontos comprados e custos (últimos {economiaPeriodoMeses}{" "}
              {economiaPeriodoMeses === 1 ? "mês" : "meses"})
            </p>
            {analiseEconomia.compras.length === 0 && (
              <p className="mt-3 text-xs text-slate-500">
                Nenhuma compra de pontos registrada no período selecionado.
              </p>
            )}
            <div className="mt-3 space-y-2">
              {analiseEconomia.compras.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
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
                    <p className="text-[11px] font-semibold text-slate-800">
                      {item.programName} • {item.data}
                    </p>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-900">
                    {item.descricao}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-600">
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
        </div>
      )}

      <BottomNav
        activeItem={activeNav}
        onItemChange={setActiveNav}
        showClientSelector={managerMode}
        clients={clientsForBottomNav}
        selectedClientId={managerClientId}
        onClientSelect={(clientId) => {
          if (managerMode && user?.id && typeof window !== "undefined") {
            const key = `${MANAGER_ACCESSED_CLIENTS_PREFIX}${user.id}`;
            const raw = window.localStorage.getItem(key);
            let list: Array<{ id: string; name?: string }> = [];
            if (raw) {
              try {
                list = JSON.parse(raw);
                if (!Array.isArray(list)) list = [];
              } catch {
                list = [];
              }
            }
            const existing = list.find((c) => c.id === clientId);
            if (!existing) {
              const name = clientsForBottomNav.find((c) => c.id === clientId)?.name;
              list.push({ id: clientId, name });
              window.localStorage.setItem(key, JSON.stringify(list));
              setAccessedClientsVersion((v) => v + 1);
            }
          }
          const query = new URLSearchParams(searchParams);
          query.set("clientId", clientId);
          navigate(`/?${query.toString()}`);
        }}
        onBackToMyAccount={
          managerMode
            ? () => {
                const query = new URLSearchParams(searchParams);
                query.delete("clientId");
                const q = query.toString();
                navigate(q ? `/?${q}` : "/");
              }
            : undefined
        }
      />
    </div>
  );
};

export default Index;
