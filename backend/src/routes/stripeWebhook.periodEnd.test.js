import { describe, it, expect } from "vitest";
import { resolvePeriodEnd, resolveSubscriptionIdFromInvoice } from "./stripeWebhook.js";

describe("resolvePeriodEnd", () => {
  it("usa o layout novo (item-level current_period_end)", () => {
    const sub = { current_period_end: null, items: { data: [{ current_period_end: 1751000000 }] } };
    expect(resolvePeriodEnd(sub)).toBe(new Date(1751000000 * 1000).toISOString());
  });
  it("cai no layout legado (top-level)", () => {
    const sub = { current_period_end: 1751000000, items: { data: [{}] } };
    expect(resolvePeriodEnd(sub)).toBe(new Date(1751000000 * 1000).toISOString());
  });
  it("devolve null quando não há período", () => {
    expect(resolvePeriodEnd({ items: { data: [] } })).toBeNull();
  });
});

describe("resolveSubscriptionIdFromInvoice", () => {
  it("usa parent.subscription_details.subscription (layout novo)", () => {
    const inv = { parent: { subscription_details: { subscription: "sub_new" } } };
    expect(resolveSubscriptionIdFromInvoice(inv)).toBe("sub_new");
  });
  it("cai no invoice.subscription (legado)", () => {
    expect(resolveSubscriptionIdFromInvoice({ subscription: "sub_old" })).toBe("sub_old");
  });
});
