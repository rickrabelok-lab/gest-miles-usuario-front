import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  signUpWithPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signUpWithPassword: mocks.signUpWithPassword,
    signInWithGoogle: mocks.signInWithGoogle,
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
});
