import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle, Bell, ClipboardList, LogIn, RotateCcw, Star, TrendingUp, Zap, ThumbsUp } from "lucide-react";

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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import {
  type TimelineEventoTipo,
  useClientTimeline,
  loadGestoresForCliente,
} from "@/hooks/useClientTimeline";

function timelineUiError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();

  if (
    message.includes("permission") ||
    message.includes("permiss") ||
    message.includes("rls") ||
    message.includes("policy") ||
    message.includes("jwt") ||
    message.includes("auth")
  ) {
    return "Não foi possível confirmar sua permissão para ver a timeline. Recarregue ou acione o suporte se continuar.";
  }

  if (
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("fetch") ||
    message.includes("supabase") ||
    message.includes("timeline_eventos") ||
    message.includes("perfis") ||
    message.includes("cliente_gestores")
  ) {
    return "Não foi possível carregar a timeline agora. Recarregue antes de tratar o histórico como vazio.";
  }

  return "Não foi possível carregar a timeline agora. Tente novamente em instantes.";
}

export default function ClientTimelineSection({
  clienteId,
  enabled,
}: {
  clienteId: string | null;
  enabled: boolean;
}) {
  const [tipoEvento, setTipoEvento] = useState<"all" | TimelineEventoTipo>("all");
  const [gestorId, setGestorId] = useState<"all" | string>("all");
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  const [gestores, setGestores] = useState<Array<{ id: string; nome: string }>>([]);
  const [gestoresLoading, setGestoresLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!enabled || !clienteId) return;
    setGestoresLoading(true);
    void loadGestoresForCliente(clienteId)
      .then((list) => {
        if (!mounted) return;
        setGestores(list);
      })
      .catch((e) => {
        if (!mounted) return;
        console.warn("[ClientTimelineSection] gestores failed", e);
        toast.error("Não foi possível carregar o filtro de gestores agora.");
        setGestores([]);
      })
      .finally(() => {
        if (!mounted) return;
        setGestoresLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [clienteId, enabled]);

  const { data: events = [], isLoading, error, refetch, isFetching } = useClientTimeline(clienteId, enabled, {
    tipoEvento,
    gestorId,
    startDate,
    endDate,
  });

  const iconFor = (t: TimelineEventoTipo) => {
    switch (t) {
      case "EMISSAO":
        return Zap;
      case "NPS":
        return ThumbsUp;
      case "CSAT":
        return Star;
      case "ALERTA":
        return Bell;
      case "TAREFA":
        return ClipboardList;
      case "LOGIN":
        return LogIn;
      case "ATUALIZACAO_CONTA":
        return TrendingUp;
      case "MOVIMENTO_ENTRADA":
        return ArrowDownCircle;
      case "MOVIMENTO_SAIDA":
        return ArrowUpCircle;
      case "TRANSFERENCIA":
        return ArrowLeftRight;
      default:
        return Zap;
    }
  };

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

  const typeLabel: Record<TimelineEventoTipo, string> = {
    EMISSAO: "Emissão",
    NPS: "NPS",
    CSAT: "CSAT",
    ALERTA: "Alerta",
    TAREFA: "Tarefa",
    LOGIN: "Login",
    ATUALIZACAO_CONTA: "Atualização conta",
    MOVIMENTO_ENTRADA: "Entrada",
    MOVIMENTO_SAIDA: "Saída",
    TRANSFERENCIA: "Transferência",
  };

  const hasAnyFilter = tipoEvento !== "all" || gestorId !== "all" || !!startDate || !!endDate;

  return (
    <Card className="mt-2 rounded-xl border-border/80 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
      <CardHeader className="pb-2 pt-4">
        <p className="text-sm font-semibold text-foreground">Timeline</p>
        <p className="text-xs text-muted-foreground">Histórico completo de eventos do cliente (mais recente primeiro).</p>
      </CardHeader>

      <CardContent className="space-y-4 pb-4 pt-0">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Tipo</p>
            <Select value={tipoEvento} onValueChange={(v) => setTipoEvento(v as typeof tipoEvento)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(
                  [
                    "EMISSAO",
                    "MOVIMENTO_ENTRADA",
                    "TRANSFERENCIA",
                    "NPS",
                    "CSAT",
                    "ALERTA",
                    "TAREFA",
                    "LOGIN",
                    "ATUALIZACAO_CONTA",
                  ] as TimelineEventoTipo[]
                ).map((t) => (
                  <SelectItem key={t} value={t}>
                    {typeLabel[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Gestor</p>
            <Select value={gestorId} onValueChange={(v) => setGestorId(v as typeof gestorId)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os gestores</SelectItem>
                {gestores.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {gestoresLoading && <p className="text-[10px] text-muted-foreground">Carregando…</p>}
          </div>
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
                setGestorId("all");
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
            {events.map((ev) => {
              const Icon = iconFor(ev.tipo_evento);
              const meta = (ev.metadata ?? {}) as Record<string, unknown>;
              /** Linha de detalhe do extrato (milhas ±, programa, rota) por tipo. */
              let metaLine: ReactNode = null;
              if (ev.tipo_evento === "MOVIMENTO_ENTRADA") {
                const milhas = Number(meta.milhas);
                const programa = meta.programa ? String(meta.programa) : null;
                if (milhas > 0) {
                  metaLine = (
                    <p className="mt-1 text-[11px]">
                      <span className="font-semibold text-green-600">
                        +{milhas.toLocaleString("pt-BR")} milhas
                      </span>
                      {programa && <span className="text-muted-foreground"> · {programa}</span>}
                    </p>
                  );
                }
              } else if (ev.tipo_evento === "TRANSFERENCIA") {
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
              } else if (ev.tipo_evento === "EMISSAO") {
                const milhasUtilizadas = Number(meta.milhas_utilizadas);
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
                  key={ev.id}
                  className={cn(
                    "rounded-xl border border-border/70 bg-background/50 px-3 py-2.5",
                    ev.tipo_evento === "ALERTA" && "border-amber-400/40",
                    ev.tipo_evento === "TAREFA" && "border-blue-400/30",
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
                      <p className="text-[10px] font-medium text-muted-foreground">{typeLabel[ev.tipo_evento]}</p>
                      <p className="text-[10px] text-muted-foreground">{formatDt(ev.data_evento)}</p>
                    </div>
                  </div>
                  {ev.gestorNome && (
                    <p className="mt-1 text-[10px] text-muted-foreground">Gestor: {ev.gestorNome}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
