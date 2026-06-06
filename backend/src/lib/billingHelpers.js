// Helpers puros de billing — sem imports com efeito colateral, testáveis por qualquer runner.

/** Período do fim do ciclo: novo layout (item-level) ou legado (top-level). */
export function resolvePeriodEnd(sub) {
  const itemEnd = sub?.items?.data?.[0]?.current_period_end;
  const raw = itemEnd ?? sub?.current_period_end ?? null;
  return raw ? new Date(raw * 1000).toISOString() : null;
}

/** Id da subscription a partir de uma invoice: novo layout (parent) ou legado. */
export function resolveSubscriptionIdFromInvoice(invoice) {
  return (
    invoice?.parent?.subscription_details?.subscription ??
    invoice?.subscription ??
    null
  );
}

/** Início do ciclo: novo layout (item-level) ou legado (top-level). ISO string ou null. */
export function resolvePeriodStart(sub) {
  const itemStart = sub?.items?.data?.[0]?.current_period_start;
  const raw = itemStart ?? sub?.current_period_start ?? null;
  return raw ? new Date(raw * 1000).toISOString() : null;
}

/** Retorna true se a subscription é B2B (tem metadata.equipe_id). */
export function isB2BSubscription(sub) {
  return !!sub?.metadata?.equipe_id;
}

/**
 * Monta os args do Stripe Price tiered/graduated por cliente.
 * tiers: [{ upTo: number|null, amountCents: number }] (último upTo=null => "inf").
 */
export function buildPerClientTieredPriceArgs(productId, tiers, currency = "brl") {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error("tiers vazio.");
  }
  return {
    product: productId,
    currency,
    recurring: { interval: "month" },
    billing_scheme: "tiered",
    tiers_mode: "graduated",
    tiers: tiers.map((t) => ({
      up_to: t.upTo == null ? "inf" : t.upTo,
      unit_amount: t.amountCents,
    })),
  };
}
