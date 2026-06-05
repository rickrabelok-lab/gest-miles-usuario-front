// URLs das páginas legais. Env-driven (override por VITE_LEGAL_*); default no site público.
// Owner confirmou base https://gestmiles.com.br com paths /termos /privacidade /cookies (2026-06-05).
const BASE =
  (import.meta.env.VITE_LEGAL_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://gestmiles.com.br";

export const TERMS_URL =
  (import.meta.env.VITE_LEGAL_TERMS_URL as string | undefined) || `${BASE}/termos`;
export const PRIVACY_URL =
  (import.meta.env.VITE_LEGAL_PRIVACY_URL as string | undefined) || `${BASE}/privacidade`;
export const COOKIES_URL =
  (import.meta.env.VITE_LEGAL_COOKIES_URL as string | undefined) || `${BASE}/cookies`;
