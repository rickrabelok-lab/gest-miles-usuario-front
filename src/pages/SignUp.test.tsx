import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  signUpWithPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
  resendConfirmation: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signUpWithPassword: mocks.signUpWithPassword,
    signInWithGoogle: mocks.signInWithGoogle,
    resendConfirmation: mocks.resendConfirmation,
  }),
}));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));

import SignUp from "./SignUp";

const renderPage = () =>
  render(
    <MemoryRouter>
      <SignUp />
    </MemoryRouter>,
  );

function fillValid() {
  fireEvent.change(screen.getByLabelText(/^E-mail$/i), { target: { value: "a@b.com" } });
  fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: "abcdef" } });
  fireEvent.change(screen.getByLabelText(/Confirmar senha/i), { target: { value: "abcdef" } });
}

describe("SignUp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloqueia 'Criar conta' até aceitar os termos", () => {
    renderPage();
    fillValid();
    const criar = screen.getByRole("button", { name: /criar conta/i }) as HTMLButtonElement;
    expect(criar.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(criar.disabled).toBe(false);
  });

  it("'Continuar com Google' fica bloqueado até aceitar os termos", () => {
    renderPage();
    const google = screen.getByRole("button", { name: /continuar com google/i }) as HTMLButtonElement;
    expect(google.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(google.disabled).toBe(false);
  });

  it("cadastro sem sessão (Confirm email ON) mostra reenviar e reenvia a confirmação", async () => {
    mocks.signUpWithPassword.mockResolvedValue(false); // sem sessão imediata
    mocks.resendConfirmation.mockResolvedValue(undefined);
    renderPage();
    fillValid();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /criar conta/i }));

    const reenviar = await screen.findByRole("button", { name: /reenviar e-mail de confirmação/i });
    fireEvent.click(reenviar);
    expect(mocks.resendConfirmation).toHaveBeenCalledWith("a@b.com");
  });
});
