import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "c@x.com" }, signOut: vi.fn() }),
}));
vi.mock("@/hooks/useBrandingConfig", () => ({
  useBrandingConfig: () => ({ data: { brandAssets: {} } }),
}));
vi.mock("@/hooks/useBonusPromotions", () => ({
  useBonusPromotions: () => ({ promotions: [] }),
}));
vi.mock("@/components/notifications/NotificationsDropdown", () => ({
  default: () => <div data-testid="notif" />,
}));

import DashboardHeader from "./DashboardHeader";

describe("DashboardHeader — sem menu lateral", () => {
  beforeEach(() => vi.clearAllMocks());

  it("não renderiza mais o botão de abrir o menu (hambúrguer)", () => {
    render(
      <MemoryRouter>
        <DashboardHeader />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText("Abrir menu")).not.toBeInTheDocument();
  });

  it("mantém o dropdown do avatar (Menu do usuário)", () => {
    render(
      <MemoryRouter>
        <DashboardHeader />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Menu do usuário")).toBeInTheDocument();
  });
});
