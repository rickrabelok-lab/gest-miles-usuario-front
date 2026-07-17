import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/services/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { getPromoWhatsappPref, setPromoWhatsappPref } from "./notifications";

describe("notifications lib", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getPromoWhatsappPref faz GET com o token", async () => {
    apiFetch.mockResolvedValue({ enabled: true });
    const out = await getPromoWhatsappPref("tok");
    expect(apiFetch).toHaveBeenCalledWith("/api/notifications/promo-whatsapp", { token: "tok" });
    expect(out).toEqual({ enabled: true });
  });

  it("setPromoWhatsappPref faz PUT com enabled no body", async () => {
    apiFetch.mockResolvedValue({ enabled: false });
    const out = await setPromoWhatsappPref("tok", false);
    expect(apiFetch).toHaveBeenCalledWith("/api/notifications/promo-whatsapp", {
      method: "PUT",
      body: JSON.stringify({ enabled: false }),
      token: "tok",
    });
    expect(out).toEqual({ enabled: false });
  });
});
