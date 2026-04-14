import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

export type AlertaSistemaTipo =
  | "NPS_LOW"
  | "NPS_BAIXO_SEM_FOLLOWUP"
  | "CSAT_LOW"
  | "CSAT_NEGATIVO_RECENTE"
  | "CSAT_DROP"
  | "GESTOR_SCORE_DROP"
  | "CLIENT_INACTIVITY"
  | "SEM_INTERACAO_30D"
  | "SEM_INTERACAO_60D"
  | "MILHAS_VENCENDO_7D"
  | "MILHAS_VENCENDO_30D"
  | "CARTEIRA_SEM_MOVIMENTACAO"
  | "SEM_COMPRA_6MESES"
  | "DEMANDA_ATRASADA"
  | "SALDO_ZERADO_VENCIMENTO"
  | "DETRATOR_SEM_PLANO"
  | "CHURN_RISK_ALTO"
  | "VIP_ABANDONO"
  | "MILES_EXPIRING"
  | "MILES_CONCENTRATION"
  | "COTACAO_SEM_RESPOSTA"
  | "COTACAO_SEM_RESPONSAVEL"
  | "VENDA_SEM_POS_VENDA"
  | "CHECKIN_SEM_CONFIRMACAO"
  | "VIAGEM_SEM_DOCUMENTACAO"
  | "DESPESA_ATRASADA"
  | "COMISSAO_PENDENTE"
  | "RECEITA_NAO_REGISTRADA"
  | "SEM_PRIMEIRO_CONTATO"
  | "MULTIPLAS_RECLAMACOES";

export type AlertaSistemaNivel = "baixo" | "medio" | "alto" | "critico";

export type AlertaSistemaRow = {
  id: string;
  /** Valores alinhados ao SQL; tipagem ampla para novos tipos no motor sem quebrar o build. */
  tipo_alerta: AlertaSistemaTipo | string;
  cliente_id: string | null;
  gestor_id: string | null;
  equipe_id: string | null;
  nivel: AlertaSistemaNivel;
  mensagem: string;
  status: "ativo" | "resolvido";
  data_criacao: string;
  data_resolucao: string | null;
  dedup_key: string;
};

