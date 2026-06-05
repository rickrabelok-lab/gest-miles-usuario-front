import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ init: vi.fn(), setTag: vi.fn() }));
vi.mock("@sentry/react", () => ({ init: mocks.init, setTag: mocks.setTag }));

describe("initSentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("não inicializa sem VITE_SENTRY_DSN", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "");
    const { initSentry } = await import("./sentry");
    initSentry();
    expect(mocks.init).not.toHaveBeenCalled();
  });

  it("inicializa uma vez quando há DSN", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://abc@o1.ingest.sentry.io/1");
    const { initSentry } = await import("./sentry");
    initSentry();
    initSentry();
    expect(mocks.init).toHaveBeenCalledTimes(1);
  });
});
