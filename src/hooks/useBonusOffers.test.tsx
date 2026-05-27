import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBonusOffers } from "./useBonusOffers";
import type { BonusOffer } from "@/lib/bonus-offers/types";

const mocks = vi.hoisted(() => ({
  getActiveBonusOffers: vi.fn(),
}));

vi.mock("@/lib/bonus-offers/service", () => ({
  getActiveBonusOffers: mocks.getActiveBonusOffers,
}));

const offer: BonusOffer = {
  id: "offer-1",
  program: "smiles",
  store: "Loja teste",
  multiplier: 4,
  validUntil: "2099-12-31",
  conditions: "Teste local",
  offerUrl: "https://example.com",
};

describe("useBonusOffers", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("sai de loading para erro amigavel quando o carregamento falha", async () => {
    mocks.getActiveBonusOffers.mockRejectedValueOnce(new Error("bonus_offers_timeout"));

    const { result } = renderHook(() => useBonusOffers("smiles"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe("Não foi possível carregar as ofertas no momento.");
      expect(result.current.offers).toEqual([]);
    });
  });

  it("retry dispara uma nova tentativa e atualiza ofertas quando a segunda chamada passa", async () => {
    mocks.getActiveBonusOffers
      .mockRejectedValueOnce(new Error("bonus_offers_timeout"))
      .mockResolvedValueOnce([offer]);

    const { result } = renderHook(() => useBonusOffers("smiles"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBe("Não foi possível carregar as ofertas no momento.");
    });

    act(() => {
      result.current.retry();
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.offers).toEqual([offer]);
      expect(mocks.getActiveBonusOffers).toHaveBeenCalledTimes(2);
    });
  });

  it("aborta na desmontagem sem update tardio", async () => {
    const setStateError = vi.spyOn(console, "error").mockImplementation(() => {});
    let requestSignal: AbortSignal | undefined;
    let resolveRequest: (offers: BonusOffer[]) => void = () => {};
    mocks.getActiveBonusOffers.mockImplementation((_program, options) => {
      requestSignal = options.signal;
      return new Promise<BonusOffer[]>((resolve) => {
        resolveRequest = resolve;
      });
    });

    const { unmount } = renderHook(() => useBonusOffers("smiles"));

    await waitFor(() => {
      expect(requestSignal).toBeDefined();
    });

    unmount();
    expect(requestSignal?.aborted).toBe(true);

    await act(async () => {
      resolveRequest([offer]);
      await Promise.resolve();
    });

    expect(setStateError).not.toHaveBeenCalled();
    setStateError.mockRestore();
  });
});
