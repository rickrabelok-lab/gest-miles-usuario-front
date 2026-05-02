/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Sobrescreve wordmark do header (CDN); senão usa `brand_assets.dashboard_header_wordmark` ou o PNG em `src/assets`. */
  readonly VITE_GEST_MILES_HEADER_WORDMARK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
