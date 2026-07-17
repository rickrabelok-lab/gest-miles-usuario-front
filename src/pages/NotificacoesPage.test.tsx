// src/pages/NotificacoesPage.test.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotificacoesPage from "./NotificacoesPage";

const hookState = {
  enabled: true,
  loading: false,
  saving: false,
  error: null as string | null,
  reload: vi.fn(),
  toggle: vi.fn(),
};
vi.mock("@/hooks/useNotificationPrefs", () => ({
  useNotificationPrefs: () => hookState,
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));
vi.mock("@/components/BottomNav", () => ({ default: () => <nav data-testid="bottomnav" /> }));

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificacoesPage />
    </MemoryRouter>,
  );
}

describe("NotificacoesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState.enabled = true;
    hookState.loading = false;
    hookState.saving = false;
    hookState.error = null;
    hookState.toggle = vi.fn().mockResolvedValue(undefined);
  });

  it("mostra o toggle refletindo o estado carregado (ligado)", () => {
    renderPage();
    const sw = screen.getByRole("switch", { name: "Promoções no WhatsApp" });
    expect(sw).toBeChecked();
    expect(screen.getByText("Promoções no WhatsApp")).toBeInTheDocument();
  });

  it("estado de loading mostra Carregando…", () => {
    hookState.loading = true;
    renderPage();
    expect(screen.getByText(/Carregando/)).toBeInTheDocument();
  });

  it("estado de erro mostra retry e chama reload", () => {
    hookState.error = "falha";
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(hookState.reload).toHaveBeenCalled();
  });

  it("clicar no toggle chama toggle(false)", () => {
    renderPage();
    fireEvent.click(screen.getByRole("switch", { name: "Promoções no WhatsApp" }));
    expect(hookState.toggle).toHaveBeenCalledWith(false);
  });

  it("erro no toggle dispara toast", async () => {
    hookState.toggle = vi.fn().mockRejectedValue(new Error("x"));
    renderPage();
    fireEvent.click(screen.getByRole("switch", { name: "Promoções no WhatsApp" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });

  it("desabilita o switch enquanto está salvando", () => {
    hookState.saving = true;
    renderPage();
    expect(screen.getByRole("switch", { name: "Promoções no WhatsApp" })).toBeDisabled();
  });
});
