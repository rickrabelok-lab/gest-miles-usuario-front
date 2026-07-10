import { afterEach, describe, expect, it } from "vitest";

import {
  AUTH_DEEP_LINK,
  authRedirectUrl,
  isNativePlatform,
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

  it("extrai tokens do fragment", () => {
    expect(
      parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#access_token=at&refresh_token=rt&token_type=bearer`),
    ).toEqual({ kind: "tokens", accessToken: "at", refreshToken: "rt" });
  });

  it("trata fragment com token incompleto como erro", () => {
    expect(parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#access_token=at`)).toEqual({
      kind: "error",
      message: "Resposta de login incompleta.",
    });
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
