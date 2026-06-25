import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useAccountDeletion: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/hooks/useAccountDeletion", () => ({ useAccountDeletion: mocks.useAccountDeletion }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import AccountDeletionSection from "./AccountDeletionSection";

const baseHook = { pending: null, loading: false, solicitar: vi.fn(), cancelar: vi.fn(), refresh: vi.fn() };

describe("AccountDeletionSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAccountDeletion.mockReturnValue({ ...baseHook });
  });

  it("cliente sem pendência vê o botão de excluir", () => {
    mocks.useAuth.mockReturnValue({ role: "cliente", signOut: vi.fn() });
    render(<AccountDeletionSection />);
    expect(screen.getByRole("button", { name: /excluir minha conta/i })).toBeInTheDocument();
  });

  it("cliente_gestao vê o texto alternativo (sem botão destrutivo)", () => {
    mocks.useAuth.mockReturnValue({ role: "cliente_gestao", signOut: vi.fn() });
    render(<AccountDeletionSection />);
    expect(screen.getByText(/fale com seu gestor/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /excluir minha conta/i })).not.toBeInTheDocument();
  });

  it("com pendência mostra o banner e cancela", async () => {
    const cancelar = vi.fn().mockResolvedValue(undefined);
    mocks.useAuth.mockReturnValue({ role: "cliente", signOut: vi.fn() });
    mocks.useAccountDeletion.mockReturnValue({ ...baseHook, pending: { agendado_para: "2026-07-02T00:00:00.000Z" }, cancelar });
    render(<AccountDeletionSection />);
    expect(screen.getByText(/será excluída em/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancelar exclusão/i }));
    await waitFor(() => expect(cancelar).toHaveBeenCalled());
  });

  it("confirmação exige digitar EXCLUIR antes de solicitar", async () => {
    const solicitar = vi.fn().mockResolvedValue({ status: "pendente", agendado_para: "2026-07-02T00:00:00.000Z" });
    const signOut = vi.fn().mockResolvedValue(undefined);
    mocks.useAuth.mockReturnValue({ role: "cliente", signOut });
    mocks.useAccountDeletion.mockReturnValue({ ...baseHook, solicitar });
    render(<AccountDeletionSection />);
    fireEvent.click(screen.getByRole("button", { name: /excluir minha conta/i }));
    // texto errado → não solicita
    fireEvent.change(screen.getByLabelText(/digite/i), { target: { value: "errado" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar exclusão/i }));
    expect(solicitar).not.toHaveBeenCalled();
    // texto certo → solicita + signOut
    fireEvent.change(screen.getByLabelText(/digite/i), { target: { value: "EXCLUIR" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar exclusão/i }));
    await waitFor(() => expect(solicitar).toHaveBeenCalled());
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
