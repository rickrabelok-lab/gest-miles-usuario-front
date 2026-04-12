import { supabase } from "@/lib/supabase";

export type OperacionalPayload = {
  tipoAcao: string;
  entidadeAfetada: string;
  entidadeId?: string;
  details?: Record<string, unknown>;
};

export type AuditoriaPayload = {
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

  const { error: legacyErr } = await supabase.from("logs_acoes").insert({
    user_id: user.id,
    tipo_acao: tipoAcao,
    entidade_afetada: entidadeAfetada,
    entidade_id: entidadeId ?? null,
    details: details ?? {},
  });
  if (legacyErr && import.meta.env.DEV) {
    console.warn("[audit] logs_acoes:", legacyErr.message);
  }
};

/** Eventos de maior impacto — apenas `audit_logs` via RPC. */
export const logAuditoria = async ({
  tipoAcao,
  entidadeAfetada,
  entidadeId,
  details,
}: AuditoriaPayload) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const depois: Record<string, unknown> = {
    ...(details ?? {}),
    ...(entidadeId ? { entidade_id: entidadeId } : {}),
  };

  const { error: auditErr } = await supabase.rpc("audit_log_write", {
    p_user_id: user.id,
    p_acao: tipoAcao,
    p_tabela: entidadeAfetada,
    p_antes: null,
    p_depois: depois,
  });
  if (auditErr && import.meta.env.DEV) {
    console.warn("[audit] audit_log_write:", auditErr.message);
  }
};
