import { describe, it, expect } from "vitest";
import { isPaid, entitlementOf } from "@/lib/entitlement";

describe("isPaid / entitlement", () => {
  it("pago por plano_ativo", () => {
    expect(isPaid(true, null)).toBe(true);
    expect(entitlementOf(true, null)).toBe("paid");
  });

  it("pago por assinatura própria (active/trialing)", () => {
    expect(isPaid(false, "active")).toBe(true);
    expect(isPaid(false, "trialing")).toBe(true);
    expect(isPaid(null, "ACTIVE")).toBe(true);
  });

  it("free quando nenhum", () => {
    expect(isPaid(false, null)).toBe(false);
    expect(isPaid(false, "canceled")).toBe(false);
    expect(isPaid(null, "past_due")).toBe(false);
    expect(entitlementOf(false, "")).toBe("free");
  });
});

describe("isPaid — gate de period_end (janela de graça)", () => {
  const NOW = Date.parse("2026-07-13T12:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  const DIA = 24 * 60 * 60 * 1000;

  it("sem period_end (legado/B2B) não gateia — mantém comportamento antigo", () => {
    expect(isPaid(false, "active", null, NOW)).toBe(true);
    expect(isPaid(false, "active", undefined, NOW)).toBe(true);
  });

  it("period_end no futuro → pago", () => {
    expect(isPaid(false, "active", iso(NOW + 10 * DIA), NOW)).toBe(true);
  });

  it("period_end no passado além da graça (>3d) → free", () => {
    expect(isPaid(false, "active", iso(NOW - 4 * DIA), NOW)).toBe(false);
    expect(entitlementOf(false, "active", iso(NOW - 4 * DIA), NOW)).toBe("free");
  });

  it("period_end no passado dentro da graça (<3d) → ainda pago (absorve RENEWAL atrasado)", () => {
    expect(isPaid(false, "trialing", iso(NOW - 2 * DIA), NOW)).toBe(true);
  });

  it("period_end inválido não gateia (fail-open no parse)", () => {
    expect(isPaid(false, "active", "sei-lá", NOW)).toBe(true);
  });

  it("plano_ativo (B2B) ignora period_end vencido", () => {
    expect(isPaid(true, null, iso(NOW - 100 * DIA), NOW)).toBe(true);
  });

  it("status não-ativo é free independente de period_end futuro", () => {
    expect(isPaid(false, "canceled", iso(NOW + 10 * DIA), NOW)).toBe(false);
  });
});
