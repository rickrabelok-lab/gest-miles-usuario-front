import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_DEEP_LINK,
  authRedirectUrl,
  isNativePlatform,
  isTokenInjectionAllowed,
  parseAuthCallbackUrl,
} from "./nativeAuth";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

const setNative = (native: boolean) => {
  (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => native };
};

afterEach(() => {
  delete (window as WindowWithCapacitor).Capacitor;
});

describe("isNativePlatform", () => {
  it("é false na web (sem window.Capacitor)", () => {
    expect(isNativePlatform()).toBe(false);
  });

  it("é true quando o runtime Capacitor reporta nativo", () => {
    setNative(true);
    expect(isNativePlatform()).toBe(true);
  });

  it("é false quando o runtime Capacitor reporta web", () => {
    setNative(false);
    expect(isNativePlatform()).toBe(false);
  });
});

describe("authRedirectUrl", () => {
  it("na web devolve origin + path", () => {
    expect(authRedirectUrl("/me")).toBe(`${window.location.origin}/me`);
  });

  it("no nativo devolve o deep link", () => {
    setNative(true);
    expect(authRedirectUrl("/me")).toBe(AUTH_DEEP_LINK);
  });
});

describe("parseAuthCallbackUrl", () => {
  it("ignora URL de outro scheme", () => {
    expect(parseAuthCallbackUrl("https://gestmiles.com.br/?code=x")).toEqual({ kind: "ignore" });
  });

  it("ignora deep link sem payload", () => {
    expect(parseAuthCallbackUrl(AUTH_DEEP_LINK)).toEqual({ kind: "ignore" });
  });

  it("extrai ?code= (PKCE)", () => {
    expect(parseAuthCallbackUrl(`${AUTH_DEEP_LINK}?code=abc-123`)).toEqual({
      kind: "code",
      code: "abc-123",
    });
  });

  it("extrai tokens do fragment quando allowTokenInjection=true", () => {
    expect(
      parseAuthCallbackUrl(
        `${AUTH_DEEP_LINK}#access_token=at&refresh_token=rt&token_type=bearer`,
        true,
      ),
    ).toEqual({ kind: "tokens", accessToken: "at", refreshToken: "rt" });
  });

  it("trata token incompleto como erro quando allowTokenInjection=true", () => {
    expect(parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#access_token=at`, true)).toEqual({
      kind: "error",
      message: "Resposta de login incompleta.",
    });
  });

  it("IGNORA tokens do fragment quando allowTokenInjection=false", () => {
    expect(
      parseAuthCallbackUrl(
        `${AUTH_DEEP_LINK}#access_token=at&refresh_token=rt&token_type=bearer`,
        false,
      ),
    ).toEqual({ kind: "ignore" });
  });

  it("IGNORA token incompleto quando allowTokenInjection=false", () => {
    expect(parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#access_token=at`, false)).toEqual({
      kind: "ignore",
    });
  });

  it("por default (sem 2º arg) NÃO injeta tokens — ignora", () => {
    expect(
      parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#access_token=at&refresh_token=rt`),
    ).toEqual({ kind: "ignore" });
  });

  it("erro do GoTrue no fragment é reportado mesmo com allowTokenInjection=false", () => {
    expect(
      parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#error=server_error&error_description=Oops`, false),
    ).toEqual({ kind: "error", message: "Oops" });
  });

  it("prioriza erro do GoTrue na query", () => {
    const result = parseAuthCallbackUrl(
      `${AUTH_DEEP_LINK}?error=access_denied&error_description=Usuario+cancelou`,
    );
    expect(result).toEqual({ kind: "error", message: "Usuario cancelou" });
  });

  it("reconhece erro no fragment", () => {
    const result = parseAuthCallbackUrl(
      `${AUTH_DEEP_LINK}#error=server_error&error_description=Oops`,
    );
    expect(result).toEqual({ kind: "error", message: "Oops" });
  });
});

describe("isTokenInjectionAllowed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("é true só quando VITE_ALLOW_TOKEN_DEEPLINK === 'true'", () => {
    vi.stubEnv("VITE_ALLOW_TOKEN_DEEPLINK", "true");
    expect(isTokenInjectionAllowed()).toBe(true);
  });

  it("é false quando a flag é 'false'", () => {
    vi.stubEnv("VITE_ALLOW_TOKEN_DEEPLINK", "false");
    expect(isTokenInjectionAllowed()).toBe(false);
  });

  it("é false quando a flag está ausente", () => {
    vi.stubEnv("VITE_ALLOW_TOKEN_DEEPLINK", "");
    expect(isTokenInjectionAllowed()).toBe(false);
  });
});
