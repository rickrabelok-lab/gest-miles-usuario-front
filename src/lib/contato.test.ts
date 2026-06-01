import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/services/api", () => ({ apiFetch: mocks.apiFetch }));

import { submitContato } from "./contato";

describe("submitContato", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lança erro e não chama apiFetch quando assunto ou mensagem está vazio", async () => {
    await expect(submitContato({ assunto: "   ", mensagem: "oi", token: "t" })).rejects.toThrow();
    await expect(submitContato({ assunto: "Tema", mensagem: "   ", token: "t" })).rejects.toThrow();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("chama apiFetch com payload trim e token quando válido", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: true, id: "abc" });

    const res = await submitContato({
      assunto: "  Sugestão  ",
      mensagem: "  Texto da mensagem  ",
      token: "tok-1",
    });

    expect(mocks.apiFetch).toHaveBeenCalledWith("/api/contact", {
      method: "POST",
      body: JSON.stringify({ assunto: "Sugestão", mensagem: "Texto da mensagem" }),
      token: "tok-1",
    });
    expect(res).toEqual({ ok: true, id: "abc" });
  });

  it("propaga erro do apiFetch", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error("falha"));
    await expect(
      submitContato({ assunto: "Tema", mensagem: "mensagem", token: "t" }),
    ).rejects.toThrow("falha");
  });
});
