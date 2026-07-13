import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deliverJson, gatherUserData, type DataExportBundle } from "./dataExportService";

// Plataforma + plugins nativos controláveis por teste (deliverJson roteia por elas).
const h = vi.hoisted(() => ({ native: false, writeFile: vi.fn(), share: vi.fn() }));
vi.mock("@/lib/nativeAuth", () => ({ isNativePlatform: () => h.native }));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { writeFile: (...a: unknown[]) => h.writeFile(...a) },
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: (...a: unknown[]) => h.share(...a) } }));

// Mock chainável do Supabase client. Cada tabela tem um resultado em `results`
// (chave = nome da tabela, ou "rpc:<nome>"). Registra chamadas em `calls`.
function makeClient(results: Record<string, { data?: unknown; error?: unknown }>) {
  const calls = { from: [] as string[], select: [] as unknown[][], eq: [] as unknown[][] };
  const builder = (key: string) => {
    const result = () => Promise.resolve(results[key] ?? { data: [], error: null });
    const b: Record<string, unknown> = {
      select: (cols: string) => {
        calls.select.push([key, cols]);
        return b;
      },
      eq: (col: string, val: unknown) => {
        calls.eq.push([key, col, val]);
        return b;
      },
      maybeSingle: () => result(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        result().then(resolve, reject),
    };
    return b;
  };
  const client = {
    from: (table: string) => {
      calls.from.push(table);
      return builder(table);
    },
    rpc: (name: string) => {
      calls.from.push(`rpc:${name}`);
      return Promise.resolve(results[`rpc:${name}`] ?? { data: null, error: null });
    },
  };
  return { client, calls };
}

const ACCOUNT = { id: "u-1", email: "cliente@x.com", criadoEm: "2026-01-01T00:00:00.000Z" };

describe("gatherUserData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("monta o bundle com todas as chaves, metadados e conta", async () => {
    const { client } = makeClient({});
    const bundle = await gatherUserData("u-1", ACCOUNT, client as never);

    expect(typeof bundle.exportadoEm).toBe("string");
    expect(bundle.aplicacao).toContain("Gest Miles");
    expect(bundle.conta).toEqual(ACCOUNT);
    expect(bundle).toHaveProperty("perfil");
    expect(bundle).toHaveProperty("programas");
    expect(bundle).toHaveProperty("demandas");
    expect(bundle).toHaveProperty("preferencias");
    expect(bundle).toHaveProperty("timeline");
    expect(bundle).toHaveProperty("npsAvaliacoes");
    expect(bundle).toHaveProperty("csatAvaliacoes");
    expect(bundle).toHaveProperty("alertas");
    expect(bundle).toHaveProperty("mensagensContato");
    expect(bundle).toHaveProperty("indicacoes");
  });

  it("sempre inclui a nota fixa sobre credenciais cifradas", async () => {
    const { client } = makeClient({});
    const bundle = await gatherUserData("u-1", ACCOUNT, client as never);
    expect(bundle.observacoes.some((o) => o.toLowerCase().includes("cifrad"))).toBe(true);
  });

  it("consulta cada fonte com a tabela e a coluna de dono corretas", async () => {
    const { client, calls } = makeClient({});
    await gatherUserData("u-1", ACCOUNT, client as never);

    expect(calls.from).toContain("perfis");
    expect(calls.from).toContain("programas_cliente");
    expect(calls.from).toContain("demandas_cliente");
    expect(calls.from).toContain("preferencias_usuario");
    expect(calls.from).toContain("timeline_eventos");
    expect(calls.from).toContain("nps_avaliacoes");
    expect(calls.from).toContain("csat_avaliacoes");
    expect(calls.from).toContain("alertas_sistema");
    expect(calls.from).toContain("mensagens_contato");
    expect(calls.from).toContain("rpc:indicacao_meu_resumo");

    expect(calls.eq).toContainEqual(["perfis", "usuario_id", "u-1"]);
    expect(calls.eq).toContainEqual(["preferencias_usuario", "usuario_id", "u-1"]);
    expect(calls.eq).toContainEqual(["programas_cliente", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["demandas_cliente", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["timeline_eventos", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["nps_avaliacoes", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["csat_avaliacoes", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["alertas_sistema", "cliente_id", "u-1"]);
    expect(calls.eq).toContainEqual(["mensagens_contato", "cliente_usuario_id", "u-1"]);

    // Fronteira de segurança: `perfis` NUNCA via select("*") (vazaria stripe_*/
    // subscription_*/admin_level) — usa a allowlist de colunas pessoais.
    const perfilSelect = calls.select.find(([t]) => t === "perfis")?.[1] as string | undefined;
    expect(perfilSelect).toBeDefined();
    expect(perfilSelect).not.toBe("*");
    expect(perfilSelect).toContain("cpf");
    expect(perfilSelect).not.toContain("stripe");
  });

  it("NUNCA consulta a tabela de credenciais cifradas", async () => {
    const { client, calls } = makeClient({});
    await gatherUserData("u-1", ACCOUNT, client as never);
    expect(calls.from).not.toContain("cliente_programa_acessos");
  });

  it("uma fonte que falha vira observação e não derruba o resto", async () => {
    const { client } = makeClient({
      timeline_eventos: { data: null, error: { message: "permission denied" } },
      programas_cliente: { data: [{ id: "p1" }], error: null },
    });
    const bundle = await gatherUserData("u-1", ACCOUNT, client as never);

    expect(bundle.observacoes.some((o) => o.toLowerCase().includes("timeline"))).toBe(true);
    expect(bundle.programas).toEqual([{ id: "p1" }]);
  });

  it("inclui o resumo de indicações vindo da RPC", async () => {
    const { client } = makeClient({
      "rpc:indicacao_meu_resumo": { data: { codigo: "ABC", total_cadastrados: 3 }, error: null },
    });
    const bundle = await gatherUserData("u-1", ACCOUNT, client as never);
    expect(bundle.indicacoes).toEqual({ codigo: "ABC", total_cadastrados: 3 });
  });
});

const mkBundle = (exportadoEm: string): DataExportBundle => ({
  exportadoEm,
  aplicacao: "Gest Miles — app do cliente",
  conta: ACCOUNT,
  perfil: null,
  programas: [],
  demandas: [],
  preferencias: null,
  timeline: [],
  npsAvaliacoes: [],
  csatAvaliacoes: [],
  alertas: [],
  mensagensContato: [],
  indicacoes: null,
  observacoes: [],
});

describe("deliverJson", () => {
  beforeEach(() => {
    h.native = false;
    h.writeFile.mockReset();
    h.share.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("web: nomeia o arquivo com a data do export e dispara o download por blob", async () => {
    vi.useFakeTimers();

    const createSpy = vi.fn().mockReturnValue("blob:fake");
    const revokeSpy = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createSpy,
      revokeObjectURL: revokeSpy,
    });

    const mockAnchor = {
      href: "",
      download: "",
      click: vi.fn(),
      remove: vi.fn(),
    };
    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockReturnValue(mockAnchor as never);
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation(() => mockAnchor as never);

    const outcome = await deliverJson(mkBundle("2026-06-25T10:00:00.000Z"));

    expect(outcome).toBe("delivered");
    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(mockAnchor.download).toBe("gest-miles-meus-dados-2026-06-25.json");
    expect(appendSpy).toHaveBeenCalledWith(mockAnchor);
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockAnchor.remove).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalled();
    expect(h.writeFile).not.toHaveBeenCalled();

    // revoke é adiado via setTimeout — não deve ter rodado ainda
    expect(revokeSpy).not.toHaveBeenCalled();

    // dispara o timer pendente e confirma que o revoke foi chamado com a URL correta
    vi.runAllTimers();
    expect(revokeSpy).toHaveBeenCalledWith("blob:fake");
  });

  it("nativo: grava no cache (Filesystem) e abre o share sheet — não usa blob", async () => {
    h.native = true;
    h.writeFile.mockResolvedValue({ uri: "file:///cache/x.json" });
    h.share.mockResolvedValue(undefined);
    const createElementSpy = vi.spyOn(document, "createElement");

    const outcome = await deliverJson(mkBundle("2026-06-25T10:00:00.000Z"));

    expect(outcome).toBe("delivered");
    expect(h.writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "gest-miles-meus-dados-2026-06-25.json",
        directory: "CACHE",
        encoding: "utf8",
      }),
    );
    expect(h.share).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file:///cache/x.json" }),
    );
    expect(createElementSpy).not.toHaveBeenCalled();
  });

  it("nativo: cancelar o share sheet devolve 'cancelled' (não é erro)", async () => {
    h.native = true;
    h.writeFile.mockResolvedValue({ uri: "file:///cache/x.json" });
    h.share.mockRejectedValue(new Error("Share canceled"));

    const outcome = await deliverJson(mkBundle("2026-06-25T10:00:00.000Z"));

    expect(outcome).toBe("cancelled");
  });
});
