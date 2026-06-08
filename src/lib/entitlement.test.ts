import { describe, it, expect } from "vitest";
import { isPaid, entitlementOf } from "@/lib/entitlement";

describe("isPaid / entitlement", () => {
  it("pago por plano_ativo", () => {
    expect(isPaid(true, null)).toBe(true);
    expect(entitlementOf(true, null)).toBe("paid");
  });

  it("pago por assinatura própria (active/trialing)", () => {
    expect(isPaid(false, "active")).toBe(true);
    expect(isPaid(false, "trialing")).toBe(true);
    expect(isPaid(null, "ACTIVE")).toBe(true);
  });

  it("free quando nenhum", () => {
    expect(isPaid(false, null)).toBe(false);
    expect(isPaid(false, "canceled")).toBe(false);
    expect(isPaid(null, "past_due")).toBe(false);
    expect(entitlementOf(false, "")).toBe("free");
  });
});
