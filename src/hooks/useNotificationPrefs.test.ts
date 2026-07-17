import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const getPref = vi.fn();
const setPref = vi.fn();
const getSession = vi.fn();

vi.mock("@/lib/notifications", () => ({
  getPromoWhatsappPref: (...a: unknown[]) => getPref(...a),
  setPromoWhatsappPref: (...a: unknown[]) => setPref(...a),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));

import { useNotificationPrefs } from "./useNotificationPrefs";

describe("useNotificationPrefs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  });

  it("carrega o estado no mount", async () => {
    getPref.mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => useNotificationPrefs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("toggle otimista confirma pelo retorno do backend", async () => {
    getPref.mockResolvedValue({ enabled: true });
    setPref.mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => useNotificationPrefs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.toggle(false);
    });
    expect(setPref).toHaveBeenCalledWith("tok", false);
    expect(result.current.enabled).toBe(false);
  });

  it("toggle reverte e relança em erro do backend", async () => {
    getPref.mockResolvedValue({ enabled: true });
    setPref.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useNotificationPrefs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(
      act(async () => {
        await result.current.toggle(false);
      }),
    ).rejects.toThrow("boom");
    expect(result.current.enabled).toBe(true); // revertido
  });

  it("erro no load popula error e não trava loading", async () => {
    getPref.mockRejectedValue(new Error("falha"));
    const { result } = renderHook(() => useNotificationPrefs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("falha");
  });
});
