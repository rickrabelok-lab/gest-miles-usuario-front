# IAP via RevenueCat no app Android — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assinatura B2C via Google Play (RevenueCat) no app Capacitor — paywall mensal+anual, entitlement escrito pelo webhook no BFF (Zero Trust), Stripe escondido no nativo, tudo com degradação graciosa (mergeia antes das contas Play/RC existirem).

**Architecture:** Wrapper fino sobre `@revenuecat/purchases-capacitor` (dynamic import; nada de RC no caminho web) + componente de ciclo de vida atado ao login (`appUserID` = `user.id` Supabase) + tela `AssinaturaAppScreen` (nativo) atrás de um `AssinaturaRoute` que bifurca por plataforma + rota `/api/revenuecat/webhook` no Express com mapeamento puro evento→patch de `perfis` (testável sem DB, padrão do backend).

**Tech Stack:** React 18 + Vite, Capacitor 8 (`@revenuecat/purchases-capacitor` — novo), Express 4 (`node --test` p/ testes), Supabase service role, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-10-mobile-iap-revenuecat-design.md`

## Global Constraints

- Branch: `feat/mobile-iap-revenuecat` (já criada; spec commitada).
- Web 100% inalterada: `/assinatura` na web continua `AssinaturaClientePage` (Stripe); nenhum import de RC entra no caminho web (só dynamic import atrás de guard nativo).
- Entitlement: fonte da verdade continua `perfis` via `useEntitlement` (`active`/`trialing` liberam). O webhook escreve; o app só lê.
- **NUNCA aplicar a migration** (`subscription_provider`) — banco compartilhado; ela entra no repo e é aplicada no rollout com OK explícito do owner.
- Webhook NUNCA toca `stripe_*` nem `plano_ativo`; caminho B2B (equipes) intocado.
- Env: `VITE_REVENUECAT_ANDROID_KEY` (chave PÚBLICA do SDK, pode ir no bundle) e `REVENUECAT_WEBHOOK_SECRET` (só backend). Sem a key → app funciona normal, tela mostra "em breve".
- `vite build` NÃO type-checka; gates reais: `npx tsc -b` + `npm test` (front) + `cd backend; npm test` (node --test) + `npm run lint`.
- Copy de UI e testes em PT-BR; commits PT-BR com escopo + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (here-string PowerShell, `'@` na coluna 0).
- NUNCA commitar ruído pré-existente: `.claude/settings.local.json`, `CLAUDE.md`, `backend/.gitignore`.
- Build Android: `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`, `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`; exigir `BUILD SUCCESSFUL` antes de `adb install`; adb via caminho completo `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"`.
- Shell: Windows PowerShell 5.1 (sem `&&`; usar `;` ou chamadas separadas).

---

### Task 1: Instalar `@revenuecat/purchases-capacitor` + sync

**Files:**
- Modify: `package.json` / `package-lock.json` (via npm install)
- Modify (regenerados): `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`

**Interfaces:**
- Produces: módulo `@revenuecat/purchases-capacitor` importável (Tasks 4–6 fazem `import("@revenuecat/purchases-capacitor")`); plugin registrado no projeto Android.

- [ ] **Step 1: Instalar**

```powershell
npm install @revenuecat/purchases-capacitor
```

Conferir no `package.json` a versão instalada e que o peer `@capacitor/core` dela é compatível com `^8.x` (checar `npm ls @capacitor/core` sem erro de peer). Se houver conflito de peer, instalar a major do plugin compatível com Capacitor 8 (ver `npm view @revenuecat/purchases-capacitor peerDependencies` por versão).

- [ ] **Step 2: Sync**

```powershell
npm run mobile:sync
```

Expected: `cap sync android` lista **3** plugins (`@capacitor/app`, `@capacitor/browser`, `@revenuecat/purchases-capacitor`), sem erro.

- [ ] **Step 3: Conferir API do SDK instalado**

Ler `node_modules/@revenuecat/purchases-capacitor/dist/esm/definitions.d.ts` e CONFIRMAR os nomes usados nas Tasks 4–6: `Purchases.configure({ apiKey, appUserID })`, `Purchases.logIn({ appUserID })`, `Purchases.logOut()`, `Purchases.getOfferings()` (retorna `{ current }` com atalhos `monthly`/`annual` no offering), `Purchases.purchasePackage({ aPackage })`, `Purchases.restorePurchases()`, `customerInfo.entitlements.active`. Se algum nome divergir na versão instalada, anotar a assinatura real no report — as Tasks 4–6 usam o que você anotar.

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json android/app/capacitor.build.gradle android/capacitor.settings.gradle
git commit -m @'
feat(mobile): plugin @revenuecat/purchases-capacitor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 2: Backend — helpers puros do webhook (TDD, node --test)

**Files:**
- Create: `backend/src/lib/revenuecatHelpers.js`
- Test: `backend/src/lib/revenuecatHelpers.test.js`

