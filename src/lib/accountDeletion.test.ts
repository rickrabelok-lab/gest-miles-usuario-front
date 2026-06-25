import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/services/api", () => ({ apiFetch: mocks.apiFetch }));

import { solicitarExclusaoConta, cancelarExclusaoConta } from "./accountDeletion";

describe("accountDeletion lib", () => {
  beforeEach(() => vi.clearAllMocks());

  it("solicitar chama POST /api/account/deletion-request com token", async () => {
    mocks.apiFetch.mockResolvedValue({ status: "pendente", agendado_para: "2026-07-02T00:00:00.000Z" });
    const res = await solicitarExclusaoConta("tok-1");
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/account/deletion-request",
      expect.objectContaining({ method: "POST", token: "tok-1" }),
    );
    expect(res.status).toBe("pendente");
  });

  it("cancelar chama POST /api/account/deletion-request/cancel com token", async () => {
    mocks.apiFetch.mockResolvedValue({ status: "cancelada" });
    await cancelarExclusaoConta("tok-2");
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/account/deletion-request/cancel",
      expect.objectContaining({ method: "POST", token: "tok-2" }),
    );
  });
});
