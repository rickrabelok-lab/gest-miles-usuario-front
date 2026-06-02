import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useProgramasCliente } from "./useProgramasCliente";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  user: { id: "cliente-123" } as { id: string } | null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
  },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useProgramasCliente.saveProgramState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "cliente-123" };
    // Encadeamento da query de leitura: from().select().eq().order()
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    mocks.from.mockReturnValue({ select });
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("nao envia a chave morta clube_nome no payload (defeitava o guard que preserva categoria no servidor)", async () => {
    const { result } = renderHook(() => useProgramasCliente(), {
      wrapper: makeWrapper(),
    });

    await result.current.saveProgramState({
      programId: "latam",
      programName: "Latam Pass",
      state: {
        saldo: 1000,
        movimentos: [],
        custoSaldo: 0,
        custoMedioMilheiro: 0,
        lotes: [],
      },
    });

    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_programa_cliente",
      expect.objectContaining({
        p_cliente_id: "cliente-123",
        p_program_id: "latam",
        p_only_clube_nome: false,
      }),
    );

    const [, args] = mocks.rpc.mock.calls[0] as [string, { p_payload: Record<string, unknown> }];
    // A chave clube_nome presente (mesmo null) faz `v_payload ? 'clube_nome'` = true
    // na RPC, que apaga categoria/categoria_source do cliente. Nao deve ser enviada.
    expect(args.p_payload).not.toHaveProperty("clube_nome");
  });
});
