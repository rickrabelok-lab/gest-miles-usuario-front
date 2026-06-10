import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));

import { supabase } from "@/lib/supabase";
import { useMinhaEconomia } from "@/hooks/useMinhaEconomia";

const rpcMock = supabase.rpc as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useMinhaEconomia", () => {
  it("busca o relatório do próprio cliente via get_relatorio_economia", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { kpis: { economiaEmissoes: 1266.32 }, eventos: [], caseDestaque: null },
      error: null,
    });
    const { result } = renderHook(() => useMinhaEconomia());
    await act(async () => {
      await result.current.fetchRelatorio("user-1", "2026-01-01", null);
    });
    expect(rpcMock).toHaveBeenCalledWith("get_relatorio_economia", {
      p_cliente_id: "user-1",
      p_inicio: "2026-01-01",
      p_fim: null,
    });
    expect(result.current.data?.kpis.economiaTotal).toBe(1266.32);
    expect(result.current.error).toBeNull();
  });

  it("erro do RPC vira mensagem amigável", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => useMinhaEconomia());
    await act(async () => {
      await result.current.fetchRelatorio("user-1", null, null);
    });
    expect(result.current.error).toMatch(/não foi possível/i);
    expect(result.current.data).toBeNull();
  });
});
