import { useState, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Zap, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGestor } from "@/hooks/useGestor";
import { useProgramasCliente } from "@/hooks/useProgramasCliente";
import type { GestorVencimentoItem } from "@/hooks/useGestor";

type FilterKey = "todos" | "critico" | "atencao" | "ok";

type VencimentoMeuItem = {
  programName: string;
  data: string;
  diasRestantes: number;
  quantidade: number;
};

const getUrgency = (dias: number): Exclude<FilterKey, "todos"> => {
  if (dias <= 30) return "critico";
  if (dias <= 60) return "atencao";
  return "ok";
};

const urgencyConfig = {
  critico: {
    cardBorder: "border border-l-4 border-red-200 border-l-red-600",
    badge: "bg-red-50 text-red-600",
    sectionLabel: "Crítico — até 30 dias",
    sectionColor: "text-red-500",
  },
  atencao: {
    cardBorder: "border border-l-4 border-amber-200 border-l-amber-500",
    badge: "bg-amber-50 text-amber-600",
    sectionLabel: "Atenção — 31 a 60 dias",
    sectionColor: "text-amber-500",
  },
  ok: {
    cardBorder: "border border-l-4 border-slate-200 border-l-green-600",
    badge: "bg-green-50 text-green-700",
    sectionLabel: "Tranquilo — acima de 60 dias",
    sectionColor: "text-green-600",
  },
};

const AVATAR_GRADIENTS: [string, string][] = [
  ["from-red-600", "to-rose-500"],
  ["from-purple-700", "to-violet-500"],
  ["from-orange-500", "to-amber-400"],
  ["from-blue-700", "to-blue-500"],
  ["from-green-700", "to-green-500"],
  ["from-indigo-700", "to-indigo-500"],
];

const getAvatarGradient = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  const [from, to] = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
  return `bg-gradient-to-br ${from} ${to}`;
};

const getInitials = (name: string): string =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

const formatDataVencimento = (dateStr: string): string => {
  // dateStr is "DD/MM/YYYY" from toLocaleDateString pt-BR
  const [d, m, y] = dateStr.split("/");
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
};

