import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const authState = { role: "cliente", roleLoading: false, roleError: null, refreshRole: vi.fn(), planoAtivo: true as boolean | null };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/lib/staffAppUrls", () => ({ isClienteAppRole: (r: string) => r === "cliente" || r === "cliente_gestao", staffAppEntryUrl: () => "" }));
vi.mock("@/config/features", () => ({ B2C_PLAN_GATE_ENABLED: true }));

import RequireClienteApp from "@/components/RequireClienteApp";

describe("RequireClienteApp — gate de plano (flag ON)", () => {
  beforeEach(() => { vi.clearAllMocks(); authState.role = "cliente"; authState.planoAtivo = true; });

  it("deixa passar cliente com plano ativo", () => {
    authState.planoAtivo = true;
    render(<RequireClienteApp><div>conteudo-app</div></RequireClienteApp>);
    expect(screen.getByText("conteudo-app")).toBeInTheDocument();
  });
  it("bloqueia cliente com plano inativo", () => {
    authState.planoAtivo = false;
    render(<RequireClienteApp><div>conteudo-app</div></RequireClienteApp>);
    expect(screen.queryByText("conteudo-app")).not.toBeInTheDocument();
    expect(screen.getByText(/inativo/i)).toBeInTheDocument();
  });
  it("não bloqueia enquanto planoAtivo é null (carregando)", () => {
    authState.planoAtivo = null;
    render(<RequireClienteApp><div>conteudo-app</div></RequireClienteApp>);
    expect(screen.getByText("conteudo-app")).toBeInTheDocument();
  });
});
