# WS1 — LGPD mínimo (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** Tornar o cadastro do cliente juridicamente apresentável: aceite de Termos+Privacidade (gateando cadastro por senha **e** Google) e um aviso informativo de cookies.

**Architecture:** URLs legais centralizadas e env-driven (`src/lib/legalUrls.ts`, default `https://gestmiles.com.br`). Checkbox de aceite no `SignUp.tsx` que entra no `canSubmit` e desabilita o botão Google. `CookieNotice` (banner fixo, dismiss em localStorage) montado uma vez no `App`, fora das rotas. Só cookie funcional → aviso informativo, sem consentimento granular.

**Tech Stack:** React 18 + Vite, shadcn `Checkbox` (Radix), Tailwind (paleta nubank), Vitest + Testing Library.

**Branch:** `feat/usuario-lgpd-minimo` (1 PR). `git fetch` + branch do `main`.

**Decisão do owner (2026-06-05):** base legal = `https://gestmiles.com.br`; paths `/termos`, `/privacidade`, `/cookies`. Env override via `VITE_LEGAL_*`.

## File Structure

- **Create** `src/lib/legalUrls.ts` — URLs legais (env + default).
- **Modify** `src/lib/authFlowStorage.ts` — chave do dismiss do aviso de cookies.
- **Create** `src/components/CookieNotice.tsx` — banner informativo.
- **Modify** `src/pages/SignUp.tsx` — checkbox de aceite + gate do submit/Google.
- **Modify** `src/App.tsx` — montar `<CookieNotice />`.
- **Modify** `.env.example` — documentar `VITE_LEGAL_*`.
- **Create** `src/pages/SignUp.test.tsx`, `src/components/CookieNotice.test.tsx`.

---

## Task 1: `legalUrls.ts` + chave de storage

- [ ] **Step 1: Criar `src/lib/legalUrls.ts`**

```ts
// URLs das páginas legais. Env-driven (override por VITE_LEGAL_*); default no site público.
// Owner confirmou base https://gestmiles.com.br com paths /termos /privacidade /cookies (2026-06-05).
const BASE =
  (import.meta.env.VITE_LEGAL_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "https://gestmiles.com.br";

export const TERMS_URL =
  (import.meta.env.VITE_LEGAL_TERMS_URL as string | undefined) || `${BASE}/termos`;
export const PRIVACY_URL =
  (import.meta.env.VITE_LEGAL_PRIVACY_URL as string | undefined) || `${BASE}/privacidade`;
export const COOKIES_URL =
  (import.meta.env.VITE_LEGAL_COOKIES_URL as string | undefined) || `${BASE}/cookies`;
```

- [ ] **Step 2: Adicionar a chave em `src/lib/authFlowStorage.ts`** (ao final):

```ts

/** localStorage: usuário dispensou o aviso de cookies. */
export const COOKIE_NOTICE_DISMISSED_KEY = "gestmiles_cookie_notice_dismissed";
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/legalUrls.ts src/lib/authFlowStorage.ts
git commit -m "feat(usuario): URLs legais env-driven + chave do aviso de cookies"
```

---

## Task 2: `CookieNotice` (componente + teste)

- [ ] **Step 1: Teste que falha — `src/components/CookieNotice.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { COOKIE_NOTICE_DISMISSED_KEY } from "@/lib/authFlowStorage";
import CookieNotice from "./CookieNotice";

describe("CookieNotice", () => {
  beforeEach(() => localStorage.clear());

  it("mostra o aviso quando não foi dispensado", () => {
    render(<CookieNotice />);
    expect(screen.getByText(/cookies essenciais/i)).toBeTruthy();
  });

  it("some e persiste ao clicar em Entendi", () => {
    render(<CookieNotice />);
    fireEvent.click(screen.getByRole("button", { name: /entendi/i }));
    expect(screen.queryByText(/cookies essenciais/i)).toBeNull();
    expect(localStorage.getItem(COOKIE_NOTICE_DISMISSED_KEY)).toBe("1");
  });

  it("não mostra se já foi dispensado", () => {
    localStorage.setItem(COOKIE_NOTICE_DISMISSED_KEY, "1");
    render(<CookieNotice />);
    expect(screen.queryByText(/cookies essenciais/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar — falha** (`npm test`): módulo `./CookieNotice` não existe.

- [ ] **Step 3: Implementar `src/components/CookieNotice.tsx`**

```tsx
import { useEffect, useState } from "react";
import { COOKIE_NOTICE_DISMISSED_KEY } from "@/lib/authFlowStorage";
import { COOKIES_URL } from "@/lib/legalUrls";

