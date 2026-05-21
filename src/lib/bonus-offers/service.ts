import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { hasApiUrl } from "@/services/api";
import { fetchBonusOffers } from "@/services/bonusOffersService";
import type { BonusOffer, LoyaltyProgram } from "@/lib/bonus-offers/types";

const BONUS_OFFERS_TIMEOUT_MS = 8000;

async function withBonusOffersTimeout<T>(
  promise: PromiseLike<T>,
  onTimeout: () => void,
): Promise<T | null> {
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      onTimeout();
      resolve(null);
    }, BONUS_OFFERS_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([promise, timeout]);
    return timedOut ? null : result;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function mapBonusRow(row: Record<string, unknown>): BonusOffer {
  const vu = row.valid_until;
  const validUntil =
    typeof vu === "string"
      ? vu.slice(0, 10)
      : vu && typeof vu === "object" && "toISOString" in vu && typeof (vu as Date).toISOString === "function"
        ? (vu as Date).toISOString().slice(0, 10)
        : "";

  return {
    id: String(row.id),
    program: row.program as BonusOffer["program"],
    store: String(row.store),
    multiplier: Number(row.multiplier),
    validUntil,
    conditions: String(row.conditions ?? ""),
    offerUrl: String(row.offer_url ?? ""),
  };
}

export const getActiveBonusOffers = async (
  program?: LoyaltyProgram,
): Promise<BonusOffer[]> => {
  if (hasApiUrl()) {
    const controller = new AbortController();
    const raw = await withBonusOffersTimeout(
      fetchBonusOffers(program, { signal: controller.signal }),
      () => controller.abort(),
    );
    return Array.isArray(raw) ? (raw as BonusOffer[]) : [];
  }

  if (isSupabaseConfigured) {
    const controller = new AbortController();
    let q = supabase.from("bonus_offers").select("*").eq("active", true);
    if (program) {
      q = q.eq("program", program);
    }
    const result = await withBonusOffersTimeout(
      q.order("program", { ascending: true }).abortSignal(controller.signal),
      () => controller.abort(),
    );
    const { data, error } = result ?? {};
    if (error) return [];
    return (data ?? []).map((row) => mapBonusRow(row as Record<string, unknown>));
  }

  return [];
};
