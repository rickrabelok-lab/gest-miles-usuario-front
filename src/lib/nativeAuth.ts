/**
 * Helpers de auth pro app nativo (Capacitor).
 *
 * No app, o retorno de OAuth/links de e-mail chega por custom scheme; na web
 * continua voltando pra origin. Spec:
 * docs/superpowers/specs/2026-07-10-mobile-auth-deep-links-design.md
 */

export const AUTH_DEEP_LINK = "br.com.gestmiles.app://auth-callback";

type CapacitorGlobal = { isNativePlatform?: () => boolean };

export function isNativePlatform(): boolean {
  const cap = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function authRedirectUrl(path: string): string {
  if (isNativePlatform()) return AUTH_DEEP_LINK;
  return `${window.location.origin}${path}`;
}

export type AuthCallbackResult =
  | { kind: "code"; code: string }
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string }
  | { kind: "ignore" };

/**
 * Interpreta a URL recebida via appUrlOpen. Função pura (sem Capacitor nem
 * Supabase): aceita `?code=` (PKCE), tokens no fragment (usado tb no E2E via
 * adb) e `error`/`error_description` do GoTrue (query ou fragment).
 * Não usa `new URL()` de propósito — parsing de host em scheme custom varia.
 */
export function parseAuthCallbackUrl(url: string): AuthCallbackResult {
  if (!url.startsWith(AUTH_DEEP_LINK)) return { kind: "ignore" };

  const rest = url.slice(AUTH_DEEP_LINK.length);
  const hashIndex = rest.indexOf("#");
  const fragment = hashIndex >= 0 ? rest.slice(hashIndex + 1) : "";
  const beforeHash = hashIndex >= 0 ? rest.slice(0, hashIndex) : rest;
  const queryIndex = beforeHash.indexOf("?");
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : "";

  const queryParams = new URLSearchParams(query);
  const fragmentParams = new URLSearchParams(fragment);

  const errorDescription =
    queryParams.get("error_description") ?? fragmentParams.get("error_description");
  const errorCode = queryParams.get("error") ?? fragmentParams.get("error");
  if (errorCode || errorDescription) {
    return { kind: "error", message: errorDescription ?? errorCode ?? "Erro desconhecido" };
  }

  const code = queryParams.get("code");
  if (code) return { kind: "code", code };

  const accessToken = fragmentParams.get("access_token");
  const refreshToken = fragmentParams.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "tokens", accessToken, refreshToken };
  }
  if (accessToken || refreshToken) {
    return { kind: "error", message: "Resposta de login incompleta." };
  }

  return { kind: "ignore" };
}
