import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configure: vi.fn().mockResolvedValue(undefined),
  logIn: vi.fn().mockResolvedValue({}),
  logOut: vi.fn().mockResolvedValue({}),
}));

vi.mock("@revenuecat/purchases-capacitor", () => ({
  Purchases: {
    configure: mocks.configure,
    logIn: mocks.logIn,
    logOut: mocks.logOut,
  },
}));

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

describe("ciclo de vida do usuário no RevenueCat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv("VITE_REVENUECAT_ANDROID_KEY", "goog_test");
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as WindowWithCapacitor).Capacitor;
  });

  it("re-login do MESMO usuário após logOut refaz o logIn (SDK não fica anônimo)", async () => {
    const rc = await import("./revenuecat");
    await rc.ensureRevenueCatUser("user-a");
    expect(mocks.configure).toHaveBeenCalledTimes(1);
    await rc.logOutRevenueCat();
    expect(mocks.logOut).toHaveBeenCalledTimes(1);
    await rc.ensureRevenueCatUser("user-a");
    expect(mocks.logIn).toHaveBeenCalledWith({ appUserID: "user-a" });
  });

  it("troca de usuário usa logIn (configure só na primeira vez)", async () => {
    const rc = await import("./revenuecat");
    await rc.ensureRevenueCatUser("user-a");
    await rc.ensureRevenueCatUser("user-b");
    expect(mocks.configure).toHaveBeenCalledTimes(1);
    expect(mocks.logIn).toHaveBeenCalledWith({ appUserID: "user-b" });
  });
});
