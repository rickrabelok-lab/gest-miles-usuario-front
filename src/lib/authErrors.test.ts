import { describe, it, expect } from "vitest";

import { isEmailNotConfirmedError } from "./authErrors";

describe("isEmailNotConfirmedError", () => {
  it("detecta a mensagem do GoTrue de e-mail não confirmado", () => {
    expect(isEmailNotConfirmedError(new Error("Email not confirmed"))).toBe(true);
    expect(isEmailNotConfirmedError({ code: "email_not_confirmed", message: "x" })).toBe(true);
    expect(isEmailNotConfirmedError("Email not confirmed")).toBe(true);
  });

  it("não confunde com outros erros de auth", () => {
    expect(isEmailNotConfirmedError(new Error("Invalid login credentials"))).toBe(false);
    expect(isEmailNotConfirmedError(new Error("Failed to fetch"))).toBe(false);
    expect(isEmailNotConfirmedError(null)).toBe(false);
    expect(isEmailNotConfirmedError(undefined)).toBe(false);
  });
});