**Interfaces:**
- Produces (Task 3 consome):
  - `mapRevenueCatEvent(event, nowMs)` → `{ action: "skip", reason: string }` OU `{ action: "update", usuarioId: string, patch: { subscription_status, subscription_plan_slug, subscription_current_period_end, subscription_provider } }`
  - `isUuid(value): boolean`
  - `webhookAuthOk(headerValue, secret): boolean` (comparação constante-time)

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `backend/src/lib/revenuecatHelpers.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isUuid, mapRevenueCatEvent, webhookAuthOk } from "./revenuecatHelpers.js";

const NOW = 1_800_000_000_000; // fixo p/ determinismo
const FUTURO = NOW + 30 * 24 * 60 * 60 * 1000;
const PASSADO = NOW - 1000;
const UID = "3bac3bf0-2e66-4161-bc91-e107e443e8ba";

const evento = (extra) => ({
  type: "INITIAL_PURCHASE",
  app_user_id: UID,
  product_id: "gm_plus_mensal",
  expiration_at_ms: FUTURO,
  period_type: "NORMAL",
  store: "PLAY_STORE",
  ...extra,
});

test("compra inicial com expiração futura vira active", () => {
  const r = mapRevenueCatEvent(evento(), NOW);
  assert.equal(r.action, "update");
  assert.equal(r.usuarioId, UID);
  assert.equal(r.patch.subscription_status, "active");
  assert.equal(r.patch.subscription_plan_slug, "gm_plus_mensal");
  assert.equal(r.patch.subscription_provider, "play");
  assert.equal(r.patch.subscription_current_period_end, new Date(FUTURO).toISOString());
});

test("period_type TRIAL vira trialing", () => {
  const r = mapRevenueCatEvent(evento({ period_type: "TRIAL" }), NOW);
  assert.equal(r.patch.subscription_status, "trialing");
});

test("CANCELLATION com expiração futura mantém active (acesso até expirar)", () => {
  const r = mapRevenueCatEvent(evento({ type: "CANCELLATION" }), NOW);
  assert.equal(r.patch.subscription_status, "active");
});

test("BILLING_ISSUE com expiração futura mantém active (grace da loja)", () => {
  const r = mapRevenueCatEvent(evento({ type: "BILLING_ISSUE" }), NOW);
  assert.equal(r.patch.subscription_status, "active");
});

test("expiração no passado vira canceled", () => {
  const r = mapRevenueCatEvent(evento({ expiration_at_ms: PASSADO }), NOW);
  assert.equal(r.patch.subscription_status, "canceled");
});

test("EXPIRATION vira canceled mesmo com timestamp estranho", () => {
  const r = mapRevenueCatEvent(evento({ type: "EXPIRATION", expiration_at_ms: FUTURO }), NOW);
  assert.equal(r.patch.subscription_status, "canceled");
});

test("store APP_STORE vira provider apple", () => {
  const r = mapRevenueCatEvent(evento({ store: "APP_STORE" }), NOW);
  assert.equal(r.patch.subscription_provider, "apple");
});

test("app_user_id anônimo do RC é ignorado", () => {
  const r = mapRevenueCatEvent(evento({ app_user_id: "$RCAnonymousID:abc123" }), NOW);
  assert.equal(r.action, "skip");
});

test("eventos TEST e TRANSFER são ignorados", () => {
  assert.equal(mapRevenueCatEvent(evento({ type: "TEST" }), NOW).action, "skip");
  assert.equal(mapRevenueCatEvent(evento({ type: "TRANSFER" }), NOW).action, "skip");
});

test("payload sem event é ignorado", () => {
  assert.equal(mapRevenueCatEvent(null, NOW).action, "skip");
  assert.equal(mapRevenueCatEvent(undefined, NOW).action, "skip");
});

test("sem expiration_at_ms numérico vira canceled (não dá acesso de graça)", () => {
  const r = mapRevenueCatEvent(evento({ expiration_at_ms: undefined }), NOW);
  assert.equal(r.patch.subscription_status, "canceled");
});

test("isUuid aceita uuid e rejeita lixo", () => {
  assert.equal(isUuid(UID), true);
  assert.equal(isUuid("$RCAnonymousID:x"), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid(null), false);
});

test("webhookAuthOk compara certo e nega vazios", () => {
  assert.equal(webhookAuthOk("segredo-x", "segredo-x"), true);
  assert.equal(webhookAuthOk("segredo-errado", "segredo-x"), false);
  assert.equal(webhookAuthOk(undefined, "segredo-x"), false);
  assert.equal(webhookAuthOk("segredo-x", undefined), false);
  assert.equal(webhookAuthOk("", ""), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
Set-Location backend; node --test src/lib/revenuecatHelpers.test.js; Set-Location ..
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/lib/revenuecatHelpers.js`**

```js
import crypto from "node:crypto";

/** Eventos que geram escrita no perfis; o resto é ignorado com 200 (RC retenta em não-2xx). */
const UPDATE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "BILLING_ISSUE",
  "CANCELLATION",
  "EXPIRATION",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Comparação constante-time do header Authorization com o secret (hash iguala tamanhos). */
export function webhookAuthOk(headerValue, secret) {
  if (!headerValue || !secret) return false;
  const a = crypto.createHash("sha256").update(String(headerValue)).digest();
  const b = crypto.createHash("sha256").update(String(secret)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Mapeia um evento de webhook do RevenueCat pro patch de `perfis`.
 * Regra dirigida por expiração: acesso enquanto `expiration_at_ms` no futuro
 * (cobre CANCELLATION que mantém acesso e BILLING_ISSUE em grace); EXPIRATION
 * corta. Nunca toca stripe_* nem plano_ativo — isso é decisão do caller também.
 */
export function mapRevenueCatEvent(event, nowMs) {
  if (!event || typeof event !== "object") return { action: "skip", reason: "payload sem event" };
  const type = event.type;
  if (!UPDATE_EVENTS.has(type)) {
    return { action: "skip", reason: `evento ${type ?? "desconhecido"} ignorado` };
  }
  if (!isUuid(event.app_user_id)) {
    return { action: "skip", reason: "app_user_id não é usuario_id (anônimo/inválido)" };
  }

  const expMs = typeof event.expiration_at_ms === "number" ? event.expiration_at_ms : null;
  const ativo = type !== "EXPIRATION" && expMs !== null && expMs > nowMs;
  const status = ativo ? (event.period_type === "TRIAL" ? "trialing" : "active") : "canceled";

  return {
    action: "update",
    usuarioId: event.app_user_id,
    patch: {
      subscription_status: status,
      subscription_plan_slug: event.product_id ?? null,
      subscription_current_period_end: expMs !== null ? new Date(expMs).toISOString() : null,
      subscription_provider: event.store === "APP_STORE" ? "apple" : "play",
    },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
Set-Location backend; node --test src/lib/revenuecatHelpers.test.js; Set-Location ..
```

Expected: PASS (13 testes).

- [ ] **Step 5: Commit**

