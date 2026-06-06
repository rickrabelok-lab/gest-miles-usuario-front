import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCheckoutLineItems, decideQuantitySync } from "./equipeBillingService.js";

const plan = { stripe_base_price_id: "price_base", stripe_per_client_price_id: "price_pc" };

test("buildCheckoutLineItems: base + per-client quando qty>0", () => {
  assert.deepEqual(buildCheckoutLineItems(plan, 5), [
    { price: "price_base", quantity: 1 },
    { price: "price_pc", quantity: 5 },
  ]);
});
test("buildCheckoutLineItems: só base quando qty=0", () => {
  assert.deepEqual(buildCheckoutLineItems(plan, 0), [{ price: "price_base", quantity: 1 }]);
});
test("buildCheckoutLineItems: rejeita plano sem price ids", () => {
  assert.throws(() => buildCheckoutLineItems({}, 1));
});
test("decideQuantitySync: activate novo no ciclo cobra proração", () => {
  assert.deepEqual(decideQuantitySync({ action: "activate", alreadyInCycle: false, currentQuantity: 3 }),
    { quantity: 4, prorationBehavior: "create_prorations" });
});
test("decideQuantitySync: activate já-no-ciclo não recobra", () => {
  assert.deepEqual(decideQuantitySync({ action: "activate", alreadyInCycle: true, currentQuantity: 3 }),
    { quantity: 3, prorationBehavior: "none" });
});
test("decideQuantitySync: deactivate não credita o ciclo", () => {
  assert.deepEqual(decideQuantitySync({ action: "deactivate", alreadyInCycle: true, currentQuantity: 3 }),
    { quantity: 3, prorationBehavior: "none" });
});
