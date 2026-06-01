import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/services/api", () => ({ apiFetch: mocks.apiFetch }));

import { enviarConviteIndicacao } from "./indicacao";

describe("enviarConviteIndicacao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lança erro e não chama apiFetch quando e-mail é vazio ou inválido", async () => {
    await expect(enviarConviteIndicacao({ email: "   ", token: "t" })).rejects.toThrow();
    await expect(enviarConviteIndicacao({ email: "semarroba", token: "t" })).rejects.toThrow();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("chama apiFetch com e-mail normalizado (trim+lower) e token quando válido", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: true });

    const res = await enviarConviteIndicacao({ email: "  Amigo@Email.COM ", token: "tok-1" });

    expect(mocks.apiFetch).toHaveBeenCalledWith("/api/referrals/invite", {
      method: "POST",
      body: JSON.stringify({ email: "amigo@email.com" }),
      token: "tok-1",
    });
    expect(res).toEqual({ ok: true });
  });

  it("propaga erro do apiFetch", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error("falha"));
    await expect(
      enviarConviteIndicacao({ email: "a@b.com", token: "t" }),
    ).rejects.toThrow("falha");
  });
});
