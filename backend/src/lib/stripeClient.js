import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

export function getStripe() {
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY não configurada.");
  }
  return new Stripe(key);
}
