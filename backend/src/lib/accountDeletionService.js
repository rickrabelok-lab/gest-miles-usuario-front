// Lógica pura da exclusão de conta (sem I/O) — testável com node:test.
export const GRACE_DAYS = 7;

/** Conta elegível pra self-delete: só cadastro próprio ('cliente'). */
export function isDeletionEligibleRole(role) {
  return role === "cliente";
}

/** Data agendada (ISO) a partir de um epoch ms + carência em dias. */
export function computeScheduledFor(nowMs, graceDays = GRACE_DAYS) {
  return new Date(nowMs + graceDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Decide a ação dado o estado atual:
 * - já 'pendente' → 'return-existing' (idempotente: não reagenda, não re-emaila)
 * - inexistente/'cancelada'/'concluida' → 'create'
 */
export function decideRequestAction(existing) {
  if (existing && existing.status === "pendente") return "return-existing";
  return "create";
}

/** Linha a gravar (upsert por usuario_id). */
export function buildDeletionRequestRow({ userId, email, nowMs, graceDays = GRACE_DAYS }) {
  return {
    usuario_id: userId,
    email: email ?? null,
    status: "pendente",
    solicitado_em: new Date(nowMs).toISOString(),
    agendado_para: computeScheduledFor(nowMs, graceDays),
    cancelado_em: null,
    processado_em: null,
  };
}
