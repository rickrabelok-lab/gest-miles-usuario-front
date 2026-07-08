import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Crown, Radar } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";

export type OportunidadeVoo = {
  id: number;
  origem: string;
  destino: string;
  programa: string;
  classe: string;
  milhas: number;
  data_voo: string | null;
  valor_estimado: number;
  regiao_destino: string | null;
  data_detectada: string;
};

const PROGRAMAS = [
  "LATAM Pass",
  "Smiles",
  "TudoAzul",
  "Flying Blue",
  "Iberia Plus",
] as const;

const REGIOES = [
  "Brasil",
  "Estados Unidos",
  "Europa",
  "Oriente Médio",
  "Ásia",
  "América do Sul",
] as const;

const CLASSES = [
  { value: "todas", label: "Todas" },
  { value: "Executiva", label: "Executiva" },
  { value: "Econômica", label: "Econômica" },
  { value: "Primeira Classe", label: "Primeira Classe" },
] as const;

type SortOption = "value" | "miles" | "newest";
const RADAR_OPORTUNIDADES_INITIAL_LIMIT = 80;

const RadarOportunidadesPage = () => {
  const navigate = useNavigate();
  const [list, setList] = useState<OportunidadeVoo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filterPrograma, setFilterPrograma] = useState<string>("");
  const [filterRegiao, setFilterRegiao] = useState<string>("");
  const [filterClasse, setFilterClasse] = useState<string>("todas");
  const [sort, setSort] = useState<SortOption>("newest");
  const hasActiveFilters = Boolean(filterPrograma || filterRegiao || filterClasse !== "todas");

  const load = useCallback(async (isCancelled: () => boolean = () => false) => {
    setLoading(true);
    setLoadError(null);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { data, error } = await supabase
        .from("oportunidades_voo")
        .select("id, origem, destino, programa, classe, milhas, data_voo, valor_estimado, regiao_destino, data_detectada")
        .or(`data_voo.is.null,data_voo.gte.${today}`)
        .order("data_detectada", { ascending: false })
        .limit(RADAR_OPORTUNIDADES_INITIAL_LIMIT);
      if (isCancelled()) return;
      if (error) {
        console.warn("[Radar] oportunidades_voo:", error.message);
        setList([]);
        setLoadError("Não foi possível carregar as oportunidades agora.");
        return;
      }
      setList(
        (data ?? []).map((row) => ({
          id: Number(row.id),
          origem: String(row.origem ?? ""),
          destino: String(row.destino ?? ""),
          programa: String(row.programa ?? ""),
          classe: String(row.classe ?? ""),
          milhas: Number(row.milhas ?? 0),
          data_voo: row.data_voo ? String(row.data_voo) : null,
          valor_estimado: Number(row.valor_estimado ?? 0),
          regiao_destino: row.regiao_destino ? String(row.regiao_destino) : null,
          data_detectada: String(row.data_detectada ?? ""),
        })),
      );
    } catch (error) {
      if (!isCancelled()) {
        console.warn("[Radar] oportunidades_voo:", error);
        setList([]);
        setLoadError("Não foi possível carregar as oportunidades agora.");
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const filtered = useMemo(() => {
    let result = [...list];
    if (filterPrograma) {
      result = result.filter((o) => o.programa === filterPrograma);
    }
    if (filterRegiao) {
      result = result.filter(
        (o) => (o.regiao_destino ?? "").toLowerCase() === filterRegiao.toLowerCase(),
      );
    }
    if (filterClasse && filterClasse !== "todas") {
      result = result.filter(
        (o) => (o.classe ?? "").toLowerCase() === filterClasse.toLowerCase(),
      );
    }
    if (sort === "value") {
      result.sort((a, b) => {
        const ratioA = a.milhas > 0 ? a.valor_estimado / a.milhas : 0;
        const ratioB = b.milhas > 0 ? b.valor_estimado / b.milhas : 0;
        return ratioB - ratioA;
      });
    } else if (sort === "miles") {
      result.sort((a, b) => a.milhas - b.milhas);
    } else {
      result.sort(
        (a, b) =>
          new Date(b.data_detectada).getTime() - new Date(a.data_detectada).getTime(),
      );
    }
    return result;
  }, [list, filterPrograma, filterRegiao, filterClasse, sort]);

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  const formatMiles = (n: number) =>
    new Intl.NumberFormat("pt-BR").format(n) + " milhas";
  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const clearFilters = () => {
    setFilterPrograma("");
    setFilterRegiao("");
    setFilterClasse("todas");
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-28">
      <header className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
            className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-nubank-border bg-white text-nubank-text transition-colors hover:bg-nubank-bg"
          >
            <ArrowLeft size={19} strokeWidth={2} />
          </button>
          <h1 className="font-display text-xl font-bold tracking-tight text-nubank-text">Radar</h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-nubank-tint px-3 py-1.5 text-[11.5px] font-semibold leading-none text-nubank-dark">
          <Crown size={12} strokeWidth={2} className="text-[#FFB020]" aria-hidden />
          Gest Miles+
        </span>
      </header>
      <p className="px-5 pt-1 text-[13px] text-nubank-text-secondary">
        Oportunidades de emissão detectadas pra você.
      </p>

      <main className="space-y-4 px-5 py-4">
        {/* Future notifications – structure only */}
        <div className="flex items-start gap-3 rounded-[16px] bg-nubank-tint px-4 py-3">
          <Radar size={16} strokeWidth={1.9} className="mt-0.5 flex-none text-nubank-primary" aria-hidden />
          <p className="text-xs leading-relaxed text-[#4A3358]">
            Em breve: você poderá receber alertas quando surgirem novas oportunidades na sua
            região ou classe preferida.
          </p>
        </div>

        {/* Filters */}
        <Card className="rounded-[20px] border-0 shadow-nubank-card">
          <CardContent className="space-y-3 px-4 pb-4 pt-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Filtros</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Programa</label>
                <Select value={filterPrograma || "todos"} onValueChange={(v) => setFilterPrograma(v === "todos" ? "" : v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="todos">Todos</SelectItem>
                    {PROGRAMAS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Região</label>
                <Select value={filterRegiao || "todas"} onValueChange={(v) => setFilterRegiao(v === "todas" ? "" : v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="todas">Todas</SelectItem>
                    {REGIOES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Classe</label>
                <Select value={filterClasse} onValueChange={setFilterClasse}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    {CLASSES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Ordenar</label>
                <Select
                  value={sort}
                  onValueChange={(v) => setSort(v as SortOption)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100]">
                    <SelectItem value="value">Melhor valor</SelectItem>
                    <SelectItem value="miles">Menor milhagem</SelectItem>
                    <SelectItem value="newest">Mais recentes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feed */}
        <div className="space-y-3">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : loadError ? (
            <div className="rounded-[18px] bg-white p-4 text-center shadow-nubank">
              <p className="text-sm text-nubank-text-secondary">{loadError}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 rounded-[12px] bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:opacity-95"
              >
                Tentar novamente
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[18px] bg-white p-4 text-center shadow-nubank">
              <p className="text-sm font-medium text-nubank-text">
                {hasActiveFilters
                  ? "Nenhuma oportunidade para estes filtros."
                  : "Nenhuma oportunidade ativa agora."}
              </p>
              <p className="mt-1 text-xs text-nubank-text-secondary">
                {hasActiveFilters
                  ? "Limpe os filtros para ver todas as oportunidades ainda disponíveis."
                  : "Quando surgir uma oferta futura ou sem data definida, ela aparece aqui."}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 rounded-[12px] bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:opacity-95"
                >
                  Limpar filtros
                </button>
              ) : null}
            </div>
          ) : (
            filtered.map((o) => (
              <Card
                key={o.id}
                className="rounded-[20px] border-0 shadow-nubank-card transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-nubank-hover"
              >
                <CardContent className="px-4 pb-4 pt-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display text-[15px] font-semibold tracking-tight text-nubank-text">
                      {o.origem} → {o.destino}
                    </p>
                    {o.regiao_destino && (
                      <span className="shrink-0 rounded-full bg-[#F1F0F3] px-2.5 py-1 text-[10.5px] font-semibold leading-none text-[#54535A]">
                        {o.regiao_destino}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-display text-[22px] font-bold tabular-nums leading-none tracking-tight text-nubank-text">
                      {new Intl.NumberFormat("pt-BR").format(o.milhas)}
                      <span className="text-[13px] font-semibold"> milhas</span>
                    </span>
                    <span className="text-[12.5px] text-nubank-text-secondary">
                      {o.programa} · {o.classe}
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#F1F0F3] pt-2.5">
                    <span className="text-[11.5px] text-nubank-text-secondary">
                      Voo: {formatDate(o.data_voo)}
                    </span>
                    <span className="text-[13px] font-bold tabular-nums text-primary">
                      ≈ {formatCurrency(o.valor_estimado)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate("/preferencias-sugestoes")}
          className="mx-auto block pt-1 text-center text-[13px] font-semibold text-primary hover:underline"
        >
          Ajustar preferências do radar →
        </button>
      </main>
    </div>
  );
};

export default RadarOportunidadesPage;