export type AlertaSistemaEnriched = AlertaSistemaRow & {
  clienteNome: string;
  gestorNome: string;
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

export const NIVEL_SORT: Record<AlertaSistemaNivel, number> = {
  critico: 0,
  alto: 1,
  medio: 2,
  baixo: 3,
};

export const TIPO_ALERTA_LABEL: Record<AlertaSistemaTipo, string> = {
  NPS_LOW: "NPS baixo",
  NPS_BAIXO_SEM_FOLLOWUP: "NPS baixo sem follow-up",
  CSAT_LOW: "CSAT baixo",
  CSAT_NEGATIVO_RECENTE: "CSAT negativo recente",
  CSAT_DROP: "Queda CSAT",
  GESTOR_SCORE_DROP: "Queda score gestor",
  CLIENT_INACTIVITY: "Inatividade",
  SEM_INTERACAO_30D: "Sem interação (30 dias)",
  SEM_INTERACAO_60D: "Sem interação (60 dias)",
  MILHAS_VENCENDO_7D: "Milhas a vencer (7 dias)",
  MILHAS_VENCENDO_30D: "Milhas a vencer (30 dias)",
  CARTEIRA_SEM_MOVIMENTACAO: "Carteira sem movimentação",
  SEM_COMPRA_6MESES: "Sem compra (6 meses)",
  DEMANDA_ATRASADA: "Demanda atrasada",
  SALDO_ZERADO_VENCIMENTO: "Saldo zerado no vencimento",
  DETRATOR_SEM_PLANO: "Detrator sem plano",
  CHURN_RISK_ALTO: "Risco de churn alto",
  VIP_ABANDONO: "VIP em abandono",
  MILES_EXPIRING: "Milhas a vencer",
  MILES_CONCENTRATION: "Concentração de milhas",
  COTACAO_SEM_RESPOSTA: "Cotação sem resposta",
  COTACAO_SEM_RESPONSAVEL: "Cotação sem responsável",
  VENDA_SEM_POS_VENDA: "Venda sem pós-venda",
  CHECKIN_SEM_CONFIRMACAO: "Check-in sem confirmação",
  VIAGEM_SEM_DOCUMENTACAO: "Viagem sem documentação",
  DESPESA_ATRASADA: "Despesa atrasada",
  COMISSAO_PENDENTE: "Comissão pendente",
  RECEITA_NAO_REGISTRADA: "Receita não registada",
  SEM_PRIMEIRO_CONTATO: "Sem primeiro contacto",
  MULTIPLAS_RECLAMACOES: "Múltiplas reclamações",
};

/** Ordem do filtro “Tipo” na UI de alertas (subset legível; inclui todos os tipos conhecidos). */
export const ALERTA_SISTEMA_TIPOS_FILTRO: AlertaSistemaTipo[] = [
  "NPS_LOW",
  "NPS_BAIXO_SEM_FOLLOWUP",
  "CSAT_LOW",
  "CSAT_NEGATIVO_RECENTE",
  "CSAT_DROP",
  "GESTOR_SCORE_DROP",
  "CLIENT_INACTIVITY",
  "SEM_INTERACAO_30D",
  "SEM_INTERACAO_60D",
  "MILHAS_VENCENDO_7D",
  "MILHAS_VENCENDO_30D",
  "CARTEIRA_SEM_MOVIMENTACAO",
  "SEM_COMPRA_6MESES",
  "DEMANDA_ATRASADA",
  "SALDO_ZERADO_VENCIMENTO",
  "DETRATOR_SEM_PLANO",
  "CHURN_RISK_ALTO",
  "VIP_ABANDONO",
  "MILES_EXPIRING",
  "MILES_CONCENTRATION",
  "COTACAO_SEM_RESPOSTA",
  "COTACAO_SEM_RESPONSAVEL",
  "VENDA_SEM_POS_VENDA",
  "CHECKIN_SEM_CONFIRMACAO",
  "VIAGEM_SEM_DOCUMENTACAO",
  "DESPESA_ATRASADA",
  "COMISSAO_PENDENTE",
  "RECEITA_NAO_REGISTRADA",
  "SEM_PRIMEIRO_CONTATO",
  "MULTIPLAS_RECLAMACOES",
];

export function tipoAlertaLabel(tipo: string): string {
  return TIPO_ALERTA_LABEL[tipo as AlertaSistemaTipo] ?? tipo;
}

export function useAlertasSistemaAtivos(enabled: boolean) {
  return useQuery({
    queryKey: ["alertas_sistema", "ativos"],
    enabled,
    queryFn: async (): Promise<AlertaSistemaEnriched[]> => {
      const { data: rows, error } = await supabase
        .from("alertas_sistema")
        .select(
          "id, tipo_alerta, cliente_id, gestor_id, equipe_id, nivel, mensagem, status, data_criacao, data_resolucao, dedup_key",
        )
        .eq("status", "ativo")
        .order("data_criacao", { ascending: false });

      if (error) throw toQueryError(error, "Não foi possível carregar alertas.");

      const list = (rows ?? []) as AlertaSistemaRow[];
      const ids = [...new Set(list.flatMap((r) => [r.cliente_id, r.gestor_id].filter(Boolean) as string[]))];
      if (ids.length === 0) return [];

      const { data: perfis, error: pErr } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", ids);
      if (pErr) throw toQueryError(pErr, "Não foi possível carregar nomes.");

      const nomeById: Record<string, string> = {};
      (perfis ?? []).forEach((row: { usuario_id: string; nome_completo: string | null }) => {
        nomeById[row.usuario_id] = (row.nome_completo ?? "").trim() || "—";
      });

      const enriched: AlertaSistemaEnriched[] = list.map((r) => ({
        ...r,
        clienteNome: r.cliente_id ? (nomeById[r.cliente_id] ?? "—") : "—",
        gestorNome: r.gestor_id ? (nomeById[r.gestor_id] ?? "—") : "—",
      }));

      enriched.sort((a, b) => {
        const dn = NIVEL_SORT[a.nivel] - NIVEL_SORT[b.nivel];
        if (dn !== 0) return dn;
        return new Date(b.data_criacao).getTime() - new Date(a.data_criacao).getTime();
      });

      return enriched;
    },
  });
}

export function useAlertasSistemaSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("alertas_sistema_sync");
      if (error) throw toQueryError(error, "Falha ao sincronizar alertas.");
      const n = typeof data === "number" ? data : Number(data);
      return Number.isNaN(n) ? 0 : n;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["alertas_sistema"] });
    },
  });
}

export function useAlertaResolver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("alertas_sistema")
        .update({
          status: "resolvido",
          data_resolucao: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "ativo");
      if (error) throw toQueryError(error, "Não foi possível resolver o alerta.");
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["alertas_sistema"] });
    },
  });
}
