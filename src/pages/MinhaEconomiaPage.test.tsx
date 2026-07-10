import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

const renderPdfMock = vi.fn().mockResolvedValue({ fake: "pdf" });
const deliverPdfMock = vi.fn().mockResolvedValue("delivered");
vi.mock("@/lib/pdfDelivery", () => ({
  renderElementToA4Pdf: (...args: unknown[]) => renderPdfMock(...args),
  deliverPdf: (...args: unknown[]) => deliverPdfMock(...args),
}));

import MinhaEconomiaPage from "@/pages/MinhaEconomiaPage";
import type { RelatorioEconomia } from "@/lib/relatorio-economia";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete (window as Window & { Capacitor?: unknown }).Capacitor;
});

const relatorio: RelatorioEconomia = {
  kpis: {
    economiaEmissoes: 1266.32, economiaTotal: 1266.32, numEmissoes: 1, numCotacoes: 0,
    funilCotacoes: { entregues: 0, fechadas: 0, naoFechadas: 0, expiradas: 0 },
    milhasGeradasPromocoes: 0, milhasCustoZero: 0, custoMilheiroMedio: null,
  },
  eventos: [],
  caseDestaque: null,
};

function makeHook(fetchRelatorio = vi.fn()) {
  return () => ({ data: relatorio, loading: false, error: null, fetchRelatorio });
}

describe("MinhaEconomiaPage", () => {
  it("busca o relatório do usuário logado ao montar (período padrão 12m)", async () => {
    const fetchRelatorio = vi.fn();
    render(
      <MemoryRouter>
        <MinhaEconomiaPage useHook={makeHook(fetchRelatorio)} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchRelatorio).toHaveBeenCalled());
    const [clienteId, inicio, fim] = fetchRelatorio.mock.calls[0];
    expect(clienteId).toBe("user-1");
    expect(inicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fim).toBeNull();
  });

  it("chip Tudo refaz o fetch sem período", async () => {
    const fetchRelatorio = vi.fn();
    render(
      <MemoryRouter>
        <MinhaEconomiaPage useHook={makeHook(fetchRelatorio)} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^tudo$/i }));
    await waitFor(() =>
      expect(fetchRelatorio).toHaveBeenLastCalledWith("user-1", null, null),
    );
  });

  it("Baixar relatório chama window.print", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <MinhaEconomiaPage useHook={makeHook()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /baixar relatório/i }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("no app nativo o botão gera PDF e abre o share (sem window.print)", async () => {
    (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor = {
      isNativePlatform: () => true,
    };
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <MinhaEconomiaPage useHook={makeHook()} />
      </MemoryRouter>,
    );
    const btn = await screen.findByRole("button", { name: /baixar relatório em pdf/i });
    fireEvent.click(btn);
    await waitFor(() => expect(renderPdfMock).toHaveBeenCalled());
    expect(deliverPdfMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^minha-economia-.*\.pdf$/),
    );
    expect(printSpy).not.toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("mostra a economia total do relatório", () => {
    render(
      <MemoryRouter>
        <MinhaEconomiaPage useHook={makeHook()} />
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/1\.266,32/).length).toBeGreaterThanOrEqual(1);
  });
});
