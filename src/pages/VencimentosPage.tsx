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
    return items.sort((a, b) => a.diasRestantes - b.diasRestantes).slice(0, 200);
  }, [meusProgramas]);

  const meusCounts = useMemo(() => ({
    critico: meusVencimentos.filter((i) => i.diasRestantes <= 30).length,
    atencao: meusVencimentos.filter((i) => i.diasRestantes > 30 && i.diasRestantes <= 60).length,
    ok: meusVencimentos.filter((i) => i.diasRestantes > 60).length,
  }), [meusVencimentos]);

  const filteredMeus = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meusVencimentos.filter((item) => {
      const matchesSearch = !q || item.programName.toLowerCase().includes(q);
      const matchesFilter =
        filter === "todos" || getUrgency(item.diasRestantes) === filter;
      return matchesSearch && matchesFilter;
    });
  }, [meusVencimentos, search, filter]);

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
  const counts = isGestor ? gestorCounts : meusCounts;
  const isListEmpty = isGestor ? filteredGestor.length === 0 : filteredMeus.length === 0;
  const hasAnyData = isGestor ? vencimentosOrdenados.length > 0 : meusVencimentos.length > 0;

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

  const renderMeuCard = (item: VencimentoMeuItem, idx: number) => {
    const urgency = getUrgency(item.diasRestantes);
    const cfg = urgencyConfig[urgency];
    const prevUrgency =
      idx > 0 ? getUrgency(filteredMeus[idx - 1].diasRestantes) : null;
    const showSectionLabel = urgency !== prevUrgency && filter === "todos";

    return (
      <Fragment key={`${item.programName}-${item.data}-${idx}`}>
        {showSectionLabel && (
          <p className={`px-0.5 pt-1 text-[10px] font-bold uppercase tracking-widest ${cfg.sectionColor}`}>
            {cfg.sectionLabel}
          </p>
        )}
        <div className={`flex w-full overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] ${cfg.cardBorder}`}>
          <div className="flex-1 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-semibold text-gray-900">
                {item.programName}
              </span>
              <span className={`flex-shrink-0 rounded-lg px-2.5 py-0.5 text-[11px] font-extrabold ${cfg.badge}`}>
                {item.diasRestantes} dias
              </span>
            </div>
            <div className="mt-1 text-[11px] text-gray-400">
              {item.quantidade.toLocaleString("pt-BR")} pts · {item.data}
            </div>
          </div>
        </div>
      </Fragment>
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
          <h1 className="text-[15px] font-bold tracking-tight text-gray-900">Vencendo</h1>
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
            placeholder={isGestor ? "Buscar cliente..." : "Buscar programa..."}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-[13px] text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-purple-600 focus:ring-2 focus:ring-purple-600/10"
          />
        </div>

        {/* Filter chips */}
        {hasAnyData && renderChips()}

        {/* List */}
        {isListEmpty ? (
          <p className="py-10 text-center text-[13px] text-gray-400">
            {search || filter !== "todos"
              ? "Nenhum cliente encontrado para o filtro selecionado."
              : "Nenhum vencimento nos próximos dias na carteira."}
          </p>
        ) : isGestor ? (
          <div className="flex flex-col gap-1.5">
            {filteredGestor.map((item, idx) => renderGestorCard(item, idx))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredMeus.map((item, idx) => renderMeuCard(item, idx))}
          </div>
        )}
      </main>
    </div>
  );
};

export default VencimentosPage;
