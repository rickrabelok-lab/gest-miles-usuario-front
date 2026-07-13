export type Entitlement = "paid" | "free";

/** Graça pós-expiração: absorve um RENEWAL atrasado sem derrubar quem pagou. */
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Pago = plano ativo (agência ativou) OU assinatura própria ativa (B2C direto). Senão free.
 *
 * `subscriptionPeriodEnd` é uma rede de segurança contra webhook perdido: se um
 * EXPIRATION do RevenueCat nunca chegar, o `status` fica "active" pra sempre.
 * Então também exigimos que o período vigente não tenha passado (com 3 dias de
 * graça pra não derrubar quem pagou caso um RENEWAL atrase). Nulo/ inválido =
 * legado/B2B sem gate (retrocompatível: callers antigos não mudam de resultado).
 */
export function isPaid(
  planoAtivo: boolean | null | undefined,
  subscriptionStatus: string | null | undefined,
  subscriptionPeriodEnd?: string | null,
  now: number = Date.now(),
): boolean {
  if (planoAtivo === true) return true;
  const s = String(subscriptionStatus ?? "").toLowerCase();
  if (s !== "active" && s !== "trialing") return false;
  if (subscriptionPeriodEnd == null) return true;
  const endMs = Date.parse(subscriptionPeriodEnd);
  if (!Number.isFinite(endMs)) return true;
  return endMs + GRACE_MS >= now;
}

export function entitlementOf(
  planoAtivo: boolean | null | undefined,
  subscriptionStatus: string | null | undefined,
  subscriptionPeriodEnd?: string | null,
  now: number = Date.now(),
): Entitlement {
  return isPaid(planoAtivo, subscriptionStatus, subscriptionPeriodEnd, now) ? "paid" : "free";
}