/** Aviso informativo de cookies (só cookie funcional; sem consentimento granular). */
export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(COOKIE_NOTICE_DISMISSED_KEY) !== "1") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(COOKIE_NOTICE_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-nubank-border bg-white/95 px-4 py-3 backdrop-blur dark:bg-nubank-bg/95"
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-xs leading-relaxed text-nubank-text-secondary">
          Usamos apenas cookies essenciais pro funcionamento do app (login e sessão). Saiba mais na{" "}
          <a
            href={COOKIES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-nubank-primary underline-offset-4 hover:underline"
          >
            Política de Cookies
          </a>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-[12px] bg-nubank-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-95"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar — passa** (`npm test`): os 3 testes do CookieNotice.

- [ ] **Step 5: Commit**

```bash
git add src/components/CookieNotice.tsx src/components/CookieNotice.test.tsx
git commit -m "feat(usuario): aviso informativo de cookies (dismiss persistido)"
```

---

## Task 3: Aceite de Termos no SignUp (+ teste)

**Files:** Modify `src/pages/SignUp.tsx`; Create `src/pages/SignUp.test.tsx`

- [ ] **Step 1: Imports** — em `src/pages/SignUp.tsx`, adicionar após `import { Label } ...`:

```tsx
import { Checkbox } from "@/components/ui/checkbox";
import { TERMS_URL, PRIVACY_URL } from "@/lib/legalUrls";
```

- [ ] **Step 2: Estado** — após `const [message, setMessage] = useState<string | null>(null);` adicionar:

```tsx
  const [accepted, setAccepted] = useState(false);
```

- [ ] **Step 3: Gate do canSubmit** — trocar:

```tsx
  const canSubmit =
    isValidEmail && password.length >= 6 && password === confirmPassword && confirmPassword.length > 0;
```

por:

```tsx
  const canSubmit =
    isValidEmail &&
    password.length >= 6 &&
    password === confirmPassword &&
    confirmPassword.length > 0 &&
    accepted;
```

- [ ] **Step 4: Guard do Google** — no início de `handleGoogle`, após `const handleGoogle = async () => {`, adicionar:

```tsx
    if (!accepted) return;
```

- [ ] **Step 5: UI do checkbox** — imediatamente **antes** do `<Button ... onClick={() => void handleSignUp()}>` (o botão "Criar conta"), inserir:

```tsx
      <div className="flex items-start gap-2.5">
        <Checkbox
          id="signup-terms"
          checked={accepted}
          onCheckedChange={(v) => setAccepted(v === true)}
          className="mt-0.5"
        />
        <Label
          htmlFor="signup-terms"
          className="text-xs font-normal leading-relaxed text-nubank-text-secondary"
        >
          Li e aceito os{" "}
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-nubank-primary underline-offset-4 hover:underline"
          >
            Termos de Uso
          </a>{" "}
          e a{" "}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-nubank-primary underline-offset-4 hover:underline"
          >
            Política de Privacidade
          </a>
          .
        </Label>
      </div>
```

- [ ] **Step 6: Desabilitar Google até aceitar** — trocar no botão "Continuar com Google":

```tsx
          disabled={pending && pendingAction !== "google"}
```

por:

```tsx
          disabled={!accepted || (pending && pendingAction !== "google")}
```

- [ ] **Step 7: Teste — `src/pages/SignUp.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  signUpWithPassword: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signUpWithPassword: mocks.signUpWithPassword,
    signInWithGoogle: mocks.signInWithGoogle,
  }),
}));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true }));

import SignUp from "./SignUp";

const renderPage = () =>
  render(
    <MemoryRouter>
      <SignUp />
    </MemoryRouter>,
  );

function fillValid() {
  fireEvent.change(screen.getByLabelText(/^E-mail$/i), { target: { value: "a@b.com" } });
  fireEvent.change(screen.getByLabelText(/^Senha$/i), { target: { value: "abcdef" } });
  fireEvent.change(screen.getByLabelText(/Confirmar senha/i), { target: { value: "abcdef" } });
}

describe("SignUp", () => {
  beforeEach(() => vi.clearAllMocks());

  it("bloqueia 'Criar conta' até aceitar os termos", () => {
    renderPage();
    fillValid();
    const criar = screen.getByRole("button", { name: /criar conta/i }) as HTMLButtonElement;
    expect(criar.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(criar.disabled).toBe(false);
  });

  it("'Continuar com Google' fica bloqueado até aceitar os termos", () => {
    renderPage();
    const google = screen.getByRole("button", { name: /continuar com google/i }) as HTMLButtonElement;
    expect(google.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(google.disabled).toBe(false);
  });
});
```

- [ ] **Step 8: Rodar — passa** (`npm test`): os 2 testes do SignUp.

- [ ] **Step 9: Commit**

```bash
git add src/pages/SignUp.tsx src/pages/SignUp.test.tsx
git commit -m "feat(usuario): aceite de Termos+Privacidade no cadastro (gateia senha e Google)"
```

---

## Task 4: Montar o CookieNotice no App + .env.example

- [ ] **Step 1: `src/App.tsx`** — adicionar import (não-lazy) após `import { isSupabaseConfigured } ...`:

```tsx
import CookieNotice from "@/components/CookieNotice";
```

e montar o banner logo após `<Sonner />`:

```tsx
      <Toaster />
      <Sonner />
      <CookieNotice />
      <AuthProvider>
```

- [ ] **Step 2: `.env.example`** (raiz) — adicionar bloco (após a linha `# VITE_APP_URL=`):

```
# Páginas legais (LGPD). Default no código: https://gestmiles.com.br/{termos,privacidade,cookies}.
# Sobrescreva a base OU cada URL individual se necessário.
# VITE_LEGAL_BASE_URL=https://gestmiles.com.br
# VITE_LEGAL_TERMS_URL=
# VITE_LEGAL_PRIVACY_URL=
# VITE_LEGAL_COOKIES_URL=
```

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx .env.example
git commit -m "feat(usuario): monta aviso de cookies no App + documenta VITE_LEGAL_*"
```

---

## Task 5: Gate + PR

- [ ] **Step 1: Gate** — na raiz: `npx tsc -b` (0), `npm test` (verde, +5 testes novos), `npm run build` (ok).
- [ ] **Step 2: PR**

```bash
git push -u origin feat/usuario-lgpd-minimo
gh pr create --base main --title "feat(usuario): LGPD minimo — aceite de termos no cadastro + aviso de cookies (WS1)" \
  --body "Aceite de Termos+Privacidade no cadastro (gateia botao Criar conta e Continuar com Google) com links env-driven (VITE_LEGAL_*, default gestmiles.com.br) + aviso informativo de cookies (dismiss persistido). Parte do launch-readiness (WS1, P0)."
```

## Self-Review

**Cobertura (WS1):** aceite no cadastro ✅ (Task 3, gateia senha+Google) · links legais ✅ (Task 1, env-driven) · aviso de cookies ✅ (Task 2+4). **Placeholders:** nenhum. **Consistência:** `COOKIE_NOTICE_DISMISSED_KEY` definido em Task 1 e usado em Task 2 (componente+teste); `TERMS_URL/PRIVACY_URL` em Task 1 usados no Task 3; `COOKIES_URL` no CookieNotice. **Risco:** se as páginas não existirem em gestmiles.com.br, é troca de env (VITE_LEGAL_*) — sem redeploy de código.
