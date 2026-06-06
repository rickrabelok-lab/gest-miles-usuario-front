import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

// Versão de API fixada (= a que o SDK instalado já usa). Determinismo + anti-drift.
const STRIPE_API_VERSION = "2025-02-24.acacia";

export function getStripe() {
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY não configurada.");
  }
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}
