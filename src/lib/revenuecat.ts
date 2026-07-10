/**
 * Wrapper fino do RevenueCat (IAP das lojas). Só faz algo no app nativo com a
 * chave pública configurada; na web nada daqui importa o SDK (dynamic import).
 * Zero Trust: a compra é confirmada pelo WEBHOOK no backend (perfis); o retorno
 * daqui serve só pra UX imediata. Spec:
 * docs/superpowers/specs/2026-07-10-mobile-iap-revenuecat-design.md
 */
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";

import { isNativePlatform } from "@/lib/nativeAuth";

const RC_ANDROID_KEY = (import.meta.env.VITE_REVENUECAT_ANDROID_KEY ?? "").trim();

export type PaywallPackage = {
  id: string;
  priceString: string;
  price: number;
  raw: unknown;
};

export type PaywallData = {
  monthly: PaywallPackage | null;
  annual: PaywallPackage | null;
  savingsPct: number | null;
};

export function isRevenueCatAvailable(): boolean {
  return isNativePlatform() && RC_ANDROID_KEY.length > 0;
}

/** % de economia do plano anual vs 12x o mensal; null se não houver economia real. */
export function annualSavingsPct(monthlyPrice: number, annualPrice: number): number | null {
  if (!Number.isFinite(monthlyPrice) || !Number.isFinite(annualPrice)) return null;
  if (monthlyPrice <= 0 || annualPrice <= 0) return null;
  const pct = Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100);
  return pct > 0 && pct < 100 ? pct : null;
}

type SdkPackage = {
  identifier?: string;
  product?: { identifier?: string; price?: number; priceString?: string };
};

function toPaywallPackage(pkg: SdkPackage | null | undefined): PaywallPackage | null {
  if (!pkg?.product) return null;
  return {
    id: pkg.product.identifier ?? pkg.identifier ?? "",
    priceString: pkg.product.priceString ?? "",
    price: pkg.product.price ?? 0,
    raw: pkg,
  };
}

/** Pura (testável): offering do SDK -> dados do paywall (mensal + anual + selo). */
export function mapOfferingToPaywallData(offering: unknown): PaywallData | null {
  const off = offering as { monthly?: SdkPackage | null; annual?: SdkPackage | null } | null;
  const monthly = toPaywallPackage(off?.monthly);
  const annual = toPaywallPackage(off?.annual);
  if (!monthly && !annual) return null;
  const savingsPct = monthly && annual ? annualSavingsPct(monthly.price, annual.price) : null;
  return { monthly, annual, savingsPct };
}

export function isUserCancelledError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { userCancelled?: boolean; code?: string; message?: string };
  if (e.userCancelled === true) return true;
  const texto = `${e.code ?? ""} ${e.message ?? ""}`.toLowerCase();
  return texto.includes("cancel");
}

let configuredUserId: string | null = null;

async function sdk() {
  const { Purchases } = await import("@revenuecat/purchases-capacitor");
  return Purchases;
}

/** Configura o SDK 1x por launch com o usuario_id do Supabase; troca de usuário via logIn. */
export async function ensureRevenueCatUser(appUserID: string): Promise<void> {
  if (!isRevenueCatAvailable() || !appUserID) return;
  const Purchases = await sdk();
  if (configuredUserId === null) {
    await Purchases.configure({ apiKey: RC_ANDROID_KEY, appUserID });
    configuredUserId = appUserID;
    return;
  }
  if (configuredUserId !== appUserID) {
    await Purchases.logIn({ appUserID });
    configuredUserId = appUserID;
  }
}

export async function logOutRevenueCat(): Promise<void> {
  if (!isRevenueCatAvailable() || configuredUserId === null) return;
  try {
    const Purchases = await sdk();
    await Purchases.logOut();
    // Sentinela: SDK configurado mas sem usuário identificado — o próximo
    // ensureRevenueCatUser DEVE fazer logIn mesmo que seja o mesmo usuário
    // (sem isso a compra sairia como $RCAnonymousID e o webhook a ignoraria).
    configuredUserId = "";
  } catch {
    // logOut de usuário anônimo/não configurado não pode quebrar o sign-out do app
  }
}

export async function getPaywallOfferings(): Promise<PaywallData | null> {
  if (!isRevenueCatAvailable()) return null;
  try {
    const Purchases = await sdk();
    const { current } = await Purchases.getOfferings();
    return mapOfferingToPaywallData(current);
  } catch (err) {
    console.warn("[revenuecat] offerings:", err);
    return null;
  }
}

export async function purchase(pkg: PaywallPackage): Promise<"purchased" | "cancelled"> {
  const Purchases = await sdk();
  try {
    await Purchases.purchasePackage({ aPackage: pkg.raw as PurchasesPackage });
    return "purchased";
  } catch (err) {
    if (isUserCancelledError(err)) return "cancelled";
    throw err;
  }
}

/** true se voltou alguma entitlement ativa (o webhook confirma no perfis em seguida). */
export async function restorePurchases(): Promise<boolean> {
  const Purchases = await sdk();
  const { customerInfo } = await Purchases.restorePurchases();
  const ativas = (customerInfo as { entitlements?: { active?: Record<string, unknown> } })
    ?.entitlements?.active;
  return Boolean(ativas && Object.keys(ativas).length > 0);
}
