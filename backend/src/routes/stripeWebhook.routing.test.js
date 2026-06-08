import { test } from "node:test";
import assert from "node:assert/strict";
import { isB2BSubscription } from "../lib/billingHelpers.js";

// Gating puro B2B vs B2C — testa a decisão de roteamento sem tocar DB/Stripe.

test("isB2BSubscription: rota B2B quando metadata.equipe_id presente", () => {
  assert.equal(isB2BSubscription({ metadata: { equipe_id: "equipe-uuid-1" } }), true);
});

test("isB2BSubscription: rota B2C quando metadata.equipe_id ausente", () => {
  assert.equal(isB2BSubscription({ metadata: {} }), false);
  assert.equal(isB2BSubscription({ metadata: { usuario_id: "user-1" } }), false);
});

test("isB2BSubscription: rota B2C quando subscription nula ou sem metadata", () => {
  assert.equal(isB2BSubscription(null), false);
  assert.equal(isB2BSubscription(undefined), false);
  assert.equal(isB2BSubscription({}), false);
});