```powershell
git add backend/src/lib/revenuecatHelpers.js backend/src/lib/revenuecatHelpers.test.js
git commit -m @'
feat(backend): mapeamento puro de eventos RevenueCat -> patch de perfis (TDD)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 3: Backend — rota `/api/revenuecat/webhook` + mount

**Files:**
- Create: `backend/src/routes/revenuecatWebhook.js`
- Modify: `backend/src/index.js` (import + `routes.use`)

**Interfaces:**
- Consumes: `mapRevenueCatEvent`, `webhookAuthOk` (Task 2); `assertSupabaseService()` de `backend/src/lib/supabaseService.js` (existente).
- Produces: `POST /api/revenuecat/webhook` — 503 sem `REVENUECAT_WEBHOOK_SECRET`; 401 header errado; 200 `{received:true, skipped}` p/ eventos ignorados; 200 `{received:true}` após update; 500 em erro de DB (RC retenta).

- [ ] **Step 1: Criar `backend/src/routes/revenuecatWebhook.js`**

```js
import express from "express";

import { assertSupabaseService } from "../lib/supabaseService.js";
import { mapRevenueCatEvent, webhookAuthOk } from "../lib/revenuecatHelpers.js";

const router = express.Router();

/**
 * Webhook do RevenueCat (config no dashboard RC: URL + valor do header
 * Authorization = REVENUECAT_WEBHOOK_SECRET, verbatim). JSON normal — a auth
 * é por header, não por assinatura do raw body como o Stripe.
 * Escreve APENAS as colunas de assinatura B2C do perfis; stripe_* e
 * plano_ativo (B2B) ficam intocados.
 */
router.post("/webhook", async (req, res) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "REVENUECAT_WEBHOOK_SECRET não configurada." });
  }
  if (!webhookAuthOk(req.headers.authorization, secret)) {
    return res.status(401).json({ error: "Não autorizado." });
  }

  const result = mapRevenueCatEvent(req.body?.event, Date.now());
  if (result.action === "skip") {
    console.log("[revenuecat] evento ignorado:", result.reason);
    return res.json({ received: true, skipped: result.reason });
  }

  try {
    const sb = assertSupabaseService();
    const { error } = await sb
      .from("perfis")
      .update(result.patch)
      .eq("usuario_id", result.usuarioId);
    if (error) throw error;
    return res.json({ received: true });
  } catch (e) {
    console.error("RevenueCat webhook:", e);
    return res.status(500).json({ error: "Webhook handler error" });
  }
});

export default router;
```

- [ ] **Step 2: Montar no `backend/src/index.js`**

Ler o arquivo inteiro primeiro. Adicionar o import junto dos outros imports de rotas:

```js
import revenuecatWebhookRoutes from "./routes/revenuecatWebhook.js";
```

E na lista de `routes.use(...)`, logo após a linha do `/api/stripe` (linha ~93):

```js
routes.use("/api/revenuecat", revenuecatWebhookRoutes);
```

(Fica DEPOIS do `express.json()` — correto: o RC manda JSON e a auth é por header; só o webhook do Stripe precisa de raw body.)

- [ ] **Step 3: Rodar a suíte do backend inteira**

```powershell
Set-Location backend; npm test; Set-Location ..
```

Expected: PASS — todos os testes (existentes + 13 da Task 2), zero falha.

- [ ] **Step 4: Commit**

```powershell
git add backend/src/routes/revenuecatWebhook.js backend/src/index.js
git commit -m @'
feat(backend): webhook do RevenueCat atualiza assinatura B2C no perfis (Zero Trust)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 4: Front — wrapper `src/lib/revenuecat.ts` (TDD nas partes puras)

**Files:**
- Create: `src/lib/revenuecat.ts`
- Test: `src/lib/revenuecat.test.ts`

**Interfaces:**
- Consumes: `isNativePlatform()` de `@/lib/nativeAuth` (existente); `@revenuecat/purchases-capacitor` via dynamic import (Task 1).
- Produces (Tasks 5–6 consomem):
  - `isRevenueCatAvailable(): boolean`
  - `ensureRevenueCatUser(appUserID: string): Promise<void>`
  - `logOutRevenueCat(): Promise<void>`
  - `type PaywallPackage = { id: string; priceString: string; price: number; raw: unknown }`
  - `type PaywallData = { monthly: PaywallPackage | null; annual: PaywallPackage | null; savingsPct: number | null }`
  - `getPaywallOfferings(): Promise<PaywallData | null>`
  - `purchase(pkg: PaywallPackage): Promise<"purchased" | "cancelled">` (lança em erro real)
  - `restorePurchases(): Promise<boolean>`
  - Puras (exportadas p/ teste): `annualSavingsPct(monthlyPrice: number, annualPrice: number): number | null`, `mapOfferingToPaywallData(offering: unknown): PaywallData | null`, `isUserCancelledError(err: unknown): boolean`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/lib/revenuecat.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npx vitest run src/lib/revenuecat.test.ts
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/revenuecat.ts`**

(⚠️ conferir contra o report da Task 1 — se a API real do SDK divergir dos nomes abaixo, seguir a API real e anotar no report.)

```ts
/**
 * Wrapper fino do RevenueCat (IAP das lojas). Só faz algo no app nativo com a
 * chave pública configurada; na web nada daqui importa o SDK (dynamic import).
 * Zero Trust: a compra é confirmada pelo WEBHOOK no backend (perfis); o retorno
 * daqui serve só pra UX imediata. Spec:
 * docs/superpowers/specs/2026-07-10-mobile-iap-revenuecat-design.md
 */
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
    await Purchases.purchasePackage({ aPackage: pkg.raw });
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
```

- [ ] **Step 4: Rodar e ver passar + tsc**

```powershell
npx vitest run src/lib/revenuecat.test.ts
npx tsc -b
```

Expected: PASS (9 testes) e tsc limpo.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/revenuecat.ts src/lib/revenuecat.test.ts
git commit -m @'
feat(mobile): wrapper do SDK RevenueCat com partes puras testadas

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 5: `RevenueCatBootstrap` + wire no App.tsx (TDD)

**Files:**
- Create: `src/components/RevenueCatBootstrap.tsx`
- Modify: `src/App.tsx` (import + render ao lado do `NativeAuthDeepLinkHandler`)
- Test: `src/components/RevenueCatBootstrap.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (existente — campo `user`); `isRevenueCatAvailable`, `ensureRevenueCatUser`, `logOutRevenueCat` (Task 4).
- Produces: componente default-export sem UI que ata o ciclo de vida do RC ao login.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/components/RevenueCatBootstrap.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npx vitest run src/components/RevenueCatBootstrap.test.tsx
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/components/RevenueCatBootstrap.tsx`**

```tsx
import { useEffect, useRef } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { ensureRevenueCatUser, isRevenueCatAvailable, logOutRevenueCat } from "@/lib/revenuecat";

