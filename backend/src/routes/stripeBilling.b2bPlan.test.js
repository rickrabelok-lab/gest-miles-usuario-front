import { describe, it, expect, vi } from "vitest";

// Stub módulos com efeitos colaterais de module-level (env vars obrigatórias)
vi.mock("../lib/supabase.js", () => ({
  createSupabaseWithAuth: vi.fn(),
}));
vi.mock("../lib/supabaseService.js", () => ({
  assertSupabaseService: vi.fn(),
}));
vi.mock("../lib/stripeClient.js", () => ({
  getStripe: vi.fn(),
}));
vi.mock("../middleware/auth.js", () => ({
  requireAuth: vi.fn(),
}));
vi.mock("../middleware/requireAdmin.js", () => ({
  requireAdmin: vi.fn(),
}));

import { buildPerClientTieredPriceArgs } from "./stripeBilling.js";

describe("buildPerClientTieredPriceArgs", () => {
  it("monta tiers graduated com up_to e inf no último", () => {
    const args = buildPerClientTieredPriceArgs("prod_1", [
      { upTo: 20, amountCents: 1200 },
      { upTo: 50, amountCents: 900 },
      { upTo: null, amountCents: 700 },
    ]);
    expect(args.billing_scheme).toBe("tiered");
    expect(args.tiers_mode).toBe("graduated");
    expect(args.recurring.interval).toBe("month");
    expect(args.tiers).toEqual([
      { up_to: 20, unit_amount: 1200 },
      { up_to: 50, unit_amount: 900 },
      { up_to: "inf", unit_amount: 700 },
    ]);
  });
  it("rejeita tiers vazio", () => {
    expect(() => buildPerClientTieredPriceArgs("prod_1", [])).toThrow();
  });
});
