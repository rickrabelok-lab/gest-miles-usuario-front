// URLs das páginas legais. Default: rotas próprias do app (`/termos` etc., servidas em
// app.gestmiles.com.br — subdomínio de gestmiles.com.br). Override por VITE_LEGAL_* caso
// um dia passem a ser servidas pelo site apex (gestmiles.com.br) ou outro domínio.
const BASE = (import.meta.env.VITE_LEGAL_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export const TERMS_URL =
  (import.meta.env.VITE_LEGAL_TERMS_URL as string | undefined) || `${BASE}/termos`;
export const PRIVACY_URL =
  (import.meta.env.VITE_LEGAL_PRIVACY_URL as string | undefined) || `${BASE}/privacidade`;
export const COOKIES_URL =
  (import.meta.env.VITE_LEGAL_COOKIES_URL as string | undefined) || `${BASE}/cookies`;
