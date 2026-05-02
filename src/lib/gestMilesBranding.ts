import gestMilesHeaderWordmark from "@/assets/gest-miles-wordmark-dashboard-header-transparent.png";

function envTrim(key: string): string | undefined {
  const v = import.meta.env[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Chave em `pesquisa_passagens_config.brand_assets` (JSON) — URL pública (ex.: Supabase Storage `branding-assets`). */
export const BRAND_ASSET_HEADER_WORDMARK_KEY = "dashboard_header_wordmark";

/** URL explícita (env ou Supabase) — quando ausente, o header usa o wordmark tipográfico Gest + Miles. */
export function resolveOptionalHeaderWordmarkImageUrl(
  brandAssets: Record<string, string>,
): string | undefined {
  const fromEnv = envTrim("VITE_GEST_MILES_HEADER_WORDMARK_URL");
  if (fromEnv) return fromEnv;
  const fromDb = brandAssets[BRAND_ASSET_HEADER_WORDMARK_KEY]?.trim();
  if (fromDb) return fromDb;
  return undefined;
}

/** PNG de fallback (ex.: export, e-mail) — mesma arte que o manager. */
export function getGestMilesHeaderWordmarkBundled(): string {
  return gestMilesHeaderWordmark;
}
