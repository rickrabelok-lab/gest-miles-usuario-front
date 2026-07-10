import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./AssinaturaClientePage", () => ({
  default: () => <div>tela-stripe-web</div>,
}));
vi.mock("./AssinaturaAppScreen", () => ({
  default: () => <div>tela-loja-nativa</div>,
}));

import AssinaturaRoute from "./AssinaturaRoute";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

// AssinaturaRoute usa React.lazy — precisa de um Suspense boundary (no app real,
// o Suspense do App.tsx cobre; aqui provemos um).
const renderRoute = () =>
  render(
    <MemoryRouter>
      <Suspense fallback={null}>
        <AssinaturaRoute />
      </Suspense>
    </MemoryRouter>,
  );

describe("AssinaturaRoute", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete (window as WindowWithCapacitor).Capacitor;
  });

  it("na web renderiza a página Stripe (inalterada)", async () => {
    renderRoute();
    expect(await screen.findByText("tela-stripe-web")).toBeInTheDocument();
  });

  it("no nativo renderiza a tela da loja", async () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    renderRoute();
    expect(await screen.findByText("tela-loja-nativa")).toBeInTheDocument();
  });
});