const VencimentosPage = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isGestor = role === "gestor" || role === "admin";

  const { vencimentosTodosClientes, demandasGestor } = useGestor(isGestor);
  const { data: meusProgramas } = useProgramasCliente(undefined);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // ── Gestor list ──────────────────────────────────────────────
  const vencimentosOrdenados = useMemo(
    () => [...(vencimentosTodosClientes ?? [])].slice(0, 200),
    [vencimentosTodosClientes],
  );

  const gestorCounts = useMemo(() => ({
    critico: vencimentosOrdenados.filter((i) => i.diasRestantes <= 30).length,
    atencao: vencimentosOrdenados.filter((i) => i.diasRestantes > 30 && i.diasRestantes <= 60).length,
    ok: vencimentosOrdenados.filter((i) => i.diasRestantes > 60).length,
  }), [vencimentosOrdenados]);

  const filteredGestor = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vencimentosOrdenados.filter((item) => {
      const matchesSearch = !q || item.clienteNome.toLowerCase().includes(q);
      const matchesFilter =
        filter === "todos" || getUrgency(item.diasRestantes) === filter;
      return matchesSearch && matchesFilter;
    });
  }, [vencimentosOrdenados, search, filter]);

  // ── Non-gestor list ──────────────────────────────────────────
  const meusVencimentos = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const msDia = 1000 * 60 * 60 * 24;
    const items: VencimentoMeuItem[] = [];
    (meusProgramas ?? []).forEach((row) => {
      const state = row.state as {
        lotes?: Array<{ validadeLote?: string; quantidade?: number }>;
        movimentos?: Array<{ tipo?: string; validadeLote?: string; milhas?: number }>;
      } | null;
      const lotes = (state?.lotes ?? [])
        .filter((l) => !!l.validadeLote && (l.quantidade ?? 0) > 0)
        .map((l) => ({ validadeLote: l.validadeLote!, quantidade: Number(l.quantidade ?? 0) }));
      const fallback = (state?.movimentos ?? [])
        .filter((m) => m.tipo === "entrada" && !!m.validadeLote && Number(m.milhas ?? 0) > 0)
        .map((m) => ({ validadeLote: m.validadeLote!, quantidade: Number(m.milhas ?? 0) }));
      const lista = lotes.length > 0 ? lotes : fallback;
      lista.forEach((lote) => {
        const validade = new Date(`${lote.validadeLote}T00:00:00`);
        if (Number.isNaN(validade.getTime())) return;
        const diasRestantes = Math.ceil((validade.getTime() - hoje.getTime()) / msDia);
        items.push({
          programName: row.program_name ?? row.program_id,
          data: validade.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
          diasRestantes,
          quantidade: lote.quantidade,
        });
      });
    });
    return items
      .filter((i) => i.diasRestantes > 0)
      .sort((a, b) => a.diasRestantes - b.diasRestantes)
      .slice(0, 200);
  }, [meusProgramas]);

  const meusBands = useMemo(
    () => ({
      critico: meusVencimentos.filter((i) => i.diasRestantes <= 30),
      atencao: meusVencimentos.filter((i) => i.diasRestantes > 30 && i.diasRestantes <= 60),
      ok: meusVencimentos.filter((i) => i.diasRestantes > 60),
    }),
    [meusVencimentos],
  );

  // ── Demanda banner ───────────────────────────────────────────
  const demandaPendentes = useMemo(
    () => (demandasGestor ?? []).filter((d) => d.status === "pendente").length,
    [demandasGestor],
  );
  const demandaAndamento = useMemo(
    () => (demandasGestor ?? []).filter((d) => d.status === "em_andamento").length,
    [demandasGestor],
  );
  const totalDemandas = demandaPendentes + demandaAndamento;
  const showBanner = isGestor && totalDemandas > 0 && !bannerDismissed;

  const handleOpenClient = (clientId: string) => {
    navigate(`/?clientId=${encodeURIComponent(clientId)}`);
  };

  // ── Helpers ──────────────────────────────────────────────────
  const counts = gestorCounts;
  const isListEmpty = filteredGestor.length === 0;
  const hasAnyData = vencimentosOrdenados.length > 0;

  const renderChips = () => (
    <div className="flex flex-wrap gap-1.5">
      {(["todos", "critico", "atencao", "ok"] as FilterKey[]).map((key) => {
        const isActive = filter === key;
        const label =
          key === "todos"
            ? `Todos (${counts.critico + counts.atencao + counts.ok})`
            : key === "critico"
            ? `🔴 Crítico (${counts.critico})`
            : key === "atencao"
            ? `🟡 Atenção (${counts.atencao})`
            : `🟢 OK (${counts.ok})`;

        return (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={
              isActive
                ? "rounded-full px-3 py-1 text-[11px] font-bold text-white"
                : key === "critico"
                ? "rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50"
                : key === "atencao"
                ? "rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-bold text-amber-600 transition-colors hover:bg-amber-50"
                : key === "ok"
                ? "rounded-full border border-green-200 bg-white px-3 py-1 text-[11px] font-bold text-green-700 transition-colors hover:bg-green-50"
                : "rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-50"
            }
            style={isActive ? { background: "#8A05BE" } : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  const renderGestorCard = (item: GestorVencimentoItem, idx: number) => {
    const urgency = getUrgency(item.diasRestantes);
    const cfg = urgencyConfig[urgency];
    const prevUrgency =
      idx > 0 ? getUrgency(filteredGestor[idx - 1].diasRestantes) : null;
    const showSectionLabel = urgency !== prevUrgency && filter === "todos";

    return (
      <Fragment key={`${item.clienteId}-${item.programId}-${item.data}-${idx}`}>
        {showSectionLabel && (
          <p className={`px-0.5 pt-1 text-[10px] font-bold uppercase tracking-widest ${cfg.sectionColor}`}>
            {cfg.sectionLabel}
          </p>
        )}
        <button
          type="button"
          onClick={() => handleOpenClient(item.clienteId)}
          className={`flex w-full overflow-hidden rounded-xl bg-white text-left shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all hover:shadow-[0_4px_14px_rgba(0,0,0,0.09)] hover:-translate-y-px active:translate-y-0 ${cfg.cardBorder}`}
        >
          <div className="flex-1 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-semibold text-gray-900">
                {item.clienteNome}
              </span>
              <span className={`flex-shrink-0 rounded-lg px-2.5 py-0.5 text-[11px] font-extrabold ${cfg.badge}`}>
                {item.diasRestantes} dias
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="truncate text-[11px] text-gray-500">{item.programName}</span>
              <span className="flex-shrink-0 text-[11px] text-gray-400">
                {item.quantidade.toLocaleString("pt-BR")} pts · {item.data}
              </span>
            </div>
          </div>
        </button>
      </Fragment>
    );
  };

  const renderMeuBandHeader = (
    variant: "critico" | "atencao" | "ok",
    label: string,
    pill: string,
  ) => {
    const colors =
      variant === "critico"
        ? { dot: "bg-red-500", title: "text-red-700", pill: "bg-red-50 text-red-700" }
        : variant === "atencao"
        ? { dot: "bg-amber-500", title: "text-amber-800", pill: "bg-amber-50 text-amber-800" }
        : { dot: "bg-green-500", title: "text-green-800", pill: "bg-green-50 text-green-800" };
    return (
      <div className="flex items-center gap-2 px-0.5">
        <div className={`h-2 w-2 flex-shrink-0 rounded-full ${colors.dot}`} />
        <span className={`flex-1 text-[11px] font-extrabold uppercase tracking-wide ${colors.title}`}>
          {label}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${colors.pill}`}>
          {pill}
        </span>
      </div>
    );
  };

  const renderMeuCard2 = (item: VencimentoMeuItem, idx: number = 0) => {
    const urgency = getUrgency(item.diasRestantes);
    const dayColor =
      urgency === "critico"
        ? "text-red-500"
        : urgency === "atencao"
        ? "text-amber-500"
        : "text-green-500";
    return (
      <div
        key={`${item.programName}-${item.data}-${idx}`}
        className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
      >
        <div
          className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[10px] text-[11px] font-black text-white ${getAvatarGradient(item.programName)}`}
        >
          {getInitials(item.programName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-bold text-gray-900">{item.programName}</div>
          <div className="mt-0.5 text-[10px] text-gray-400">
            {item.quantidade.toLocaleString("pt-BR")} pts · {formatDataVencimento(item.data)}
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className={`text-[14px] font-black leading-none ${dayColor}`}>
            {item.diasRestantes}
          </div>
          <div className="mt-0.5 text-[9px] font-semibold text-gray-400">dias</div>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-[#f4f4f8] pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-bold tracking-tight text-gray-900">
              Milhas Vencendo
            </h1>
            {!isGestor && meusVencimentos.length > 0 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                {meusVencimentos.length} {meusVencimentos.length === 1 ? "programa" : "programas"}
              </span>
            )}
          </div>
          <div className="w-9" />
        </div>
      </header>

      <main className="flex flex-col gap-3 p-3.5">
        {/* Demanda banner */}
        {showBanner && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-800">
            <Zap size={14} className="flex-shrink-0 text-amber-500" strokeWidth={2} />
            <span>
              <strong>Demandas abertas:</strong> {totalDemandas} (pendentes: {demandaPendentes} · andamento: {demandaAndamento})
            </span>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="ml-auto text-amber-500 transition-colors hover:text-amber-700"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Search */}
        {isGestor && (
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              strokeWidth={2}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-[13px] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-600/10"
            />
          </div>
        )}

        {/* Filter chips */}
        {isGestor && hasAnyData && renderChips()}

        {/* List */}
        {isGestor ? (
          isListEmpty ? (
            <p className="py-10 text-center text-[13px] text-gray-400">
              {search || filter !== "todos"
                ? "Nenhum cliente encontrado para o filtro selecionado."
                : "Nenhum vencimento nos próximos dias na carteira."}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filteredGestor.map((item, idx) => renderGestorCard(item, idx))}
            </div>
          )
        ) : meusVencimentos.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <span className="text-5xl opacity-20">🎉</span>
            <p className="text-[14px] font-bold text-gray-700">Tudo em dia!</p>
            <p className="text-[12px] leading-relaxed text-gray-400">
              Nenhuma milha vencendo nos próximos dias.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {meusBands.critico.length > 0 && (
              <div className="flex flex-col gap-2">
                {renderMeuBandHeader("critico", "Crítico", "≤ 30 dias")}
                <div className="flex flex-col gap-1.5">
                  {meusBands.critico.map(renderMeuCard2)}
                </div>
              </div>
            )}
            {meusBands.critico.length > 0 && meusBands.atencao.length > 0 && (
              <div className="h-px bg-gray-200" />
            )}
            {meusBands.atencao.length > 0 && (
              <div className="flex flex-col gap-2">
                {renderMeuBandHeader("atencao", "Atenção", "31 – 60 dias")}
                <div className="flex flex-col gap-1.5">
                  {meusBands.atencao.map(renderMeuCard2)}
                </div>
              </div>
            )}
            {(meusBands.critico.length > 0 || meusBands.atencao.length > 0) &&
              meusBands.ok.length > 0 && <div className="h-px bg-gray-200" />}
            {meusBands.ok.length > 0 && (
              <div className="flex flex-col gap-2">
                {renderMeuBandHeader("ok", "Tranquilo", "> 60 dias")}
                <div className="flex flex-col gap-1.5">
                  {meusBands.ok.map(renderMeuCard2)}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default VencimentosPage;
