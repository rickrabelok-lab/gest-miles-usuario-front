import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = { isPaid: true, loading: false, entitlement: "paid" as const };
vi.mock("@/hooks/useEntitlement", () => ({ useEntitlement: () => state }));
vi.mock("@/config/features", () => ({ B2C_PLAN_GATE_ENABLED: true }));

import RequirePaid from "@/components/RequirePaid";

describe("RequirePaid (flag ON)", () => {
  it("pago vê o conteúdo", () => {
    state.isPaid = true;
    state.loading = false;
    render(<RequirePaid><div>premium</div></RequirePaid>);
    expect(screen.getByText("premium")).toBeInTheDocument();
  });

  it("free vê upsell (não o conteúdo)", () => {
    state.isPaid = false;
    state.loading = false;
    render(
      <MemoryRouter>
        <RequirePaid><div>premium</div></RequirePaid>
      </MemoryRouter>
    );
    expect(screen.queryByText("premium")).not.toBeInTheDocument();
    expect(screen.getAllByText(/plano completo/i).length).toBeGreaterThan(0);
  });

  it("não bloqueia enquanto carrega", () => {
    state.isPaid = false;
    state.loading = true;
    render(<RequirePaid><div>premium</div></RequirePaid>);
    expect(screen.getByText("premium")).toBeInTheDocument();
  });
});
