import { apiFetch, hasApiUrl } from "./api";
import type { CalendarPricesParams } from "@/lib/api-contracts";

export type { CalendarPricesParams };

export async function fetchCalendarPrices(
  params: CalendarPricesParams,
): Promise<Record<number, number>> {
  if (!hasApiUrl()) {
    return {};
  }
  const qs = new URLSearchParams({
    origin: params.originCode,
    destination: params.destinationCode,
    mode: params.mode,
    month: params.month,
  });
  return apiFetch(`/api/calendar-prices?${qs}`);
}
