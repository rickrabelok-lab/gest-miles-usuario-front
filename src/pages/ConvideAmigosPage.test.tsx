import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
  enviarConvite: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } },
}));
vi.mock("@/services/api", () => ({ hasApiUrl: () => true }));
vi.mock("@/lib/indicacao", () => ({ enviarConviteIndicacao: mocks.enviarConvite }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import ConvideAmigosPage from "./ConvideAmigosPage";

const renderPage = () =>
  render(
    <MemoryRouter>
      <ConvideAmigosPage />
    </MemoryRouter>,
  );

describe("ConvideAmigosPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({
      data: { codigo: "AB12CD34", total_cadastrados: 3 },
      error: null,
    });
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mocks.writeText },
      configurable: true,
    });
    mocks.writeText.mockResolvedValue(undefined);
  });

  it("mostra link com o código e o contador vindos da RPC", async () => {
    renderPage();
    expect(await screen.findByDisplayValue(/ref=AB12CD34/)).toBeTruthy();
    const counter = await screen.findByText(/já se cadastr/i);
    expect(counter.textContent).toMatch(/3/);
  });

  it("copia o link ao clicar em Copiar", async () => {
    renderPage();
    await screen.findByDisplayValue(/ref=AB12CD34/);
    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));
    await waitFor(() =>
      expect(mocks.writeText).toHaveBeenCalledWith(expect.stringContaining("ref=AB12CD34")),
    );
  });

  it("envia o convite por e-mail e limpa o campo", async () => {
    mocks.enviarConvite.mockResolvedValueOnce({ ok: true });
    renderPage();
    await screen.findByDisplayValue(/ref=AB12CD34/);
    const emailInput = screen.getByPlaceholderText(/nome@empresa.com/i) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "amigo@email.com" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar convite/i }));
    await waitFor(() =>
      expect(mocks.enviarConvite).toHaveBeenCalledWith({ email: "amigo@email.com", token: "tok" }),
    );
    await waitFor(() => expect(emailInput.value).toBe(""));
  });
});
