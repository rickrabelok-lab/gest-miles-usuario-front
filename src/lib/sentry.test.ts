import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { scrubPii, scrubEvent } from "./sentry";

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

describe("scrubPii", () => {
  it("redige e-mail, CPF, token Bearer e JWT", () => {
    expect(scrubPii("falha do usuario joao@exemplo.com")).toBe("falha do usuario [REDACTED_EMAIL]");
    expect(scrubPii("cpf 123.456.789-09 invalido")).toBe("cpf [REDACTED_CPF] invalido");
    expect(scrubPii("cpf sem mascara 12345678909 aqui")).toBe("cpf sem mascara [REDACTED_CPF] aqui");
    expect(scrubPii("Authorization: Bearer abc.def-123")).toBe("Authorization: Bearer [REDACTED]");
    expect(scrubPii("token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")).toBe("token [REDACTED_TOKEN]");
  });

  it("não altera texto sem PII e tolera entrada não-string", () => {
    expect(scrubPii("Erro ao carregar a pagina")).toBe("Erro ao carregar a pagina");
    expect(scrubPii("")).toBe("");
    expect(scrubPii(null as unknown as string)).toBe(null);
  });
});

describe("scrubEvent", () => {
  it("raspa message, exception values e breadcrumbs do evento", () => {
    const event = {
      message: "erro de maria@teste.com",
      exception: { values: [{ value: "login falhou para joao@x.com" }] },
      breadcrumbs: [{ message: "Bearer eyJabc.def-1234567890" }],
    };
    const out = scrubEvent(event);
    expect(out.message).toBe("erro de [REDACTED_EMAIL]");
    expect(out.exception.values[0].value).toBe("login falhou para [REDACTED_EMAIL]");
    expect(out.breadcrumbs[0].message).toBe("Bearer [REDACTED]");
  });

  it("é seguro com evento sem os campos opcionais", () => {
    expect(() => scrubEvent({})).not.toThrow();
  });
});
