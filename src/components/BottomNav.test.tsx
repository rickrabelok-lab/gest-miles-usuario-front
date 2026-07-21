import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return { ...original, useNavigate: () => navigateMock };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/hooks/useNotificacoes", () => ({
  useNotificacoes: () => ({ data: undefined }),
}));

import BottomNav from "./BottomNav";

const renderNav = (initialEntry = "/") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <BottomNav />
    </MemoryRouter>,
  );

describe("BottomNav — aba Passagens", () => {
  beforeEach(() => vi.clearAllMocks());

  it("navega via SPA pra /search-flights (sem recarregar o app)", () => {
    renderNav("/");
    fireEvent.click(screen.getByRole("button", { name: /passagens/i }));
    expect(navigateMock).toHaveBeenCalledWith("/search-flights");
  });

  it("preserva os searchParams (menos view) no destino", () => {
    renderNav("/?clientId=abc&view=programas");
    fireEvent.click(screen.getByRole("button", { name: /passagens/i }));
    expect(navigateMock).toHaveBeenCalledWith("/search-flights?clientId=abc");
  });
});

describe("BottomNav — safe-area", () => {
  beforeEach(() => vi.clearAllMocks());

  it("spacer do rodapé usa a cadeia --gm-safe-bottom (barra de gestos no edge-to-edge)", () => {
    const { container } = renderNav("/");
    expect(container.querySelector('[class="h-[var(--gm-safe-bottom)]"]')).not.toBeNull();
  });
});
