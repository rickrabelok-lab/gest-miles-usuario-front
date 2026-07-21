import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PerfilPage from "./PerfilPage";

const authState = { user: { id: "u1", email: "c@x.com" }, role: "cliente_gestao", signOut: vi.fn() };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));
// A busca de gestores retorna vazio (efeito no-op): .eq() é awaited direto.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }),
  },
}));
vi.mock("@/components/BottomNav", () => ({ default: () => <nav data-testid="bottomnav" /> }));

const gatherUserDataMock = vi.fn();
const deliverJsonMock = vi.fn();
vi.mock("@/services/dataExportService", () => ({
  gatherUserData: (...a: unknown[]) => gatherUserDataMock(...a),
  deliverJson: (...a: unknown[]) => deliverJsonMock(...a),
}));
vi.mock("@/lib/nativeAuth", () => ({ isNativePlatform: () => false }));
vi.mock("sonner", () => ({
  toast: { loading: vi.fn(() => "t1"), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

function renderPerfil() {
  return render(
    <MemoryRouter>
      <PerfilPage />
    </MemoryRouter>,
  );
}

describe("PerfilPage — linha Notificações (gated cliente_gestao)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "cliente_gestao";
  });

  it("cliente_gestao vê 'Notificações'", () => {
    authState.role = "cliente_gestao";
    renderPerfil();
    expect(screen.getByText("Notificações")).toBeInTheDocument();
  });

  it("cliente avulso NÃO vê 'Notificações'", () => {
    authState.role = "cliente";
    renderPerfil();
    expect(screen.queryByText("Notificações")).not.toBeInTheDocument();
  });
});

describe("PerfilPage — legal e export LGPD (ex-menu lateral)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "cliente";
    gatherUserDataMock.mockResolvedValue({ conta: {} });
    deliverJsonMock.mockResolvedValue("delivered");
  });

  it("mostra a linha 'Termos de Uso'", () => {
    renderPerfil();
    expect(screen.getByText("Termos de Uso")).toBeInTheDocument();
  });

  it("'Baixar meus dados' dispara o export (gather + deliver)", async () => {
    renderPerfil();
    fireEvent.click(screen.getByText("Baixar meus dados"));
    await waitFor(() => expect(deliverJsonMock).toHaveBeenCalledTimes(1));
    expect(gatherUserDataMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ id: "u1", email: "c@x.com" }),
    );
  });
});
