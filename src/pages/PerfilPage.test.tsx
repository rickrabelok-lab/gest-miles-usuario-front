import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
