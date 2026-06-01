import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { hasApiUrl } from "@/services/api";
import { fetchBonusOffers } from "@/services/bonusOffersService";
import type { BonusOffer, LoyaltyProgram } from "@/lib/bonus-offers/types";

const BONUS_OFFERS_TIMEOUT_MS = 8000;
const BONUS_OFFERS_TIMEOUT_ERROR = "bonus_offers_timeout";

type GetActiveBonusOffersOptions = {
  signal?: AbortSignal;
};

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

function isCurrentBonusOffer(offer: BonusOffer, today = new Date().toISOString().slice(0, 10)) {
  return !offer.validUntil || offer.validUntil >= today;
}

function normalizeApiBonusOffer(raw: unknown): BonusOffer | null {
  if (!raw || typeof raw !== "object") return null;
  const offer = raw as Partial<BonusOffer>;
  if (!offer.id || !offer.program || !offer.store || typeof offer.multiplier !== "number") {
    return null;
  }
  return {
    id: String(offer.id),
    program: offer.program,
    store: String(offer.store),
    multiplier: offer.multiplier,
    validUntil: String(offer.validUntil ?? ""),
    conditions: String(offer.conditions ?? ""),
    offerUrl: String(offer.offerUrl ?? ""),
  };
}

async function withBonusOffersTimeout<T>(
  run: (signal: AbortSignal) => PromiseLike<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let rejectExternalAbort: ((reason: DOMException) => void) | undefined;
  const externalAbortPromise = new Promise<never>((_, reject) => {
    rejectExternalAbort = reject;
  });
  const abortFromExternalSignal = () => {
    controller.abort();
    rejectExternalAbort?.(new DOMException("Aborted", "AbortError"));
  };

  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(BONUS_OFFERS_TIMEOUT_ERROR));
    }, BONUS_OFFERS_TIMEOUT_MS);
  });

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  }

  try {
    return await Promise.race([
      Promise.resolve(run(controller.signal)),
      timeoutPromise,
      externalAbortPromise,
    ]);
  } finally {
    clearTimeout(timeoutId!);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

export const getActiveBonusOffers = async (
  program?: LoyaltyProgram,
  options: GetActiveBonusOffersOptions = {},
): Promise<BonusOffer[]> => {
  if (hasApiUrl()) {
    const raw = await withBonusOffersTimeout(
      (signal) => fetchBonusOffers(program, { signal }),
      options.signal,
    );
    if (!Array.isArray(raw)) {
      throw new Error("Resposta inválida ao carregar ofertas de bônus.");
    }
    return raw.map(normalizeApiBonusOffer).filter((offer): offer is BonusOffer => !!offer && isCurrentBonusOffer(offer));
  }

  if (isSupabaseConfigured) {
    let q = supabase.from("bonus_offers").select("*").eq("active", true);
    if (program) {
      q = q.eq("program", program);
    }
    const result = await withBonusOffersTimeout(
      (signal) => q.order("program", { ascending: true }).abortSignal(signal),
      options.signal,
    );
    const { data, error } = result;
    if (error) throw error;
    return (data ?? [])
      .map((row) => mapBonusRow(row as Record<string, unknown>))
      .filter((offer) => isCurrentBonusOffer(offer));
  }

  return [];
};
