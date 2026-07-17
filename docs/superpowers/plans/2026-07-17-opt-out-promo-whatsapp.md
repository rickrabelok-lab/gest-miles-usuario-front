# Opt-out de promoções no WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao cliente `cliente_gestao` um toggle self-service pra ligar/desligar as promoções que recebe no WhatsApp.

**Architecture:** Front (tela nova `/notificacoes` gated por role) → rota BFF `/api/notifications/promo-whatsapp` (`requireUser` + service role) → grava/apaga a linha `agent_preferencias(chave='promo_optout', valor='true')` que os workflows n8n 3-B já respeitam. Sem migration. Zero-Trust: `cliente_id` vem sempre do token validado, nunca do body.

**Tech Stack:** React 18 + Vite + TS + Tailwind + shadcn/ui (Switch) + sonner + React Router v6 (front); Express 4 + `@supabase/supabase-js` service role (backend). Testes: Vitest + Testing Library (front), `node:test` (backend).

## Global Constraints

- **Zero-Trust:** `agent_preferencias` NUNCA é lida/escrita pelo browser. Só backend com service role (`assertSupabaseService()`). `cliente_id = req.user.id` (validado por `requireUser`), nunca do corpo.
- **Sem migration:** só INSERT/DELETE em tabela existente. Não tocar schema do banco compartilhado.
- **Semântica do opt-out:** opt-out ⟺ existe linha `(cliente_id, chave='promo_optout', valor='true')`. Ligar = apagar a(s) linha(s); desligar = garantir exatamente uma linha `valor='true'`.
- **Default = LIGADO** (recebe). Ausência de linha = recebe.
- **Chave/valor exatos (copiar verbatim):** `chave = 'promo_optout'`, `valor = 'true'`. Não mudar — os workflows n8n `gm-promo-personalizado` e `gm-promo-digest-interno` filtram por esses literais.
- **Visibilidade:** a linha "Notificações" no perfil só aparece pra `role === 'cliente_gestao'` (gate de UX; o backend autoriza por identidade).
- **Copy PT-BR.** Toggle: "Promoções no WhatsApp"; apoio: "Receba as melhores promoções direto no seu grupo."
- **Gates de conclusão:** `npx tsc -b` limpo + `npm test` (front) + `npm run build` + `cd backend && npm test` (backend `node --test`).
- **Git:** branch `feat/opt-out-promo-whatsapp` (já criada, tem a spec). Nunca push direto no main; `git fetch` antes; commits frequentes por task.

---

### Task 1: Backend — lib pura de lógica do opt-out

Lógica testável isolada (padrão da casa: `accountDeletionService.js` + `.test.js`). A rota (Task 2) vira glue fino.

**Files:**
- Create: `backend/src/lib/notificationPrefs.js`
- Test: `backend/src/lib/notificationPrefs.test.js`

**Interfaces:**
- Produces:
  - `PROMO_OPTOUT_KEY: 'promo_optout'` (const string)
  - `OPTOUT_VALUE: 'true'` (const string)
  - `isPromoWhatsappEnabled(rows: Array<{valor?: string}>): boolean` — `true` quando NENHUMA linha tem `valor === 'true'`.
  - `parseEnabledInput(body: any): { ok: boolean, enabled?: boolean, error?: string }` — valida `body.enabled` como booleano.

- [ ] **Step 1: Write the failing test**

```js
// backend/src/lib/notificationPrefs.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  PROMO_OPTOUT_KEY,
  OPTOUT_VALUE,
  isPromoWhatsappEnabled,
  parseEnabledInput,
} from "./notificationPrefs.js";

test("chave e valor são os literais que o pipeline espera", () => {
  assert.equal(PROMO_OPTOUT_KEY, "promo_optout");
  assert.equal(OPTOUT_VALUE, "true");
});

test("sem linha de opt-out => habilitado", () => {
  assert.equal(isPromoWhatsappEnabled([]), true);
  assert.equal(isPromoWhatsappEnabled(undefined), true);
});

test("linha valor='true' => desabilitado", () => {
  assert.equal(isPromoWhatsappEnabled([{ valor: "true" }]), false);
});

test("linha com outro valor => habilitado", () => {
  assert.equal(isPromoWhatsappEnabled([{ valor: "false" }]), true);
});

test("parseEnabledInput aceita booleano", () => {
  assert.deepEqual(parseEnabledInput({ enabled: true }), { ok: true, enabled: true });
  assert.deepEqual(parseEnabledInput({ enabled: false }), { ok: true, enabled: false });
});

test("parseEnabledInput rejeita não-booleano", () => {
  assert.equal(parseEnabledInput({ enabled: "true" }).ok, false);
  assert.equal(parseEnabledInput({}).ok, false);
  assert.equal(parseEnabledInput(null).ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/lib/notificationPrefs.test.js`
