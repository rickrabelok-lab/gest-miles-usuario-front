import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

export interface BrandingConfigData {
  destinationImages: Record<string, string>;
  airlineLogos: Record<string, string>;
  /** URLs públicas (ex.: Storage `branding-assets`) — ver chaves em `gestMilesBranding.ts`. */
  brandAssets: Record<string, string>;
  programCardLogos: Record<string, string>;
}

const EMPTY_DATA: BrandingConfigData = {
  destinationImages: {},
  airlineLogos: {},
  brandAssets: {},
  programCardLogos: {},
};
let brandingConfigCache: BrandingConfigData | null = null;
let brandingConfigInFlight: Promise<BrandingConfigData> | null = null;

function normalizeStringMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = k.trim();
    const value = typeof v === "string" ? v.trim() : "";
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

async function fetchBrandingConfig(force = false): Promise<BrandingConfigData> {
  if (!force && brandingConfigCache) return brandingConfigCache;
  if (!force && brandingConfigInFlight) return brandingConfigInFlight;

  brandingConfigInFlight = (async () => {
    try {
      let row: Record<string, unknown> | null = null;
      const withPc = await supabase
        .from("pesquisa_passagens_config")
        .select("destination_images, airline_logos, brand_assets, program_card_logos")
        .eq("id", 1)
        .maybeSingle();
      if (withPc.error) {
        const msg = withPc.error.message ?? "";
        const noCol =
          /program_card_logos|column|schema cache|does not exist/i.test(msg) || msg.includes("42703");
        if (noCol) {
          const fallback = await supabase
            .from("pesquisa_passagens_config")
            .select("destination_images, airline_logos, brand_assets")
            .eq("id", 1)
            .maybeSingle();
          if (fallback.error) throw fallback.error;
          row = (fallback.data as Record<string, unknown> | null) ?? null;
        } else {
          throw withPc.error;
        }
      } else {
        row = (withPc.data as Record<string, unknown> | null) ?? null;
      }

      const data = {
        destinationImages: normalizeStringMap(row?.destination_images),
        airlineLogos: normalizeStringMap(row?.airline_logos),
        brandAssets: normalizeStringMap(row?.brand_assets),
        programCardLogos: normalizeStringMap(row?.program_card_logos),
      };
      brandingConfigCache = data;
      return data;
    } finally {
      brandingConfigInFlight = null;
    }
  })();

  return brandingConfigInFlight;
}

export function useBrandingConfig(): {
  loading: boolean;
  error: string | null;
  data: BrandingConfigData;
  refetch: () => Promise<void>;
} {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BrandingConfigData>(EMPTY_DATA);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchBrandingConfig(force));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(brandingConfigCache ?? EMPTY_DATA);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, error, data, refetch: () => load(true) };
}
