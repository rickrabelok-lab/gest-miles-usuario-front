import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return { ...original, useNavigate: () => (...args: unknown[]) => navigateMock(...args) };
});

const listenerRemoveMock = vi.fn();
let appUrlOpenCallback: ((event: { url: string }) => void) | null = null;
let launchUrl: string | null = null;

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async (_event: string, cb: (event: { url: string }) => void) => {
      appUrlOpenCallback = cb;
      return { remove: listenerRemoveMock };
    }),
    getLaunchUrl: vi.fn(async () => (launchUrl ? { url: launchUrl } : undefined)),
  },
}));

const browserCloseMock = vi.fn();
vi.mock("@capacitor/browser", () => ({
  Browser: { close: (...args: unknown[]) => browserCloseMock(...args) },
}));

const exchangeCodeForSessionMock = vi.fn();
const setSessionMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSessionMock(...args),
      setSession: (...args: unknown[]) => setSessionMock(...args),
    },
  },
}));

const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

import NativeAuthDeepLinkHandler, {
  __resetHandledAuthUrlsForTests,
} from "./NativeAuthDeepLinkHandler";

const DEEP_LINK = "br.com.gestmiles.app://auth-callback";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

const renderHandler = () =>
  render(
    <MemoryRouter>
      <NativeAuthDeepLinkHandler />
    </MemoryRouter>,
  );

describe("NativeAuthDeepLinkHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetHandledAuthUrlsForTests();
    appUrlOpenCallback = null;
    launchUrl = null;
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    setSessionMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    delete (window as WindowWithCapacitor).Capacitor;
  });

  it("na web não registra listener", async () => {
    delete (window as WindowWithCapacitor).Capacitor;
    renderHandler();
    const { App } = await import("@capacitor/app");
    await Promise.resolve();
    expect(App.addListener).not.toHaveBeenCalled();
  });

  it("troca ?code= por sessão e navega pro /me", async () => {
    renderHandler();
    await waitFor(() => expect(appUrlOpenCallback).not.toBeNull());
    appUrlOpenCallback?.({ url: `${DEEP_LINK}?code=abc` });
    await waitFor(() => expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc"));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/me", { replace: true }));
  });

  it("estabelece sessão por tokens no fragment (rota do E2E via adb)", async () => {
    renderHandler();
    await waitFor(() => expect(appUrlOpenCallback).not.toBeNull());
    appUrlOpenCallback?.({ url: `${DEEP_LINK}#access_token=at&refresh_token=rt` });
    await waitFor(() =>
      expect(setSessionMock).toHaveBeenCalledWith({ access_token: "at", refresh_token: "rt" }),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/me", { replace: true }));
    expect(browserCloseMock).toHaveBeenCalled();
  });

  it("erro do GoTrue vira toast e volta pro /auth", async () => {
    renderHandler();
    await waitFor(() => expect(appUrlOpenCallback).not.toBeNull());
    appUrlOpenCallback?.({ url: `${DEEP_LINK}?error=access_denied&error_description=Cancelado` });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith("/auth", { replace: true });
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });

  it("falha no exchange vira toast e volta pro /auth", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: new Error("invalid code") });
    renderHandler();
    await waitFor(() => expect(appUrlOpenCallback).not.toBeNull());
    appUrlOpenCallback?.({ url: `${DEEP_LINK}?code=ruim` });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith("/auth", { replace: true });
  });

  it("processa o launch URL do cold start e deduplica com o evento", async () => {
    launchUrl = `${DEEP_LINK}?code=cold`;
    renderHandler();
    await waitFor(() => expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("cold"));
    appUrlOpenCallback?.({ url: `${DEEP_LINK}?code=cold` });
    await Promise.resolve();
    expect(exchangeCodeForSessionMock).toHaveBeenCalledTimes(1);
  });

  it("ignora deep link que não é o de auth", async () => {
    renderHandler();
    await waitFor(() => expect(appUrlOpenCallback).not.toBeNull());
    appUrlOpenCallback?.({ url: "br.com.gestmiles.app://outra-coisa" });
    await Promise.resolve();
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    expect(setSessionMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("não reprocessa o launch URL quando a identidade do navigate muda (re-render)", async () => {
    launchUrl = `${DEEP_LINK}?code=stale`;
    const view = render(
      <MemoryRouter>
        <NativeAuthDeepLinkHandler />
      </MemoryRouter>,
    );
    await waitFor(() => expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("stale"));
    view.rerender(
      <MemoryRouter>
        <NativeAuthDeepLinkHandler />
      </MemoryRouter>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { App } = await import("@capacitor/app");
    expect(App.getLaunchUrl).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSessionMock).toHaveBeenCalledTimes(1);
  });
});
