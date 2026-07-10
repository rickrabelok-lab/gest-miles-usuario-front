import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

let available = true;
let paywallData: unknown = null;
const purchaseMock = vi.fn();
const restoreMock = vi.fn();
vi.mock("@/lib/revenuecat", () => ({
  isRevenueCatAvailable: () => available,
  getPaywallOfferings: vi.fn(async () => paywallData),
  purchase: (...args: unknown[]) => purchaseMock(...args),
  restorePurchases: (...args: unknown[]) => restoreMock(...args),
}));

const refreshRoleMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ refreshRole: refreshRoleMock }),
}));

let paid = false;
vi.mock("@/hooks/useEntitlement", () => ({
  useEntitlement: () => ({ isPaid: paid, loading: false, entitlement: paid ? "paid" : "free" }),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

import AssinaturaAppScreen from "./AssinaturaAppScreen";

const PAYWALL = {
  monthly: { id: "gm_plus_mensal", priceString: "R$ 10,00", price: 10, raw: {} },
  annual: { id: "gm_plus_anual", priceString: "R$ 96,00", price: 96, raw: {} },
  savingsPct: 20,
};

const renderScreen = () =>
  render(
    <MemoryRouter>
      <AssinaturaAppScreen />
    </MemoryRouter>,
  );

describe("AssinaturaAppScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    available = true;
    paywallData = PAYWALL;
    paid = false;
    purchaseMock.mockResolvedValue("purchased");
  });

  it("mostra 'em breve' quando o RC está indisponível", async () => {
    available = false;
    renderScreen();
    expect(await screen.findByText("Assinatura em breve")).toBeInTheDocument();
  });

  it("renderiza mensal + anual com preços da loja e selo de economia", async () => {
    renderScreen();
    expect(await screen.findByText("R$ 10,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 96,00")).toBeInTheDocument();
    expect(screen.getByText(/economize 20%/i)).toBeInTheDocument();
  });

  it("compra: chama purchase e confirma com toast + refresh do entitlement", async () => {
    renderScreen();
    const botoes = await screen.findAllByRole("button", { name: /assinar/i });
    fireEvent.click(botoes[0]);
    await waitFor(() => expect(purchaseMock).toHaveBeenCalled());
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expect(refreshRoleMock).toHaveBeenCalled();
  });

  it("compra cancelada pelo usuário é silenciosa (sem toast de erro)", async () => {
    purchaseMock.mockResolvedValue("cancelled");
    renderScreen();
    const botoes = await screen.findAllByRole("button", { name: /assinar/i });
    fireEvent.click(botoes[0]);
    await waitFor(() => expect(purchaseMock).toHaveBeenCalled());
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("já assinante vê gestão em vez do paywall", async () => {
    paid = true;
    renderScreen();
    expect(await screen.findByRole("button", { name: /gerenciar assinatura/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^assinar/i })).not.toBeInTheDocument();
  });

  it("restaurar compras com sucesso refaz o entitlement", async () => {
    restoreMock.mockResolvedValue(true);
    renderScreen();
    const btn = await screen.findByRole("button", { name: /restaurar compras/i });
    fireEvent.click(btn);
    await waitFor(() => expect(restoreMock).toHaveBeenCalled());
    expect(refreshRoleMock).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
  });
});
