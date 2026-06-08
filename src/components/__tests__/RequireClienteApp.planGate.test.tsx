import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const authState = { role: "cliente", roleLoading: false, roleError: null, refreshRole: vi.fn(), planoAtivo: false as boolean | null };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/lib/staffAppUrls", () => ({ isClienteAppRole: (r: string) => r === "cliente" || r === "cliente_gestao", staffAppEntryUrl: () => "" }));

import RequireClienteApp from "@/components/RequireClienteApp";

describe("RequireClienteApp — gate de plano removido (acesso livre para clientes)", () => {
  beforeEach(() => { vi.clearAllMocks(); authState.role = "cliente"; authState.planoAtivo = false; });

  it("deixa passar cliente com plano ativo", () => {
    authState.planoAtivo = true;
    render(<RequireClienteApp><div>conteudo-app</div></RequireClienteApp>);
    expect(screen.getByText("conteudo-app")).toBeInTheDocument();
  });

  it("deixa passar cliente com plano inativo (free mode — RequirePaid é quem gatea)", () => {
    authState.planoAtivo = false;
    render(<RequireClienteApp><div>conteudo-app</div></RequireClienteApp>);
    expect(screen.getByText("conteudo-app")).toBeInTheDocument();
  });

  it("deixa passar enquanto planoAtivo é null (carregando)", () => {
    authState.planoAtivo = null;
    render(<RequireClienteApp><div>conteudo-app</div></RequireClienteApp>);
    expect(screen.getByText("conteudo-app")).toBeInTheDocument();
  });
});