/**
 * Ata o ciclo de vida do RevenueCat ao login: appUserID = user.id do Supabase
 * (é o elo compra -> perfis usado pelo webhook). Sem UI; no web/sem key é no-op.
 */
const RevenueCatBootstrap = () => {
  const { user } = useAuth();
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isRevenueCatAvailable()) return;
    const userId = user?.id ?? null;
    if (userId === lastUserIdRef.current) return;
    lastUserIdRef.current = userId;

    if (userId) {
      void ensureRevenueCatUser(userId).catch((err) =>
        console.warn("[RevenueCatBootstrap] configure:", err),
      );
    } else {
      void logOutRevenueCat();
    }
  }, [user?.id]);

  return null;
};

export default RevenueCatBootstrap;
```

- [ ] **Step 4: Wire no `src/App.tsx`**

Adicionar o import:

```tsx
import RevenueCatBootstrap from "@/components/RevenueCatBootstrap";
```

E renderizar logo abaixo do `<NativeAuthDeepLinkHandler />` (dentro do `BrowserRouter`):

```tsx
          <BrowserRouter>
            <NativeAuthDeepLinkHandler />
            <RevenueCatBootstrap />
```

- [ ] **Step 5: Rodar testes + suíte + tsc**

```powershell
npx vitest run src/components/RevenueCatBootstrap.test.tsx
npm test
npx tsc -b
```

Expected: 3 novos PASS; suíte inteira verde; tsc limpo.

- [ ] **Step 6: Commit**

```powershell
git add src/components/RevenueCatBootstrap.tsx src/components/RevenueCatBootstrap.test.tsx src/App.tsx
git commit -m @'
feat(mobile): ciclo de vida do RevenueCat atado ao login (appUserID = usuario_id)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 6: `AssinaturaAppScreen` — paywall/gestão nativa (TDD)

**Files:**
- Create: `src/pages/AssinaturaAppScreen.tsx`
- Test: `src/pages/AssinaturaAppScreen.test.tsx`

**Interfaces:**
- Consumes: `getPaywallOfferings`, `isRevenueCatAvailable`, `purchase`, `restorePurchases`, tipos (Task 4); `useAuth().refreshRole`; `useEntitlement()`; `toast` (sonner); `Button` (shadcn); `@capacitor/browser` (dynamic) p/ "Gerenciar assinatura".
- Produces: página default-export usada pelo `AssinaturaRoute` (Task 7).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/pages/AssinaturaAppScreen.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

let available = true;
let paywallData: unknown = null;
const purchaseMock = vi.fn();
const restoreMock = vi.fn();
vi.mock("@/lib/revenuecat", () => ({
  isRevenueCatAvailable: () => available,
  getPaywallOfferings: vi.fn(async () => paywallData),
  purchase: (...args: unknown[]) => purchaseMock(...args),
  restorePurchases: (...args: unknown[]) => restoreMock(...args),
}));

const refreshRoleMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ refreshRole: refreshRoleMock }),
}));

let paid = false;
vi.mock("@/hooks/useEntitlement", () => ({
  useEntitlement: () => ({ isPaid: paid, loading: false, entitlement: paid ? "paid" : "free" }),
}));

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

import AssinaturaAppScreen from "./AssinaturaAppScreen";

const PAYWALL = {
  monthly: { id: "gm_plus_mensal", priceString: "R$ 10,00", price: 10, raw: {} },
  annual: { id: "gm_plus_anual", priceString: "R$ 96,00", price: 96, raw: {} },
  savingsPct: 20,
};

const renderScreen = () =>
  render(
    <MemoryRouter>
      <AssinaturaAppScreen />
    </MemoryRouter>,
  );

