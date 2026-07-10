import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlanoInativoScreen from "./PlanoInativoScreen";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

const renderScreen = () =>
  render(
    <MemoryRouter>
      <PlanoInativoScreen />
    </MemoryRouter>,
  );

describe("PlanoInativoScreen", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete (window as WindowWithCapacitor).Capacitor;
  });

  it("na web mantém o texto atual sem CTA de compra", () => {
    renderScreen();
    expect(screen.getByText(/fale com a sua agência/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver planos/i })).not.toBeInTheDocument();
  });

  it("no nativo mostra o CTA Ver planos", () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    renderScreen();
    expect(screen.getByRole("button", { name: /ver planos/i })).toBeInTheDocument();
  });
});
