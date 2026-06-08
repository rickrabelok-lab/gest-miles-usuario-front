export type Entitlement = "paid" | "free";

/** Pago = plano ativo (agência ativou) OU assinatura própria ativa (B2C direto). Senão free. */
export function isPaid(
  planoAtivo: boolean | null | undefined,
  subscriptionStatus: string | null | undefined,
): boolean {
  if (planoAtivo === true) return true;
  const s = String(subscriptionStatus ?? "").toLowerCase();
  return s === "active" || s === "trialing";
}

export function entitlementOf(
  planoAtivo: boolean | null | undefined,
  subscriptionStatus: string | null | undefined,
): Entitlement {
  return isPaid(planoAtivo, subscriptionStatus) ? "paid" : "free";
}
