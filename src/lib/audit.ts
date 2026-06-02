import { supabase } from "@/lib/supabase";

export type OperacionalPayload = {
  tipoAcao: string;
  entidadeAfetada: string;
  entidadeId?: string;
  details?: Record<string, unknown>;
};

/** Ações correntes na UI — apenas `logs_acoes`. */
export const logOperacional = async ({
  tipoAcao,
  entidadeAfetada,
  entidadeId,
  details,
}: OperacionalPayload) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error: legacyErr } = await supabase.rpc("operational_log_write", {
    p_tipo_acao: tipoAcao,
    p_entidade_afetada: entidadeAfetada,
    p_entidade_id: entidadeId ?? null,
    p_details: details ?? {},
  });
  if (legacyErr && import.meta.env.DEV) {
    console.warn("[audit] logs_acoes:", legacyErr.message);
  }
};
