import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOAuthMock = vi.fn();
const browserOpenMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithOAuth: (...args: unknown[]) => signInWithOAuthMock(...args),
    },
  },
}));

vi.mock("@capacitor/browser", () => ({
  Browser: { open: (...args: unknown[]) => browserOpenMock(...args) },
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

const wrapper = ({ children }: PropsWithChildren) => <AuthProvider>{children}</AuthProvider>;

describe("signInWithGoogle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithOAuthMock.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/x" },
      error: null,
    });
  });

  afterEach(() => {
    delete (window as WindowWithCapacitor).Capacitor;
  });

  it("na web usa redirect da página pra origin/me (sem skipBrowserRedirect)", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.signInWithGoogle());
    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/me` },
    });
    expect(browserOpenMock).not.toHaveBeenCalled();
  });

  it("no nativo usa deep link + skipBrowserRedirect e abre o Custom Tab", async () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.signInWithGoogle());
    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "br.com.gestmiles.app://auth-callback",
        skipBrowserRedirect: true,
      },
    });
    expect(browserOpenMock).toHaveBeenCalledWith({ url: "https://accounts.google.com/o/oauth2/x" });
  });
});
