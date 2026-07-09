import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

/**
 * Timeline unificada do cliente (mesma fonte que o manager usa na "Linha do
 * tempo"): RPC get_client_timeline_unificada com lente 'cliente' — demandas
 * criadas/concluídas, movimentos, transferências, emissões e o marco de início
 * da gestão. A lente 'cliente' é imposta também no servidor pra self.
 */

export type UnifiedTimelineEvento = {
  fonte: string;
  tipo: string;
  data: string;
  titulo: string;
  descricao: string;
  metadata: Record<string, unknown>;
};

export type UnifiedTimelineFilters = {
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
};

function toQueryError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return new Error((err as { message: string }).message);
  }
  return new Error(fallback);
}

function parseEventos(raw: unknown): UnifiedTimelineEvento[] {
  const eventos = (raw as { eventos?: unknown } | null)?.eventos;
  if (!Array.isArray(eventos)) return [];
  return eventos
    .filter((ev): ev is Record<string, unknown> => !!ev && typeof ev === "object")
    .map((ev) => ({
      fonte: String(ev.fonte ?? ""),
      tipo: String(ev.tipo ?? ""),
      data: String(ev.data ?? ""),
      titulo: String(ev.titulo ?? ""),
      descricao: String(ev.descricao ?? ""),
      metadata:
        ev.metadata && typeof ev.metadata === "object"
          ? (ev.metadata as Record<string, unknown>)
          : {},
    }));
}

export function useClienteTimelineUnificada(
  clienteId: string | null,
  enabled: boolean,
  filters: UnifiedTimelineFilters,
) {
  const queryKey = useMemo(
    () => [
      "timeline_unificada_cliente",
      clienteId,
      filters.startDate ?? "none",
      filters.endDate ?? "none",
    ],
    [clienteId, filters.endDate, filters.startDate],
  );

  return useQuery({
    queryKey,
    enabled: enabled && !!clienteId,
    queryFn: async (): Promise<UnifiedTimelineEvento[]> => {
      if (!clienteId) return [];

      const { data, error } = await supabase.rpc("get_client_timeline_unificada", {
        p_cliente_id: clienteId,
        p_lente: "cliente",
        p_inicio: filters.startDate,
        p_fim: filters.endDate,
        p_limit: 100,
      });
      if (error) throw toQueryError(error, "Não foi possível carregar a timeline.");

      return parseEventos(data);
    },
  });
}