describe("AssinaturaAppScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    available = true;
    paywallData = PAYWALL;
    paid = false;
    purchaseMock.mockResolvedValue("purchased");
  });

  it("mostra 'em breve' quando o RC está indisponível", async () => {
    available = false;
    renderScreen();
    expect(await screen.findByText(/em breve/i)).toBeInTheDocument();
  });

  it("renderiza mensal + anual com preços da loja e selo de economia", async () => {
    renderScreen();
    expect(await screen.findByText("R$ 10,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 96,00")).toBeInTheDocument();
    expect(screen.getByText(/economize 20%/i)).toBeInTheDocument();
  });

  it("compra: chama purchase e confirma com toast + refresh do entitlement", async () => {
    renderScreen();
    const botoes = await screen.findAllByRole("button", { name: /assinar/i });
    await userEvent.click(botoes[0]);
    await waitFor(() => expect(purchaseMock).toHaveBeenCalled());
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalled());
    expect(refreshRoleMock).toHaveBeenCalled();
  });

  it("compra cancelada pelo usuário é silenciosa (sem toast de erro)", async () => {
    purchaseMock.mockResolvedValue("cancelled");
    renderScreen();
    const botoes = await screen.findAllByRole("button", { name: /assinar/i });
    await userEvent.click(botoes[0]);
    await waitFor(() => expect(purchaseMock).toHaveBeenCalled());
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("já assinante vê gestão em vez do paywall", async () => {
    paid = true;
    renderScreen();
    expect(await screen.findByRole("button", { name: /gerenciar assinatura/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^assinar/i })).not.toBeInTheDocument();
  });

  it("restaurar compras com sucesso refaz o entitlement", async () => {
    restoreMock.mockResolvedValue(true);
    renderScreen();
    const btn = await screen.findByRole("button", { name: /restaurar compras/i });
    await userEvent.click(btn);
    await waitFor(() => expect(restoreMock).toHaveBeenCalled());
    expect(refreshRoleMock).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npx vitest run src/pages/AssinaturaAppScreen.test.tsx
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/pages/AssinaturaAppScreen.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BadgePercent, Check, Crown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlement } from "@/hooks/useEntitlement";
import {
  getPaywallOfferings,
  isRevenueCatAvailable,
  purchase,
  restorePurchases,
  type PaywallData,
  type PaywallPackage,
} from "@/lib/revenuecat";

/** Recursos liberados no plano pago (mesmos gates RequirePaid do app). */
const RECURSOS_PLUS = [
  "Calendário de preços por milheiro",
  "Ofertas de bônus de transferência",
  "Simulador de compra de milhas",
  "Radar de oportunidades personalizado",
];

const MANAGE_URL = "https://play.google.com/store/account/subscriptions";

/** Assinatura via loja (Google Play) — só renderizada no app nativo (AssinaturaRoute). */
export default function AssinaturaAppScreen() {
  const navigate = useNavigate();
  const { refreshRole } = useAuth();
  const { isPaid } = useEntitlement();
  const [paywall, setPaywall] = useState<PaywallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const isPaidRef = useRef(isPaid);
  isPaidRef.current = isPaid;

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const data = isRevenueCatAvailable() ? await getPaywallOfferings() : null;
      if (mounted) {
        setPaywall(data);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // O webhook (fonte da verdade) aterrissa em segundos; re-lê o perfil até virar.
  const refreshEntitlementWithRetry = useCallback(async () => {
    for (let i = 0; i < 5; i++) {
      await refreshRole();
      if (isPaidRef.current) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }, [refreshRole]);

  const handlePurchase = async (pkg: PaywallPackage) => {
    setBusy(pkg.id);
    try {
      const outcome = await purchase(pkg);
      if (outcome === "cancelled") return;
      toast.success("Assinatura ativada! Bem-vindo ao plano completo.");
      await refreshEntitlementWithRetry();
      navigate(-1);
    } catch (err) {
      console.warn("[AssinaturaApp] compra:", err);
      toast.error("Não foi possível concluir a compra. Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    setBusy("restore");
    try {
      const restored = await restorePurchases();
      if (restored) {
        toast.success("Assinatura restaurada.");
        await refreshEntitlementWithRetry();
      } else {
        toast.error("Nenhuma assinatura encontrada nesta conta da loja.");
      }
    } catch (err) {
      console.warn("[AssinaturaApp] restore:", err);
      toast.error("Não foi possível restaurar. Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  const openManage = async () => {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: MANAGE_URL });
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-nubank-bg px-4 pb-10 pt-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-nubank-text-secondary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar
      </button>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nubank-primary/10">
          <Crown className="h-5 w-5 text-nubank-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold text-nubank-text">Plano completo</h1>
          <p className="text-sm text-nubank-text-secondary">Assinatura via Google Play</p>
        </div>
      </div>

      <ul className="mb-6 space-y-2">
        {RECURSOS_PLUS.map((r) => (
          <li key={r} className="flex items-start gap-2 text-sm text-nubank-text">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-nubank-primary" aria-hidden="true" />
            {r}
          </li>
        ))}
      </ul>

      {isPaid ? (
        <div className="rounded-2xl border bg-white p-5 dark:bg-card">
          <p className="font-medium text-nubank-text">Sua assinatura está ativa. 🎉</p>
          <p className="mt-1 text-sm text-nubank-text-secondary">
            Renovação, troca de plano e cancelamento são feitos na loja.
          </p>
          <Button className="mt-4 w-full" onClick={() => void openManage()}>
            Gerenciar assinatura
          </Button>
        </div>
      ) : loading ? (
        <div className="rounded-2xl border bg-white p-5 text-sm text-nubank-text-secondary dark:bg-card">
          Carregando planos…
        </div>
      ) : !paywall ? (
        <div className="rounded-2xl border bg-white p-5 dark:bg-card">
          <p className="font-medium text-nubank-text">Assinatura em breve</p>
          <p className="mt-1 text-sm text-nubank-text-secondary">
            Estamos finalizando a publicação na loja. Volte em breve.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {paywall.monthly && (
            <div className="flex flex-col rounded-2xl border bg-white p-4 dark:bg-card">
              <p className="text-sm font-medium text-nubank-text-secondary">Mensal</p>
              <p className="mt-1 text-lg font-semibold text-nubank-text">
                {paywall.monthly.priceString}
              </p>
              <p className="text-xs text-nubank-text-secondary">por mês</p>
              <Button
                className="mt-4"
                disabled={busy !== null}
                onClick={() => void handlePurchase(paywall.monthly!)}
              >
                {busy === paywall.monthly.id ? "Abrindo…" : "Assinar mensal"}
              </Button>
            </div>
          )}
          {paywall.annual && (
            <div className="relative flex flex-col rounded-2xl border-2 border-nubank-primary bg-white p-4 dark:bg-card">
              {paywall.savingsPct !== null && (
                <span className="absolute -top-3 right-3 inline-flex items-center gap-1 rounded-full bg-nubank-primary px-2 py-0.5 text-xs font-medium text-white">
                  <BadgePercent className="h-3 w-3" aria-hidden="true" />
                  Economize {paywall.savingsPct}%
                </span>
              )}
              <p className="text-sm font-medium text-nubank-text-secondary">Anual</p>
              <p className="mt-1 text-lg font-semibold text-nubank-text">
                {paywall.annual.priceString}
              </p>
              <p className="text-xs text-nubank-text-secondary">por ano</p>
              <Button
                className="mt-4"
                disabled={busy !== null}
                onClick={() => void handlePurchase(paywall.annual!)}
              >
                {busy === paywall.annual.id ? "Abrindo…" : "Assinar anual"}
              </Button>
            </div>
          )}
        </div>
      )}

      {!isPaid && (
        <Button
          variant="ghost"
          className="mt-4 w-full text-nubank-text-secondary"
          disabled={busy !== null}
          onClick={() => void handleRestore()}
        >
          {busy === "restore" ? "Restaurando…" : "Restaurar compras"}
        </Button>
      )}

      <p className="mt-6 text-center text-xs text-nubank-text-secondary">
        Ao assinar você concorda com os{" "}
        <a href="/termos" className="underline">Termos de Uso</a> e a{" "}
        <a href="/privacidade" className="underline">Política de Privacidade</a>.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar + suíte + tsc**

```powershell
npx vitest run src/pages/AssinaturaAppScreen.test.tsx
npm test
npx tsc -b
```

Expected: 6 novos PASS; suíte inteira verde; tsc limpo.

- [ ] **Step 5: Commit**

```powershell
git add src/pages/AssinaturaAppScreen.tsx src/pages/AssinaturaAppScreen.test.tsx
git commit -m @'
feat(mobile): paywall/gestao de assinatura via loja (mensal + anual com selo de economia)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 7: `AssinaturaRoute` (bifurcação por plataforma) + CTA no `PlanoInativoScreen`

**Files:**
- Create: `src/pages/AssinaturaRoute.tsx`
- Modify: `src/App.tsx` (rota `/assinatura` usa o wrapper)
- Modify: `src/components/PlanoInativoScreen.tsx` (CTA "Ver planos" só no nativo)
- Test: `src/pages/AssinaturaRoute.test.tsx`, `src/components/PlanoInativoScreen.test.tsx`

**Interfaces:**
- Consumes: `isNativePlatform()` (`@/lib/nativeAuth`); `AssinaturaAppScreen` (Task 6); `AssinaturaClientePage` (existente, intocada).
- Produces: rota `/assinatura` bifurcada; upsell com CTA no app.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/pages/AssinaturaRoute.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./AssinaturaClientePage", () => ({
  default: () => <div>tela-stripe-web</div>,
}));
vi.mock("./AssinaturaAppScreen", () => ({
  default: () => <div>tela-loja-nativa</div>,
}));

import AssinaturaRoute from "./AssinaturaRoute";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

// AssinaturaRoute usa React.lazy — precisa de um Suspense boundary (no app real,
// o Suspense do App.tsx cobre; aqui provemos um).
const renderRoute = () =>
  render(
    <MemoryRouter>
      <Suspense fallback={null}>
        <AssinaturaRoute />
      </Suspense>
    </MemoryRouter>,
  );

describe("AssinaturaRoute", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete (window as WindowWithCapacitor).Capacitor;
  });

  it("na web renderiza a página Stripe (inalterada)", async () => {
    renderRoute();
    expect(await screen.findByText("tela-stripe-web")).toBeInTheDocument();
  });

  it("no nativo renderiza a tela da loja", async () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    renderRoute();
    expect(await screen.findByText("tela-loja-nativa")).toBeInTheDocument();
  });
});
```

Criar `src/components/PlanoInativoScreen.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlanoInativoScreen from "./PlanoInativoScreen";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

const renderScreen = () =>
  render(
    <MemoryRouter>
      <PlanoInativoScreen />
    </MemoryRouter>,
  );

describe("PlanoInativoScreen", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    delete (window as WindowWithCapacitor).Capacitor;
  });

  it("na web mantém o texto atual sem CTA de compra", () => {
    renderScreen();
    expect(screen.getByText(/fale com a sua agência/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ver planos/i })).not.toBeInTheDocument();
  });

  it("no nativo mostra o CTA Ver planos", () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    renderScreen();
    expect(screen.getByRole("button", { name: /ver planos/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npx vitest run src/pages/AssinaturaRoute.test.tsx src/components/PlanoInativoScreen.test.tsx
```

Expected: FAIL — `AssinaturaRoute` não existe; `PlanoInativoScreen` sem CTA no nativo.

- [ ] **Step 3: Implementar**

Criar `src/pages/AssinaturaRoute.tsx`:

```tsx
import { lazy } from "react";

import { isNativePlatform } from "@/lib/nativeAuth";

const AssinaturaClientePage = lazy(() => import("./AssinaturaClientePage"));
const AssinaturaAppScreen = lazy(() => import("./AssinaturaAppScreen"));

/** /assinatura por plataforma: app nativo = loja (IAP); web = Stripe (inalterada). */
const AssinaturaRoute = () =>
  isNativePlatform() ? <AssinaturaAppScreen /> : <AssinaturaClientePage />;

export default AssinaturaRoute;
```

Em `src/App.tsx`: trocar o lazy import da rota — remover `const AssinaturaClientePage = lazy(...)` e adicionar `const AssinaturaRoute = lazy(() => import("./pages/AssinaturaRoute"));`; na rota `/assinatura`, trocar `<AssinaturaClientePage />` por `<AssinaturaRoute />` (mantendo o wrapper `ClienteOnly`).

Em `src/components/PlanoInativoScreen.tsx` — substituir o arquivo por:

```tsx
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { isNativePlatform } from "@/lib/nativeAuth";

/** Tela de upsell mostrada quando um cliente free tenta um recurso do plano pago. */
export default function PlanoInativoScreen() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-lg font-semibold text-foreground">Recurso do plano completo</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Este recurso está disponível no plano completo. Fale com a sua agência para liberar o acesso.
        </p>
        {isNativePlatform() && (
          <Button className="mt-4 w-full" onClick={() => navigate("/assinatura")}>
            Ver planos
          </Button>
        )}
      </div>
    </div>
  );
}
```

⚠️ `PlanoInativoScreen` agora usa `useNavigate` — se algum teste existente renderizava telas gated sem Router, pode quebrar; rodar a suíte e corrigir só envolvendo com `MemoryRouter` onde faltar (não mudar comportamento).

- [ ] **Step 4: Rodar e ver passar + suíte + tsc**

```powershell
npx vitest run src/pages/AssinaturaRoute.test.tsx src/components/PlanoInativoScreen.test.tsx
npm test
npx tsc -b
```

Expected: 4 novos PASS; suíte inteira verde; tsc limpo.

- [ ] **Step 5: Commit**

```powershell
git add src/pages/AssinaturaRoute.tsx src/pages/AssinaturaRoute.test.tsx src/components/PlanoInativoScreen.tsx src/components/PlanoInativoScreen.test.tsx src/App.tsx
git commit -m @'
feat(mobile): /assinatura bifurca por plataforma e upsell ganha CTA Ver planos no app

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 8: Migration (NÃO aplicar) + envs + runbook

**Files:**
- Create: `supabase/migrations/20260710190000_perfis_subscription_provider.sql`
- Modify: `.env.example` (documentar `VITE_REVENUECAT_ANDROID_KEY`)
- Modify: `.env.mobile` (linha comentada da key — sem valor)
- Create: `docs/revenuecat_setup.md`

**Interfaces:**
- Produces: migration versionada (aplicação = rollout com owner); runbook completo de contas/rollout.

- [ ] **Step 1: Criar a migration**

`supabase/migrations/20260710190000_perfis_subscription_provider.sql`:

```sql
-- Origem da assinatura B2C (IAP via RevenueCat). Aditiva; coberta pelas
-- policies existentes de perfis. Aplicar SÓ no rollout do IAP (com OK do owner).
alter table public.perfis add column if not exists subscription_provider text;

comment on column public.perfis.subscription_provider is
  'Origem da assinatura B2C: play | apple (escrito pelo webhook RevenueCat no BFF). null = legado Stripe ou sem assinatura.';
```

**NÃO aplicar no banco.** Ela entra no repo e é aplicada no rollout (runbook, passo 1).

- [ ] **Step 2: Envs**

Em `.env.example`, adicionar na seção do front (ler o arquivo antes; seguir o formato existente):

```bash
# RevenueCat (IAP no app nativo) — chave PÚBLICA do SDK Android (aba API Keys do RC).
# Só usada no build mobile; sem ela a tela de assinatura do app mostra "em breve".
VITE_REVENUECAT_ANDROID_KEY=
```

Em `.env.mobile`, adicionar ao final:

```bash
# Preencher no rollout do IAP (docs/revenuecat_setup.md) e rebuildar o APK.
VITE_REVENUECAT_ANDROID_KEY=
```

(Backend: `REVENUECAT_WEBHOOK_SECRET` é env da Vercel/`backend/.env` — documentada no runbook; se existir `backend/.env.example`, adicionar a linha lá também.)

- [ ] **Step 3: Criar `docs/revenuecat_setup.md`**

```markdown
# RevenueCat / Google Play — runbook de rollout do IAP

Pré-requisito de código: PR do IAP mergeado (paywall + webhook + migration no repo).
Nada disso bloqueia deploy — sem as envs, o app mostra "Assinatura em breve" e o
webhook responde 503.

## 1. Banco (com OK do owner — projeto compartilhado)

Aplicar `supabase/migrations/20260710190000_perfis_subscription_provider.sql`
(SQL Editor ou MCP). Antes de configurar o webhook no RC.

## 2. Google Play Console (~US$25, 1x)

1. Criar conta em https://play.google.com/console (dados fiscais/bancários p/ receber).
2. Criar o app **Gest Miles** (`br.com.gestmiles.app`).
3. Gerar keystore de UPLOAD (guardar bem — perda = processo chato de reset):
   `keytool -genkey -v -keystore gestmiles-upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000`
4. Build de release assinado (AAB): `cd android; .\gradlew.bat bundleRelease` com a
   signingConfig apontando pro keystore (adicionar em `android/app/build.gradle` — a
   config de release entra num PR próprio quando chegar a hora; a trilha interna aceita
   o primeiro AAB manualmente).
5. Subir o AAB na trilha **Teste interno** + adicionar seu e-mail como testador.
6. **Monetizar → Produtos → Assinaturas**: criar `gm_plus` com 2 base plans:
   - `gm-plus-mensal` (renovação mensal) — definir preço BRL;
   - `gm-plus-anual` (renovação anual) — definir preço BRL com desconto.
7. **Configurações → Acesso à API**: criar/vincular projeto Google Cloud, criar
   service account, conceder permissões financeiras (Ver dados financeiros +
   Gerenciar pedidos e assinaturas). Baixar o JSON da service account.

## 3. RevenueCat (grátis até ~US$2,5k/mês)

1. Criar conta em https://app.revenuecat.com → novo projeto **GestMiles**.
2. Adicionar app **Play Store** (`br.com.gestmiles.app`) e subir o JSON da service
   account (a validação do Google pode levar até ~36h na primeira vez).
3. **Entitlements**: criar `paid`.
4. **Products**: importar/registrar `gm_plus:gm-plus-mensal` e `gm_plus:gm-plus-anual`;
   anexar ambos à entitlement `paid`.
5. **Offerings**: na offering `default`, criar 2 packages: `$rc_monthly` → produto
   mensal; `$rc_annual` → produto anual. (O app lê `current.monthly/annual`.)
6. **Integrations → Webhooks**: URL
   `https://<URL-DO-BACKEND-NA-VERCEL>/api/revenuecat/webhook`; em
   **Authorization header value**, colar EXATAMENTE o valor escolhido pra
   `REVENUECAT_WEBHOOK_SECRET` (gerar um segredo forte, ex. `openssl rand -hex 32`).
7. **API Keys**: copiar a chave PÚBLICA Android (`goog_...`).

## 4. Envs

- Vercel (projeto do BACKEND): `REVENUECAT_WEBHOOK_SECRET=<segredo>` → redeploy.
- `.env.mobile` (local): `VITE_REVENUECAT_ANDROID_KEY=goog_...` → `npm run mobile:sync`
  → rebuild do APK/AAB.

## 5. Teste sandbox (sem gastar)

1. No Play Console, **Configurações → Teste de licença**: adicionar seu e-mail
   (compras de teste não são cobradas).
2. Instalar o build da trilha interna (link de opt-in) no device com essa conta.
3. Comprar o mensal → conferir: entitlement libera as 4 telas gated; linha do
   `perfis` com `subscription_status=active`, `subscription_provider=play`;
   evento no dashboard do RC; log do webhook na Vercel.
4. Testar cancelamento (Play → Assinaturas) → acesso continua até expirar;
   sandbox expira rápido (minutos) → depois `subscription_status=canceled`.
5. "Restaurar compras" após `pm clear` → entitlement volta.

## Solução de problemas

- Paywall "em breve" com key preenchida → offerings vazias: produtos não anexados
  à offering `default`, ou app ainda não revisado na trilha interna, ou conta do
  device não é testadora.
- Webhook 401 → valor do header no RC ≠ `REVENUECAT_WEBHOOK_SECRET`.
- Webhook 200 mas perfis não muda → `app_user_id` anônimo (compra feita antes do
  login? o bootstrap configura no login) — conferir logs `[revenuecat]` na Vercel.
```

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/20260710190000_perfis_subscription_provider.sql .env.example .env.mobile docs/revenuecat_setup.md
git commit -m @'
docs(usuario): migration subscription_provider (nao aplicada) + envs + runbook RevenueCat

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

(Se `.env.mobile` for gitignored, conferir com `git check-ignore .env.mobile` — se for, aplicar a mudança localmente mesmo assim e citar só no runbook/report; commitar apenas os demais.)

---

### Task 9: Gates completos + APK + smoke no device (sem loja)

**Files:** nenhum novo (builds e verificação).

**Interfaces:**
- Consumes: tudo das Tasks 1–8.
- Produces: evidência de que o app funciona SEM as contas (degradação graciosa) e a web não mudou.

- [ ] **Step 1: Gates de código**

```powershell
npx tsc -b
npm test
Set-Location backend; npm test; Set-Location ..
npm run lint
npm run build
```

Expected: tudo exit 0; front ~130 testes verdes; backend inteiro verde; sem erro novo de lint nos arquivos tocados.

- [ ] **Step 2: Build mobile + APK**

```powershell
npm run mobile:sync
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
Set-Location android; .\gradlew.bat assembleDebug; Set-Location ..
```

Expected: sync com 3 plugins; **BUILD SUCCESSFUL** (obrigatório antes de instalar; se "Unable to delete directory": `Remove-Item android/app/build -Recurse -Force` e repetir).

- [ ] **Step 3: Smoke no device (sem key — estado "em breve")**

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am start -n br.com.gestmiles.app/.MainActivity
```

O device já tem sessão da conta smoke. Navegar até Perfil → "Assinatura e plano" (ou menu ☰ → assinatura) via `adb shell input tap` guiado por screenshot (`adb shell screencap -p /sdcard/x.png` + `adb pull` — NUNCA `exec-out >` no PowerShell). Verificar por screenshot:
1. App abre normal (sem crash com o plugin novo instalado e sem key).
2. Tela de assinatura mostra **"Assinatura em breve"** (não a página Stripe).
3. Voltar funciona.

- [ ] **Step 4: Smoke web (rota Stripe intacta)**

Já coberto pelo teste do `AssinaturaRoute` (web → `tela-stripe-web`) + `npm run build` ok. Verificação extra barata: `npx vite preview` e abrir `/assinatura` deslogado → redireciona pra `/auth` (gate), sem erro de console sobre RevenueCat. Opcional se o preview local complicar; os testes já cobrem.

- [ ] **Step 5: Commit (só se o sync alterou arquivos versionados)**

```powershell
git status --short
```

Se houver mudanças em `android/` versionado: `git add android/` + commit `chore(mobile): sync capacitor pos-build` (here-string com trailer). Se limpo, pular.

---

### Task 10: PR do usuario + espelho da migration no manager

**Files:** nenhum neste repo (PRs).

- [ ] **Step 1: Push + PR**

```powershell
git push -u origin feat/mobile-iap-revenuecat
gh pr create --title "feat(mobile): assinatura via Google Play (RevenueCat) no app" --body "<corpo>"
```

Corpo do PR: resumo do design (paywall mensal+anual, webhook Zero Trust, degradação graciosa), evidência da Task 9 (gates + BUILD SUCCESSFUL + screenshots do smoke), **avisos**: migration `20260710190000` NÃO aplicada (aplicar no rollout); envs novas (`VITE_REVENUECAT_ANDROID_KEY`, `REVENUECAT_WEBHOOK_SECRET`) vazias até o rollout; link pro `docs/revenuecat_setup.md`. Rodapé:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 2: Espelho da migration no manager (repo canônico do SQL)**

```powershell
git -C "C:\Users\rick_\OneDrive\Área de Trabalho\Gest Miles\gest-miles-manager-front" fetch origin main
git -C "C:\Users\rick_\OneDrive\Área de Trabalho\Gest Miles\gest-miles-manager-front" checkout -b chore/migration-subscription-provider origin/main
Copy-Item "supabase\migrations\20260710190000_perfis_subscription_provider.sql" "C:\Users\rick_\OneDrive\Área de Trabalho\Gest Miles\gest-miles-manager-front\supabase\migrations\"
git -C "C:\Users\rick_\OneDrive\Área de Trabalho\Gest Miles\gest-miles-manager-front" add supabase/migrations/20260710190000_perfis_subscription_provider.sql
```

Commit (PT-BR + trailer) + push + `gh pr create` no repo manager (título `chore(db): espelho da migration subscription_provider (IAP usuario)`), corpo citando o PR do usuario. ⚠️ usar SEMPRE `git -C <path>` (lição: o cwd do PowerShell reseta pro repo do usuario após erro).

- [ ] **Step 3: Registrar pendências de rollout**

No report final: merge dos 2 PRs quando o owner aprovar; rollout segue `docs/revenuecat_setup.md` (contas → migration com OK → produtos → envs → sandbox). Nada disso bloqueia o merge.
