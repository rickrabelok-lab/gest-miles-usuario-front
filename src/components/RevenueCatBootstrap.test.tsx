import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureMock = vi.fn().mockResolvedValue(undefined);
const logOutMock = vi.fn().mockResolvedValue(undefined);
let available = true;
vi.mock("@/lib/revenuecat", () => ({
  isRevenueCatAvailable: () => available,
  ensureRevenueCatUser: (...args: unknown[]) => ensureMock(...args),
  logOutRevenueCat: (...args: unknown[]) => logOutMock(...args),
}));

let mockUser: { id: string } | null = null;
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mockUser }),
}));

import RevenueCatBootstrap from "./RevenueCatBootstrap";

describe("RevenueCatBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    available = true;
    mockUser = null;
  });

  it("configura o RC com o usuario_id quando há usuário", async () => {
    mockUser = { id: "user-1" };
    render(<RevenueCatBootstrap />);
    await waitFor(() => expect(ensureMock).toHaveBeenCalledWith("user-1"));
    expect(logOutMock).not.toHaveBeenCalled();
  });

  it("faz logOut quando o usuário sai", async () => {
    mockUser = { id: "user-1" };
    const { rerender } = render(<RevenueCatBootstrap />);
    await waitFor(() => expect(ensureMock).toHaveBeenCalled());
    mockUser = null;
    rerender(<RevenueCatBootstrap />);
    await waitFor(() => expect(logOutMock).toHaveBeenCalled());
  });

  it("não faz nada quando RC indisponível (web/sem key)", async () => {
    available = false;
    mockUser = { id: "user-1" };
    render(<RevenueCatBootstrap />);
    await Promise.resolve();
    expect(ensureMock).not.toHaveBeenCalled();
    expect(logOutMock).not.toHaveBeenCalled();
  });
});
