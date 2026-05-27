import { useCallback, useEffect, useState } from "react";
import { getActiveBonusOffers } from "@/lib/bonus-offers/service";
import type { BonusOffer, LoyaltyProgram } from "@/lib/bonus-offers/types";

const BONUS_OFFERS_ERROR_MESSAGE = "Não foi possível carregar as ofertas no momento.";

export const useBonusOffers = (program?: LoyaltyProgram) => {
  const [offers, setOffers] = useState<BonusOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOffers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const result = await getActiveBonusOffers(program, { signal });
      if (signal?.aborted) return;
      setOffers(result);
    } catch {
      if (signal?.aborted) return;
      setError(BONUS_OFFERS_ERROR_MESSAGE);
      setOffers([]);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [program]);

  const retry = useCallback(() => {
    void loadOffers();
  }, [loadOffers]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOffers(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadOffers]);

  return {
    offers,
    loading,
    error,
    retry,
  };
};
