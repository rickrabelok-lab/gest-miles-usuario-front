import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolvePeriodEnd,
  resolveSubscriptionIdFromInvoice,
  buildPerClientTieredPriceArgs,
} from "./billingHelpers.js";

test("resolvePeriodEnd: layout novo (item-level)", () => {
  const sub = { current_period_end: null, items: { data: [{ current_period_end: 1751000000 }] } };
  assert.equal(resolvePeriodEnd(sub), new Date(1751000000 * 1000).toISOString());
});

test("resolvePeriodEnd: layout legado (top-level)", () => {
  const sub = { current_period_end: 1751000000, items: { data: [{}] } };
  assert.equal(resolvePeriodEnd(sub), new Date(1751000000 * 1000).toISOString());
});

test("resolvePeriodEnd: null quando não há período", () => {
  assert.equal(resolvePeriodEnd({ items: { data: [] } }), null);
});

test("resolveSubscriptionIdFromInvoice: parent (layout novo)", () => {
  assert.equal(
    resolveSubscriptionIdFromInvoice({ parent: { subscription_details: { subscription: "sub_new" } } }),
    "sub_new",
  );
});

test("resolveSubscriptionIdFromInvoice: invoice.subscription (legado)", () => {
  assert.equal(resolveSubscriptionIdFromInvoice({ subscription: "sub_old" }), "sub_old");
});

test("buildPerClientTieredPriceArgs: graduated com up_to e inf no último", () => {
  const args = buildPerClientTieredPriceArgs("prod_1", [
    { upTo: 20, amountCents: 1200 },
    { upTo: 50, amountCents: 900 },
    { upTo: null, amountCents: 700 },
  ]);
  assert.equal(args.billing_scheme, "tiered");
  assert.equal(args.tiers_mode, "graduated");
  assert.equal(args.recurring.interval, "month");
  assert.deepEqual(args.tiers, [
    { up_to: 20, unit_amount: 1200 },
    { up_to: 50, unit_amount: 900 },
    { up_to: "inf", unit_amount: 700 },
  ]);
});

test("buildPerClientTieredPriceArgs: rejeita tiers vazio", () => {
  assert.throws(() => buildPerClientTieredPriceArgs("prod_1", []));
});
