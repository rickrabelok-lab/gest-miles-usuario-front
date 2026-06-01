import { describe, expect, it, vi, afterEach } from "vitest";
import { getActiveBonusOffers } from "./service";
import type { LoyaltyProgram } from "./types";

const mocks = vi.hoisted(() => ({
  fetchBonusOffers: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  hasApiUrl: () => true,
}));

vi.mock("@/services/bonusOffersService", () => ({
  fetchBonusOffers: mocks.fetchBonusOffers,
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: false,
  supabase: {},
}));

describe("getActiveBonusOffers timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("aborta e rejeita uma chamada pendurada sem retornar lista vazia silenciosa", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    mocks.fetchBonusOffers.mockImplementation((_program: LoyaltyProgram, options: RequestInit) => {
      requestSignal = options.signal;
      return new Promise(() => {});
    });

    const result = getActiveBonusOffers("Smiles");
    const rejection = expect(result).rejects.toThrow("bonus_offers_timeout");

    await vi.advanceTimersByTimeAsync(7999);
    expect(requestSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    await rejection;
    expect(requestSignal?.aborted).toBe(true);
  });
});
