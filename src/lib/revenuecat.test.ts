import { afterEach, describe, expect, it } from "vitest";

import {
  annualSavingsPct,
  isRevenueCatAvailable,
  isUserCancelledError,
  mapOfferingToPaywallData,
} from "./revenuecat";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

afterEach(() => {
  delete (window as WindowWithCapacitor).Capacitor;
});

describe("annualSavingsPct", () => {
  it("calcula a economia do anual vs 12x mensal", () => {
    expect(annualSavingsPct(10, 96)).toBe(20); // 120 vs 96
  });

  it("arredonda pro inteiro mais próximo", () => {
    expect(annualSavingsPct(9.9, 99.9)).toBe(16); // 1 - 99.9/118.8 = 15.9%
  });

  it("devolve null quando não há economia real", () => {
    expect(annualSavingsPct(10, 120)).toBeNull();
    expect(annualSavingsPct(10, 130)).toBeNull();
  });

  it("devolve null pra preços inválidos", () => {
    expect(annualSavingsPct(0, 96)).toBeNull();
    expect(annualSavingsPct(10, 0)).toBeNull();
    expect(annualSavingsPct(NaN, 96)).toBeNull();
  });
});

describe("mapOfferingToPaywallData", () => {
  const pacote = (id: string, price: number, priceString: string) => ({
    identifier: id,
    product: { identifier: id, price, priceString },
  });

  it("extrai mensal + anual com selo de economia", () => {
    const data = mapOfferingToPaywallData({
      monthly: pacote("gm_plus_mensal", 10, "R$ 10,00"),
      annual: pacote("gm_plus_anual", 96, "R$ 96,00"),
    });
    expect(data?.monthly?.priceString).toBe("R$ 10,00");
    expect(data?.annual?.priceString).toBe("R$ 96,00");
    expect(data?.savingsPct).toBe(20);
  });

  it("funciona só com mensal (anual null, sem selo)", () => {
    const data = mapOfferingToPaywallData({ monthly: pacote("m", 10, "R$ 10,00"), annual: null });
    expect(data?.monthly).not.toBeNull();
    expect(data?.annual).toBeNull();
    expect(data?.savingsPct).toBeNull();
  });

  it("devolve null pra offering vazia/sem pacotes", () => {
    expect(mapOfferingToPaywallData(null)).toBeNull();
    expect(mapOfferingToPaywallData({ monthly: null, annual: null })).toBeNull();
  });
});

describe("isRevenueCatAvailable", () => {
  it("é false na web mesmo com key", () => {
    expect(isRevenueCatAvailable()).toBe(false);
  });
});

describe("isUserCancelledError", () => {
  it("reconhece os formatos de cancelamento do SDK", () => {
    expect(isUserCancelledError({ userCancelled: true })).toBe(true);
    expect(isUserCancelledError({ code: "PURCHASE_CANCELLED" })).toBe(true);
    expect(isUserCancelledError({ message: "PurchaseCancelledError: user cancelled" })).toBe(true);
    expect(isUserCancelledError(new Error("network down"))).toBe(false);
    expect(isUserCancelledError(null)).toBe(false);
  });
});