Expected: FAIL (Cannot find module './notificationPrefs.js')

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/lib/notificationPrefs.js
/** Chave/valor que os workflows n8n 3-B filtram (não mudar). */
export const PROMO_OPTOUT_KEY = "promo_optout";
export const OPTOUT_VALUE = "true";

/** Habilitado (recebe) quando NENHUMA linha marca opt-out. */
export function isPromoWhatsappEnabled(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return !list.some((r) => r?.valor === OPTOUT_VALUE);
}

/** Valida o body do PUT: exige `enabled` booleano. */
export function parseEnabledInput(body) {
  if (!body || typeof body.enabled !== "boolean") {
    return { ok: false, error: "Campo 'enabled' (booleano) é obrigatório." };
  }
  return { ok: true, enabled: body.enabled };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test src/lib/notificationPrefs.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/notificationPrefs.js backend/src/lib/notificationPrefs.test.js
git commit -m "feat(backend): lib pura do opt-out de promo WhatsApp (notificationPrefs)"
```

---

### Task 2: Backend — rota `/api/notifications/promo-whatsapp` (GET + PUT) + montagem

**Files:**
- Create: `backend/src/routes/notifications.js`
- Create: `backend/src/routes/notifications.test.js`
- Modify: `backend/src/index.js` (imports por volta da linha 22-27; mounts por volta da linha 109)

**Interfaces:**
- Consumes (Task 1): `PROMO_OPTOUT_KEY`, `OPTOUT_VALUE`, `isPromoWhatsappEnabled`, `parseEnabledInput`.
- Consumes (existentes): `requireUser` (`../middleware/requireUser.js`, expõe `req.user`), `assertSupabaseService` (`../lib/supabaseService.js`), `serverError` (`../lib/httpError.js`).
- Produces (HTTP, consumido pela Task 3):
  - `GET /api/notifications/promo-whatsapp` → `{ enabled: boolean }`
  - `PUT /api/notifications/promo-whatsapp` body `{ enabled: boolean }` → `{ enabled: boolean }`

- [ ] **Step 1: Write the failing test**

```js
// backend/src/routes/notifications.test.js
import test from "node:test";
import assert from "node:assert/strict";

// Padrão da casa (groupOnboarding.test): importa o app, listen(0), fetch.
// Aqui cobrimos o pré-DB: sem token => 401 (requireUser barra antes de tocar o banco).
process.env.VERCEL = "1"; // evita o app.listen(3000) automático fora da Vercel

const { default: app } = await import("../index.js");

function listen(a) {
  return new Promise((r) => {
    const s = a.listen(0, () => r(s));
  });
}

test("GET promo-whatsapp: 401 sem token", async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/notifications/promo-whatsapp`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("PUT promo-whatsapp: 401 sem token", async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/notifications/promo-whatsapp`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/routes/notifications.test.js`
Expected: FAIL (404 no lugar de 401 — rota ainda não montada)

- [ ] **Step 3: Write the route**

```js
// backend/src/routes/notifications.js
import { Router } from "express";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireUser } from "../middleware/requireUser.js";
import { serverError } from "../lib/httpError.js";
import {
  PROMO_OPTOUT_KEY,
  OPTOUT_VALUE,
  isPromoWhatsappEnabled,
  parseEnabledInput,
} from "../lib/notificationPrefs.js";

const router = Router();

/** GET /api/notifications/promo-whatsapp — estado do opt-out do próprio cliente. */
router.get("/promo-whatsapp", requireUser, async (req, res) => {
  try {
    const sb = assertSupabaseService();
    const { data, error } = await sb
      .from("agent_preferencias")
      .select("valor")
      .eq("cliente_id", req.user.id)
      .eq("chave", PROMO_OPTOUT_KEY);
    if (error) {
      return serverError(res, "Erro ao carregar preferências.", error, "[notifications]");
    }
    return res.json({ enabled: isPromoWhatsappEnabled(data) });
  } catch (err) {
    return serverError(res, "Erro ao carregar preferências.", err, "[notifications]");
  }
});

/**
 * PUT /api/notifications/promo-whatsapp body { enabled } — liga/desliga.
 * Idempotente e independente de constraint: sempre apaga as linhas do opt-out;
 * se enabled=false, insere exatamente uma linha valor='true'.
 */
router.put("/promo-whatsapp", requireUser, async (req, res) => {
  try {
    const parsed = parseEnabledInput(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const sb = assertSupabaseService();
    const clienteId = req.user.id;

    const { error: delErr } = await sb
      .from("agent_preferencias")
      .delete()
      .eq("cliente_id", clienteId)
      .eq("chave", PROMO_OPTOUT_KEY);
    if (delErr) {
      return serverError(res, "Erro ao salvar preferência.", delErr, "[notifications]");
    }

    if (!parsed.enabled) {
      const { error: insErr } = await sb
        .from("agent_preferencias")
        .insert({ cliente_id: clienteId, chave: PROMO_OPTOUT_KEY, valor: OPTOUT_VALUE });
      if (insErr) {
        return serverError(res, "Erro ao salvar preferência.", insErr, "[notifications]");
      }
    }

    return res.json({ enabled: parsed.enabled });
  } catch (err) {
    return serverError(res, "Erro ao salvar preferência.", err, "[notifications]");
  }
});

export default router;
```

- [ ] **Step 4: Mount the route in `backend/src/index.js`**

Add the import next to the other route imports (após a linha 22, `import accountDeletionRoutes ...`):

```js
import notificationsRoutes from "./routes/notifications.js";
```

Add the mount next to the other `routes.use(...)` (após a linha 109, `routes.use("/api/account", accountDeletionRoutes);`):

```js
routes.use("/api/notifications", notificationsRoutes);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && node --test src/routes/notifications.test.js`
Expected: PASS (2 tests — ambos 401 sem token)

- [ ] **Step 6: Run the whole backend suite (nada quebrou)**

Run: `cd backend && npm test`
Expected: PASS (todos os arquivos `node --test`, incluindo os novos)

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/notifications.js backend/src/routes/notifications.test.js backend/src/index.js
git commit -m "feat(backend): rota /api/notifications/promo-whatsapp (opt-out via service role)"
```

---

### Task 3: Front — lib de I/O `notifications.ts`

**Files:**
- Create: `src/lib/notifications.ts`
- Test: `src/lib/notifications.test.ts`

**Interfaces:**
- Consumes: `apiFetch` (`@/services/api`); a rota HTTP da Task 2.
- Produces (consumido pela Task 4):
  - `type PromoWhatsappPref = { enabled: boolean }`
  - `getPromoWhatsappPref(token: string): Promise<PromoWhatsappPref>`
  - `setPromoWhatsappPref(token: string, enabled: boolean): Promise<PromoWhatsappPref>`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/notifications.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/services/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { getPromoWhatsappPref, setPromoWhatsappPref } from "./notifications";

describe("notifications lib", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getPromoWhatsappPref faz GET com o token", async () => {
    apiFetch.mockResolvedValue({ enabled: true });
    const out = await getPromoWhatsappPref("tok");
    expect(apiFetch).toHaveBeenCalledWith("/api/notifications/promo-whatsapp", { token: "tok" });
    expect(out).toEqual({ enabled: true });
  });

  it("setPromoWhatsappPref faz PUT com enabled no body", async () => {
    apiFetch.mockResolvedValue({ enabled: false });
    const out = await setPromoWhatsappPref("tok", false);
    expect(apiFetch).toHaveBeenCalledWith("/api/notifications/promo-whatsapp", {
      method: "PUT",
      body: JSON.stringify({ enabled: false }),
      token: "tok",
    });
    expect(out).toEqual({ enabled: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/notifications.test.ts`
Expected: FAIL (Cannot find module './notifications')

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/notifications.ts
import { apiFetch } from "@/services/api";

export type PromoWhatsappPref = { enabled: boolean };

/** Lê o estado do opt-out de promo WhatsApp do próprio cliente. */
export async function getPromoWhatsappPref(token: string): Promise<PromoWhatsappPref> {
  return apiFetch<PromoWhatsappPref>("/api/notifications/promo-whatsapp", { token });
}

/** Liga (enabled=true) ou desliga (false) as promoções no WhatsApp. */
export async function setPromoWhatsappPref(
  token: string,
  enabled: boolean,
): Promise<PromoWhatsappPref> {
  return apiFetch<PromoWhatsappPref>("/api/notifications/promo-whatsapp", {
    method: "PUT",
    body: JSON.stringify({ enabled }),
    token,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/notifications.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications.ts src/lib/notifications.test.ts
git commit -m "feat(usuario): lib de I/O do opt-out de promo WhatsApp"
```

---

### Task 4: Front — hook `useNotificationPrefs`

**Files:**
- Create: `src/hooks/useNotificationPrefs.ts`
- Test: `src/hooks/useNotificationPrefs.test.ts`

**Interfaces:**
- Consumes (Task 3): `getPromoWhatsappPref`, `setPromoWhatsappPref`; `supabase` (`@/lib/supabase`) pra token.
- Produces (consumido pela Task 5): hook retorna
  `{ enabled: boolean, loading: boolean, saving: boolean, error: string | null, reload: () => Promise<void>, toggle: (next: boolean) => Promise<void> }`.
  `toggle` é otimista e **relança** o erro após reverter (a tela mostra o toast).

- [ ] **Step 1: Write the failing test**

```ts
// src/hooks/useNotificationPrefs.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const getPref = vi.fn();
const setPref = vi.fn();
const getSession = vi.fn();

vi.mock("@/lib/notifications", () => ({
  getPromoWhatsappPref: (...a: unknown[]) => getPref(...a),
  setPromoWhatsappPref: (...a: unknown[]) => setPref(...a),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));

import { useNotificationPrefs } from "./useNotificationPrefs";

describe("useNotificationPrefs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
  });

  it("carrega o estado no mount", async () => {
    getPref.mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => useNotificationPrefs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enabled).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("toggle otimista confirma pelo retorno do backend", async () => {
    getPref.mockResolvedValue({ enabled: true });
    setPref.mockResolvedValue({ enabled: false });
    const { result } = renderHook(() => useNotificationPrefs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.toggle(false);
    });
    expect(setPref).toHaveBeenCalledWith("tok", false);
    expect(result.current.enabled).toBe(false);
  });

  it("toggle reverte e relança em erro do backend", async () => {
    getPref.mockResolvedValue({ enabled: true });
    setPref.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useNotificationPrefs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(
      act(async () => {
        await result.current.toggle(false);
      }),
    ).rejects.toThrow("boom");
    expect(result.current.enabled).toBe(true); // revertido
  });

  it("erro no load popula error e não trava loading", async () => {
    getPref.mockRejectedValue(new Error("falha"));
    const { result } = renderHook(() => useNotificationPrefs());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("falha");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/useNotificationPrefs.test.ts`
Expected: FAIL (Cannot find module './useNotificationPrefs')

- [ ] **Step 3: Write minimal implementation**

```ts
// src/hooks/useNotificationPrefs.ts
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { getPromoWhatsappPref, setPromoWhatsappPref } from "@/lib/notifications";

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");
  return token;
}

export function useNotificationPrefs() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const pref = await getPromoWhatsappPref(token);
      setEnabled(pref.enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = useCallback(
    async (next: boolean) => {
      const prev = enabled;
      setEnabled(next); // otimista
      setSaving(true);
      try {
        const token = await getAccessToken();
        const pref = await setPromoWhatsappPref(token, next);
        setEnabled(pref.enabled);
      } catch (e) {
        setEnabled(prev); // reverte
        throw e; // a tela mostra o toast
      } finally {
        setSaving(false);
      }
    },
    [enabled],
  );

  return { enabled, loading, saving, error, reload, toggle };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useNotificationPrefs.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotificationPrefs.ts src/hooks/useNotificationPrefs.test.ts
git commit -m "feat(usuario): hook useNotificationPrefs (load + toggle otimista)"
```

---

### Task 5: Front — tela `NotificacoesPage`

**Files:**
- Create: `src/pages/NotificacoesPage.tsx`
- Test: `src/pages/NotificacoesPage.test.tsx`

**Interfaces:**
- Consumes (Task 4): `useNotificationPrefs`. Componentes existentes: `Switch` (`@/components/ui/switch`), `BottomNav` (`@/components/BottomNav`), `toast` (`sonner`), `useNavigate` (react-router).
- Produces: `export default NotificacoesPage` (usado na rota da Task 6).

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/NotificacoesPage.test.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotificacoesPage from "./NotificacoesPage";

const hookState = {
  enabled: true,
  loading: false,
  saving: false,
  error: null as string | null,
  reload: vi.fn(),
  toggle: vi.fn(),
};
vi.mock("@/hooks/useNotificationPrefs", () => ({
  useNotificationPrefs: () => hookState,
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));
vi.mock("@/components/BottomNav", () => ({ default: () => <nav data-testid="bottomnav" /> }));

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificacoesPage />
    </MemoryRouter>,
  );
}

describe("NotificacoesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState.enabled = true;
    hookState.loading = false;
    hookState.saving = false;
    hookState.error = null;
    hookState.toggle = vi.fn().mockResolvedValue(undefined);
  });

  it("mostra o toggle refletindo o estado carregado (ligado)", () => {
    renderPage();
    const sw = screen.getByRole("switch", { name: "Promoções no WhatsApp" });
    expect(sw).toBeChecked();
    expect(screen.getByText("Promoções no WhatsApp")).toBeInTheDocument();
  });

  it("estado de loading mostra Carregando…", () => {
    hookState.loading = true;
    renderPage();
    expect(screen.getByText(/Carregando/)).toBeInTheDocument();
  });

  it("estado de erro mostra retry e chama reload", () => {
    hookState.error = "falha";
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    expect(hookState.reload).toHaveBeenCalled();
  });

  it("clicar no toggle chama toggle(false)", () => {
    renderPage();
    fireEvent.click(screen.getByRole("switch", { name: "Promoções no WhatsApp" }));
    expect(hookState.toggle).toHaveBeenCalledWith(false);
  });

  it("erro no toggle dispara toast", async () => {
    hookState.toggle = vi.fn().mockRejectedValue(new Error("x"));
    renderPage();
    fireEvent.click(screen.getByRole("switch", { name: "Promoções no WhatsApp" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/NotificacoesPage.test.tsx`
Expected: FAIL (Cannot find module './NotificacoesPage')

- [ ] **Step 3: Write the page**

```tsx
// src/pages/NotificacoesPage.tsx
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import BottomNav from "@/components/BottomNav";
import { Switch } from "@/components/ui/switch";
import { useNotificationPrefs } from "@/hooks/useNotificationPrefs";

/** Tela de Notificações — hoje só o opt-out de promoções no WhatsApp. */
export default function NotificacoesPage() {
  const navigate = useNavigate();
  const { enabled, loading, saving, error, reload, toggle } = useNotificationPrefs();

  const onToggle = async (next: boolean) => {
    try {
      await toggle(next);
    } catch {
      toast.error("Não foi possível salvar. Tente de novo.");
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-28">
      <div className="flex items-center gap-2.5 px-5 pb-1 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-[16px] border border-nubank-border bg-white text-nubank-text transition-colors hover:bg-nubank-bg"
        >
          <ArrowLeft size={19} strokeWidth={2} />
        </button>
        <h1 className="font-display text-[17px] font-bold tracking-tight text-nubank-text">
          Notificações
        </h1>
      </div>

      <div className="px-5 pt-4">
        {loading ? (
          <p className="text-sm text-nubank-text-secondary">Carregando…</p>
        ) : error ? (
          <div className="rounded-[20px] bg-white p-4 shadow-nubank-card">
            <p className="text-sm text-nubank-text-secondary">
              Não foi possível carregar suas preferências.
            </p>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-3 rounded-full bg-nubank-tint px-4 py-2 text-sm font-semibold text-nubank-dark transition-colors hover:bg-primary/15"
            >
              Tentar de novo
            </button>
          </div>
        ) : (
          <div className="rounded-[20px] bg-white p-1 shadow-nubank-card">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-nubank-text">
                  Promoções no WhatsApp
                </span>
                <span className="block text-xs text-nubank-text-secondary">
                  Receba as melhores promoções direto no seu grupo.
                </span>
              </span>
              <Switch
                checked={enabled}
                disabled={saving}
                onCheckedChange={onToggle}
                aria-label="Promoções no WhatsApp"
              />
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/NotificacoesPage.test.tsx`
Expected: PASS (5 tests)

> Nota: o `Switch` do shadcn/ui renderiza `role="switch"` (Radix). Se o `aria-label` não expuser o nome acessível no seu setup, confirme lendo `src/components/ui/switch.tsx` — o componente repassa props pro `SwitchPrimitives.Root`, então `aria-label` funciona.

- [ ] **Step 5: Commit**

```bash
git add src/pages/NotificacoesPage.tsx src/pages/NotificacoesPage.test.tsx
git commit -m "feat(usuario): tela Notificações com toggle de promo WhatsApp"
```

---

### Task 6: Front — linha no menu (gated) + rota

**Files:**
- Modify: `src/pages/PerfilPage.tsx` (import do ícone; seção "Preferências" ~linha 180-187)
- Modify: `src/App.tsx` (lazy import ~linha 45; bloco de rota ~linha 223-229)
- Test: `src/pages/PerfilPage.test.tsx`

**Interfaces:**
- Consumes: `role` de `useAuth()`; `NotificacoesPage` (Task 5).
- Produces: rota `/notificacoes` e a linha de menu (só `cliente_gestao`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/PerfilPage.test.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PerfilPage from "./PerfilPage";

const authState = { user: { id: "u1", email: "c@x.com" }, role: "cliente_gestao", signOut: vi.fn() };
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));
// A busca de gestores retorna vazio (efeito no-op): .eq() é awaited direto.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }),
  },
}));
vi.mock("@/components/BottomNav", () => ({ default: () => <nav data-testid="bottomnav" /> }));

function renderPerfil() {
  return render(
    <MemoryRouter>
      <PerfilPage />
    </MemoryRouter>,
  );
}

describe("PerfilPage — linha Notificações (gated cliente_gestao)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "cliente_gestao";
  });

  it("cliente_gestao vê 'Notificações'", () => {
    authState.role = "cliente_gestao";
    renderPerfil();
    expect(screen.getByText("Notificações")).toBeInTheDocument();
  });

  it("cliente avulso NÃO vê 'Notificações'", () => {
    authState.role = "cliente";
    renderPerfil();
    expect(screen.queryByText("Notificações")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/PerfilPage.test.tsx`
Expected: FAIL (cliente_gestao não encontra "Notificações" — linha ainda não existe)

- [ ] **Step 3: Add the gated menu row in `PerfilPage.tsx`**

Adicione `Bell` ao import de `lucide-react` (o bloco `import { ChevronRight, CreditCard, ... } from "lucide-react";` por volta das linhas 3-14):

```tsx
  Bell,
```

Na seção "Preferências" (por volta das linhas 180-187), troque:

```tsx
        <div>
          <p className="section-label px-0.5">Preferências</p>
          <div className="rounded-[20px] bg-white p-1 shadow-nubank-card">
            {menuRow(Sparkles, "Preferências de sugestões", () =>
              navigate("/preferencias-sugestoes"),
            )}
          </div>
        </div>
```

por:

```tsx
        <div>
          <p className="section-label px-0.5">Preferências</p>
          <div className="rounded-[20px] bg-white p-1 shadow-nubank-card">
            {menuRow(Sparkles, "Preferências de sugestões", () =>
              navigate("/preferencias-sugestoes"),
            )}
            {role === "cliente_gestao" && (
              <>
                {divider}
                {menuRow(Bell, "Notificações", () => navigate("/notificacoes"))}
              </>
            )}
          </div>
        </div>
```

- [ ] **Step 4: Add the lazy import + route in `src/App.tsx`**

Junto dos outros lazy imports (por volta da linha 45, perto de `PreferenciasSugestoesPage`):

```tsx
const NotificacoesPage = lazy(() => import("./pages/NotificacoesPage"));
```

Junto do bloco da rota `/preferencias-sugestoes` (por volta das linhas 223-229), adicione:

```tsx
                <Route
                  path="/notificacoes"
                  element={
                    <ClienteOnly>
                      <NotificacoesPage />
                    </ClienteOnly>
                  }
                />
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/pages/PerfilPage.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/pages/PerfilPage.tsx src/pages/PerfilPage.test.tsx src/App.tsx
git commit -m "feat(usuario): linha Notificações no perfil (gated cliente_gestao) + rota"
```

---

### Task 7: Verificação final + PR

**Files:** nenhum novo (só rodar gates e abrir PR).

- [ ] **Step 1: Type-check real**

Run: `npx tsc -b`
Expected: exit 0, sem erros

- [ ] **Step 2: Suíte de testes do front**

Run: `npm test`
Expected: PASS (todos os arquivos, incl. `notifications`, `useNotificationPrefs`, `NotificacoesPage`, `PerfilPage`)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`

- [ ] **Step 4: Suíte do backend**

Run: `cd backend && npm test`
Expected: PASS (incl. `notificationPrefs`, `notifications`)

- [ ] **Step 5: Smoke opcional (recomendado) com backend + front rodando**

Com `npm run dev:all` no ar e logado como a conta de teste `cliente_gestao`:
- Abrir `/perfil` → seção Preferências mostra "Notificações" → tela abre.
- Togglar OFF → conferir no banco (SQL read-only) que existe
  `agent_preferencias(cliente_id=<conta teste>, chave='promo_optout', valor='true')`.
- Togglar ON → conferir que a linha sumiu.
- Reverter o estado da conta de teste pra ON no fim.

- [ ] **Step 6: Push + PR**

```bash
git push -u origin feat/opt-out-promo-whatsapp
gh pr create --title "feat(usuario): opt-out de promoções no WhatsApp (tela Notificações)" --body "## O quê
Tela nova **Notificações** (\`/notificacoes\`), acessível pela seção Preferências do perfil, **visível só pra \`cliente_gestao\`**, com um toggle **Promoções no WhatsApp** (default LIGADO). Desligar suprime as promoções proativas que o cliente recebe no WhatsApp (canais direto + digest, respeitados pelos workflows 3-B).

## Como (Zero-Trust)
- Rota BFF \`/api/notifications/promo-whatsapp\` (GET/PUT) com \`requireUser\` + service role. \`cliente_id\` vem do token validado, nunca do body.
- Grava/apaga \`agent_preferencias(chave='promo_optout', valor='true')\` — a tabela do bot segue fechada pro browser.
- **Sem migration** (só INSERT/DELETE em tabela existente).

## Gates
- \`npx tsc -b\` limpo · \`npm test\` (front) · \`npm run build\` · \`cd backend && npm test\` (node --test)

## Follow-up (não bloqueia)
- Confirmar se o PerfilPage do cliente é forkado no manager e replicar lá, se for.

Spec: \`docs/superpowers/specs/2026-07-17-opt-out-promo-whatsapp-design.md\` · Plano: \`docs/superpowers/plans/2026-07-17-opt-out-promo-whatsapp.md\`

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Notas de execução

- **Ordem:** Task 1→7 em sequência (2 depende de 1; 4 de 3; 5 de 4; 6 de 5). Backend (1-2) e front-lib (3-4) são independentes entre si — podem ir em paralelo se usar subagentes, mas 5 e 6 fecham por cima.
- **Sem migration** — nada a aplicar no banco compartilhado.
- **Follow-up (não bloqueia):** confirmar se o `PerfilPage` do cliente é forkado no manager ([[sync-user-app-changes-to-manager]]); se sim, replicar a linha + tela lá. Registrar no corpo do PR.
