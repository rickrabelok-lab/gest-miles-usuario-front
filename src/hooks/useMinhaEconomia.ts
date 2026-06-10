// Hook read-only do Minha Economia: o cliente busca o PRÓPRIO relatório.
// O guard real é server-side (auth.uid() = p_cliente_id na RPC).
import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseRelatorioEconomia, type RelatorioEconomia } from "@/lib/relatorio-economia";

const ERR_LOAD = "Não foi possível carregar sua economia agora. Tente novamente em instantes.";

export function useMinhaEconomia() {
  const [data, setData] = useState<RelatorioEconomia | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRelatorio = useCallback(
    async (clienteId: string, inicio: string | null = null, fim: string | null = null) => {
      setLoading(true);
      setError(null);
      const { data: raw, error: rpcError } = await supabase.rpc("get_relatorio_economia", {
        p_cliente_id: clienteId,
        p_inicio: inicio,
        p_fim: fim,
      });
      if (rpcError) {
        if (import.meta.env.DEV) console.warn("[MinhaEconomia] fetch:", rpcError);
        setError(ERR_LOAD);
        setLoading(false);
        return;
      }
      setData(parseRelatorioEconomia(raw));
      setLoading(false);
    },
    [],
  );

  return { data, loading, error, fetchRelatorio };
}
