import { useEffect, useMemo, useState } from "react";
import { getBestPriceByDestinationForAllModes } from "@/lib/pricing";
import type { BestPriceByDestination } from "@/lib/pricing";

type UseDestinationBestPricesParams = {
  destinations: string[];
  origins: string[];
};

type BestPricesByDestination = Record<
  string,
  {
    miles: BestPriceByDestination | null;
    money: BestPriceByDestination | null;
  }
>;

const DESTINATION_BEST_PRICES_STALE_MS = 15 * 60 * 1000;

const bestPricesCache = new Map<
  string,
  {
    pricesByDestination: BestPricesByDestination;
    expiresAt: number;
  }
>();

export const useDestinationBestPrices = ({
  destinations,
  origins,
}: UseDestinationBestPricesParams) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [pricesByDestination, setPricesByDestination] = useState<BestPricesByDestination>(
    {},
  );

  const destinationKey = useMemo(
    () =>
      [...new Set(destinations.map((item) => item.trim().toUpperCase()).filter(Boolean))].join(
        "|",
      ),
    [destinations],
  );
  const originKey = useMemo(
    () => [...new Set(origins.map((item) => item.trim().toUpperCase()).filter(Boolean))].join("|"),
    [origins],
  );

  const normalizedDestinations = useMemo(
    () => (destinationKey ? destinationKey.split("|") : []),
    [destinationKey],
  );
  const normalizedOrigins = useMemo(
    () => (originKey ? originKey.split("|") : []),
    [originKey],
  );
  const cacheKey = `${destinationKey}::${originKey}`;

  useEffect(() => {
    if (normalizedDestinations.length === 0 || normalizedOrigins.length === 0) {
      setLoading(false);
      setError(null);
      setPricesByDestination({});
      return;
    }

    const cached = bestPricesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setPricesByDestination(cached.pricesByDestination);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const result = await getBestPriceByDestinationForAllModes(
          normalizedDestinations,
          normalizedOrigins,
        );
        if (cancelled) return;

        const next: BestPricesByDestination = {};
        normalizedDestinations.forEach((destination) => {
          next[destination] = { miles: null, money: null };
        });

        result.miles.forEach((item) => {
          if (!next[item.destination]) next[item.destination] = { miles: null, money: null };
          next[item.destination].miles = item;
        });

        result.money.forEach((item) => {
          if (!next[item.destination]) next[item.destination] = { miles: null, money: null };
          next[item.destination].money = item;
        });

        bestPricesCache.set(cacheKey, {
          pricesByDestination: next,
          expiresAt: Date.now() + DESTINATION_BEST_PRICES_STALE_MS,
        });
        setPricesByDestination(next);
      } catch (loadError) {
        if (!cancelled) {
          setPricesByDestination({});
          setError(
            loadError instanceof Error && loadError.message.trim()
              ? loadError.message
              : "Não foi possível carregar os preços dos destinos.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, normalizedDestinations, normalizedOrigins, retryToken]);

  return {
    error,
    loading,
    pricesByDestination,
    retry: () => setRetryToken((value) => value + 1),
  };
};
