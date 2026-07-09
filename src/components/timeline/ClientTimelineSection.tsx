import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownCircle,
  ArrowLeftRight,
  ArrowUpCircle,
  CheckCircle2,
  ClipboardList,
  Flag,
  RotateCcw,
  Sparkles,
  StickyNote,
  Tag,
  TrendingUp,
  Zap,
} from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { cn } from "@/lib/utils";

import {
  type UnifiedTimelineEvento,
  useClienteTimelineUnificada,
} from "@/hooks/useClienteTimelineUnificada";

function timelineUiError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();

  if (
    message.includes("permission") ||
    message.includes("permiss") ||
    message.includes("forbidden") ||
    message.includes("rls") ||
    message.includes("policy") ||
    message.includes("jwt") ||
    message.includes("auth")
  ) {
    return "Não foi possível confirmar sua permissão para ver a timeline. Recarregue ou acione o suporte se continuar.";
  }

  return "Não foi possível carregar a timeline agora. Tente novamente em instantes.";
}

/** Rótulos dos tipos vindos da timeline unificada (mesma fonte do manager). */
const TYPE_LABEL: Record<string, string> = {
  demanda_criada: "Demanda criada",
  demanda_concluida: "Demanda concluída",
  entrada: "Entrada",
  saida: "Saída",
  transferencia: "Transferência",
  emissao: "Emissão",
  marco_inicio: "Início da gestão",
  cotacao: "Cotação",
  promocao: "Promoção",
  oportunidade: "Oportunidade",
  nota: "Nota",
};

const TYPE_ICON: Record<string, typeof Zap> = {
  demanda_criada: ClipboardList,
  demanda_concluida: CheckCircle2,
  entrada: ArrowDownCircle,
  saida: ArrowUpCircle,
  transferencia: ArrowLeftRight,
  emissao: Zap,
  marco_inicio: Flag,
  cotacao: TrendingUp,
  promocao: Tag,
  oportunidade: Sparkles,
  nota: StickyNote,
};

function labelFor(tipo: string) {
  return TYPE_LABEL[tipo] ?? (tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : "Evento");
}

export default function ClientTimelineSection({
  clienteId,
  enabled,
}: {
  clienteId: string | null;
  enabled: boolean;
}) {
  const [tipoEvento, setTipoEvento] = useState<string>("all");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  const { data: allEvents = [], isLoading, error, refetch, isFetching } = useClienteTimelineUnificada(
    clienteId,
    enabled,
    { startDate, endDate },
  );

  // Opções do filtro derivadas do que existe na timeline (não lista tipo vazio).
  const tiposDisponiveis = useMemo(
    () => [...new Set(allEvents.map((ev) => ev.tipo).filter(Boolean))],
    [allEvents],
  );

  const events = useMemo(
    () => (tipoEvento === "all" ? allEvents : allEvents.filter((ev) => ev.tipo === tipoEvento)),
    [allEvents, tipoEvento],
  );

  const formatDt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const hasAnyFilter = tipoEvento !== "all" || !!startDate || !!endDate;

  return (
    <Card className="mt-2 rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
      <CardHeader className="pb-2 pt-4">
        <p className="text-sm font-semibold text-foreground">Timeline</p>
        <p className="text-xs text-muted-foreground">
          Tudo que já foi feito pra você na gestão: demandas, movimentos, transferências e emissões.
        </p>
      </CardHeader>

      <CardContent className="space-y-4 pb-4 pt-0">
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Tipo</p>
          <Select value={tipoEvento} onValueChange={setTipoEvento}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {tiposDisponiveis.map((t) => (
                <SelectItem key={t} value={t}>
                  {labelFor(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Data inicial</p>
            <DatePickerField
              value={startDate ?? ""}
              onChange={(ymd) => setStartDate(ymd || null)}
              placeholder="Início (opcional)"
              triggerClassName="w-full"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Data final</p>
            <DatePickerField
              value={endDate ?? ""}
              onChange={(ymd) => setEndDate(ymd || null)}
              placeholder="Fim (opcional)"
              triggerClassName="w-full"
            />
          </div>
        </div>

        {hasAnyFilter && (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setTipoEvento("all");
                setStartDate(null);
                setEndDate(null);
              }}
            >
              Limpar filtros
            </Button>
          </div>
        )}

        {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Carregando timeline…</p>}
        {error && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-sm text-destructive">{timelineUiError(error)}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RotateCcw className="h-3 w-3" />
              {isFetching ? "Tentando..." : "Tentar novamente"}
            </Button>
          </div>
        )}

        {!isLoading && !error && events.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum evento encontrado.</p>
        )}

        {!isLoading && !error && events.length > 0 && (
          <ul className="space-y-2">
            {events.map((ev, idx) => {
              const Icon = TYPE_ICON[ev.tipo] ?? Zap;
              const meta = ev.metadata;
              /** Linha de detalhe (milhas ±, programa, rota) por tipo. */
              let metaLine: ReactNode = null;
              if (ev.tipo === "entrada" || ev.tipo === "saida") {
                const milhas = Number(meta.milhas);
                const programa = meta.programa ? String(meta.programa) : null;
                if (milhas > 0) {
                  const entrada = ev.tipo === "entrada";
                  metaLine = (
                    <p className="mt-1 text-[11px]">
                      <span className={cn("font-semibold", entrada ? "text-green-600" : "text-amber-600")}>
                        {entrada ? "+" : "-"}
                        {milhas.toLocaleString("pt-BR")} milhas
                      </span>
                      {programa && <span className="text-muted-foreground"> · {programa}</span>}
                    </p>
                  );
                }
              } else if (ev.tipo === "transferencia") {
                const nomeOrigem = meta.nomeOrigem ? String(meta.nomeOrigem) : null;
                const nomeDestino = meta.nomeDestino ? String(meta.nomeDestino) : null;
                const creditado = Number(meta.creditado);
                if (nomeOrigem && nomeDestino) {
                  metaLine = (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {nomeOrigem} → {nomeDestino}
                      {creditado > 0 && (
                        <>
                          {" · "}
                          <span className="font-semibold text-green-600">
                            +{creditado.toLocaleString("pt-BR")} milhas
                          </span>
                        </>
                      )}
                    </p>
                  );
                }
              } else if (ev.tipo === "emissao") {
                const milhasUtilizadas = Number(meta.milhas_utilizadas ?? meta.milhasUtilizadas ?? meta.milhas);
                if (milhasUtilizadas > 0) {
                  metaLine = (
                    <p className="mt-1 text-[11px] text-amber-600">
                      -{milhasUtilizadas.toLocaleString("pt-BR")} milhas
                    </p>
                  );
                }
              }
              return (
                <li
                  key={`${ev.tipo}-${ev.data}-${idx}`}
                  className={cn(
                    "rounded-xl border border-border/70 bg-background/50 px-3 py-2.5",
                    ev.tipo === "demanda_concluida" && "border-green-400/40",
                    ev.tipo === "marco_inicio" && "border-primary/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-foreground">{ev.titulo}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{ev.descricao}</p>
                        {metaLine}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-medium text-muted-foreground">{labelFor(ev.tipo)}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDt(ev.data)}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
