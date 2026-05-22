import { useEffect, useMemo, useState } from "react";
import type { SearchMode } from "@/contexts/SearchFlightsContext";
import { monthKey } from "@/lib/price-calendar";
import {
  getPriceCalendarProvider,
  type PriceCalendarResult,
} from "@/lib/price-calendar-provider";

const monthCache = new Map<string, PriceCalendarResult>();

type UsePriceCalendarDataParams = {
  originCode?: string;
  destinationCode?: string;
  mode: SearchMode;
  month: Date;
};

export const usePriceCalendarData = ({
  originCode,
  destinationCode,
  mode,
  month,
}: UsePriceCalendarDataParams) => {
  const [loading, setLoading] = useState(true);
  const [pricesByDay, setPricesByDay] = useState<Map<number, number>>(new Map());
  const [source, setSource] = useState<PriceCalendarResult["source"]>("estimated");
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const key = useMemo(() => {
    if (!originCode || !destinationCode) return null;
    return `${originCode}-${destinationCode}-${mode}-${monthKey(month)}`;
  }, [originCode, destinationCode, mode, month]);

  useEffect(() => {
    if (!key || !originCode || !destinationCode) {
      setLoading(false);
      setPricesByDay(new Map());
      setSource("estimated");
      setError(null);
      return;
    }

    const cached = monthCache.get(key);
    if (cached) {
      setPricesByDay(cached.pricesByDay);
      setSource(cached.source);
      setError(cached.error ?? null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    let cancelled = false;

    const load = async () => {
      try {
        const provider = getPriceCalendarProvider();
        const result = await provider.getMonthPrices({
          originCode,
          destinationCode,
          mode,
          month,
        });
        if (cancelled) return;
        if (result.source !== "estimated" || !result.error) {
          monthCache.set(key, result);
        }
        setPricesByDay(result.pricesByDay);
        setSource(result.source);
        setError(result.error ?? null);
      } catch (err) {
        if (cancelled) return;
        setPricesByDay(new Map());
        setSource("estimated");
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar o calendário de preços.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [key, originCode, destinationCode, mode, month, refreshVersion]);

  return {
    loading,
    pricesByDay,
    source,
    error,
    isEstimated: source === "estimated",
    retry: () => {
      if (key) monthCache.delete(key);
      setRefreshVersion((value) => value + 1);
    },
  };
};
