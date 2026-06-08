// Helpers puros do billing B2B — sem imports com efeito colateral; testáveis em node:test.

/**
 * line_items do Checkout: Item A (base flat, qty 1) + Item B (por-cliente, qty = ativos).
 * Item B só entra se quantity > 0 (Stripe não aceita item licensed com qty 0 no checkout).
 */
export function buildCheckoutLineItems(plan, perClientQuantity) {
  if (!plan?.stripe_base_price_id || !plan?.stripe_per_client_price_id) {
    throw new Error("Plano sem price ids (base/per-client).");
  }
  const qty = Math.max(0, Math.floor(Number(perClientQuantity) || 0));
  const items = [{ price: plan.stripe_base_price_id, quantity: 1 }];
  if (qty > 0) items.push({ price: plan.stripe_per_client_price_id, quantity: qty });
  return items;
}

/**
 * Decide a quantidade nova do Item B e a proração ao ativar/desativar (política anti-burla).
 * - activate de cliente novo no ciclo  -> qty+1, cobra proração.
 * - activate de cliente já contado     -> sem mudança, sem cobrança.
 * - deactivate                         -> sem mudança no ciclo corrente (não credita).
 */
export function decideQuantitySync({ action, alreadyInCycle, currentQuantity }) {
  const q = Math.max(0, Math.floor(Number(currentQuantity) || 0));
  if (action === "activate") {
    return alreadyInCycle
      ? { quantity: q, prorationBehavior: "none" }
      : { quantity: q + 1, prorationBehavior: "create_prorations" };
  }
  if (action === "deactivate") {
    return { quantity: q, prorationBehavior: "none" };
  }
  throw new Error("ação inválida");
}
