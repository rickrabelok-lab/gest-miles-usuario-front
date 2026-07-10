# Deep links de auth no app Android — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Continuar com Google" e links de e-mail (confirmação de cadastro / magic link) funcionando no app Capacitor Android via deep link `br.com.gestmiles.app://auth-callback`, com web 100% inalterada.

**Architecture:** Custom scheme registrado no AndroidManifest; OAuth abre em Chrome Custom Tab (`@capacitor/browser`) com `skipBrowserRedirect`; o retorno chega via `appUrlOpen` (`@capacitor/app`) num componente sem UI dentro do `BrowserRouter` que troca `?code=` (PKCE) ou aplica tokens do fragment e navega pro `/me`. O client Supabase usa `flowType: "pkce"` só quando nativo.

**Tech Stack:** React 18 + Vite, Capacitor 8 (`@capacitor/app`, `@capacitor/browser` — novos), `@supabase/supabase-js` v2, Vitest + Testing Library, adb pro E2E em device físico.

**Spec:** `docs/superpowers/specs/2026-07-10-mobile-auth-deep-links-design.md`

## Global Constraints

- Branch de trabalho: `feat/mobile-auth-deep-links` (já criada; spec commitada nela).
- Deep link canônico, copiar verbatim: `br.com.gestmiles.app://auth-callback`.
- Web NÃO muda de comportamento: flow implicit e redirects pra `${window.location.origin}/me` continuam idênticos na web.
- `vite build` NÃO type-checka; o gate real é `npx tsc -b` + `npm test` (+ `npm run lint`).
- Copy de UI e mensagens de commit em PT-BR, commits com escopo (`feat(mobile): …`).
- Testes: descrição em PT-BR, `vi.clearAllMocks()` no `beforeEach`.
- NÃO aplicar nada no dashboard do Supabase (projeto compartilhado) — a config de Redirect URL é ação do owner (Task 8).
- Build Android: `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`, `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`; conferir `BUILD SUCCESSFUL` ANTES de `adb install` (adb instala APK velho mesmo após build falho).
- Se o gradle falhar com "Unable to delete directory …build/intermediates" (lock do OneDrive): `Remove-Item android/app/build -Recurse -Force` e rebuildar.

---

### Task 1: Plugins Capacitor + intent-filter no AndroidManifest

**Files:**
- Modify: `package.json` / `package-lock.json` (via `npm install`)
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify (regenerados pelo sync): `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`

**Interfaces:**
- Produces: módulos `@capacitor/app` e `@capacitor/browser` instaláveis/importáveis (Tasks 4 e 5 fazem `import("@capacitor/app")` / `import("@capacitor/browser")`); scheme `br.com.gestmiles.app` + host `auth-callback` registrado no Android.

- [ ] **Step 1: Instalar os plugins**

```powershell
npm install @capacitor/app @capacitor/browser
```

Conferir no `package.json` que ambos entraram com major compatível com `@capacitor/core` (^8.x). Se vier major diferente, reinstalar pinando: `npm install @capacitor/app@^8.0.0 @capacitor/browser@^8.0.0`.

- [ ] **Step 2: Adicionar o intent-filter do deep link**

Em `android/app/src/main/AndroidManifest.xml`, dentro da `<activity android:name=".MainActivity" …>` (que já tem `launchMode="singleTask"`), logo APÓS o intent-filter MAIN/LAUNCHER existente, adicionar:

```xml
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="br.com.gestmiles.app" android:host="auth-callback" />
            </intent-filter>
```

Nota: os 3 arquivos do `android/` já têm ruído de whitespace/EOL pendente do último `cap sync` — o sync do Step 3 vai reescrevê-los; commitar o resultado como vier.

- [ ] **Step 3: Sincronizar o projeto Android**

```powershell
npm run mobile:sync
```

Expected: `vite build --mode mobile` conclui e `cap sync android` lista `@capacitor/app` e `@capacitor/browser` em "Found 2 Capacitor plugins for android" (ou similar), sem erro.

- [ ] **Step 4: Conferir plugins reconhecidos**

```powershell
npx cap ls android
```

Expected: lista contém `@capacitor/app` e `@capacitor/browser`.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json android/app/src/main/AndroidManifest.xml android/app/capacitor.build.gradle android/capacitor.settings.gradle
git commit -m @'
feat(mobile): plugins @capacitor/app+browser e intent-filter do deep link de auth

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 2: `src/lib/nativeAuth.ts` — helpers puros (TDD)

**Files:**
- Create: `src/lib/nativeAuth.ts`
- Test: `src/lib/nativeAuth.test.ts`

**Interfaces:**
- Produces (Tasks 3, 4 e 5 consomem exatamente estas assinaturas):
  - `AUTH_DEEP_LINK: string` = `"br.com.gestmiles.app://auth-callback"`
  - `isNativePlatform(): boolean`
  - `authRedirectUrl(path: string): string`
  - `type AuthCallbackResult = { kind: "code"; code: string } | { kind: "tokens"; accessToken: string; refreshToken: string } | { kind: "error"; message: string } | { kind: "ignore" }`
  - `parseAuthCallbackUrl(url: string): AuthCallbackResult`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/lib/nativeAuth.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";

import {
  AUTH_DEEP_LINK,
  authRedirectUrl,
  isNativePlatform,
  parseAuthCallbackUrl,
} from "./nativeAuth";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

const setNative = (native: boolean) => {
  (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => native };
};

afterEach(() => {
  delete (window as WindowWithCapacitor).Capacitor;
});

describe("isNativePlatform", () => {
  it("é false na web (sem window.Capacitor)", () => {
    expect(isNativePlatform()).toBe(false);
  });

  it("é true quando o runtime Capacitor reporta nativo", () => {
    setNative(true);
    expect(isNativePlatform()).toBe(true);
  });

  it("é false quando o runtime Capacitor reporta web", () => {
    setNative(false);
    expect(isNativePlatform()).toBe(false);
  });
});

describe("authRedirectUrl", () => {
  it("na web devolve origin + path", () => {
    expect(authRedirectUrl("/me")).toBe(`${window.location.origin}/me`);
  });

  it("no nativo devolve o deep link", () => {
    setNative(true);
    expect(authRedirectUrl("/me")).toBe(AUTH_DEEP_LINK);
  });
});

describe("parseAuthCallbackUrl", () => {
  it("ignora URL de outro scheme", () => {
    expect(parseAuthCallbackUrl("https://gestmiles.com.br/?code=x")).toEqual({ kind: "ignore" });
  });

  it("ignora deep link sem payload", () => {
    expect(parseAuthCallbackUrl(AUTH_DEEP_LINK)).toEqual({ kind: "ignore" });
  });

  it("extrai ?code= (PKCE)", () => {
    expect(parseAuthCallbackUrl(`${AUTH_DEEP_LINK}?code=abc-123`)).toEqual({
      kind: "code",
      code: "abc-123",
    });
  });

  it("extrai tokens do fragment", () => {
    expect(
      parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#access_token=at&refresh_token=rt&token_type=bearer`),
    ).toEqual({ kind: "tokens", accessToken: "at", refreshToken: "rt" });
  });

  it("trata fragment com token incompleto como erro", () => {
    expect(parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#access_token=at`)).toEqual({
      kind: "error",
      message: "Resposta de login incompleta.",
    });
  });

  it("prioriza erro do GoTrue na query", () => {
    const result = parseAuthCallbackUrl(
      `${AUTH_DEEP_LINK}?error=access_denied&error_description=Usuario+cancelou`,
    );
    expect(result).toEqual({ kind: "error", message: "Usuario cancelou" });
  });

  it("reconhece erro no fragment", () => {
    const result = parseAuthCallbackUrl(
      `${AUTH_DEEP_LINK}#error=server_error&error_description=Oops`,
    );
    expect(result).toEqual({ kind: "error", message: "Oops" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npx vitest run src/lib/nativeAuth.test.ts
```

Expected: FAIL — módulo `./nativeAuth` não existe.

- [ ] **Step 3: Implementar `src/lib/nativeAuth.ts`**

```ts
/**
 * Helpers de auth pro app nativo (Capacitor).
 *
 * No app, o retorno de OAuth/links de e-mail chega por custom scheme; na web
 * continua voltando pra origin. Spec:
 * docs/superpowers/specs/2026-07-10-mobile-auth-deep-links-design.md
 */

export const AUTH_DEEP_LINK = "br.com.gestmiles.app://auth-callback";

type CapacitorGlobal = { isNativePlatform?: () => boolean };

export function isNativePlatform(): boolean {
  const cap = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function authRedirectUrl(path: string): string {
  if (isNativePlatform()) return AUTH_DEEP_LINK;
  return `${window.location.origin}${path}`;
}

export type AuthCallbackResult =
  | { kind: "code"; code: string }
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string }
  | { kind: "ignore" };

/**
 * Interpreta a URL recebida via appUrlOpen. Função pura (sem Capacitor nem
 * Supabase): aceita `?code=` (PKCE), tokens no fragment (usado tb no E2E via
 * adb) e `error`/`error_description` do GoTrue (query ou fragment).
 * Não usa `new URL()` de propósito — parsing de host em scheme custom varia.
 */
export function parseAuthCallbackUrl(url: string): AuthCallbackResult {
  if (!url.startsWith(AUTH_DEEP_LINK)) return { kind: "ignore" };

  const rest = url.slice(AUTH_DEEP_LINK.length);
  const hashIndex = rest.indexOf("#");
  const fragment = hashIndex >= 0 ? rest.slice(hashIndex + 1) : "";
  const beforeHash = hashIndex >= 0 ? rest.slice(0, hashIndex) : rest;
  const queryIndex = beforeHash.indexOf("?");
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : "";

  const queryParams = new URLSearchParams(query);
  const fragmentParams = new URLSearchParams(fragment);

  const errorDescription =
    queryParams.get("error_description") ?? fragmentParams.get("error_description");
  const errorCode = queryParams.get("error") ?? fragmentParams.get("error");
  if (errorCode || errorDescription) {
    return { kind: "error", message: errorDescription ?? errorCode ?? "Erro desconhecido" };
  }

  const code = queryParams.get("code");
  if (code) return { kind: "code", code };

  const accessToken = fragmentParams.get("access_token");
  const refreshToken = fragmentParams.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "tokens", accessToken, refreshToken };
  }
  if (accessToken || refreshToken) {
    return { kind: "error", message: "Resposta de login incompleta." };
  }

  return { kind: "ignore" };
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
npx vitest run src/lib/nativeAuth.test.ts
```

Expected: PASS (13 testes).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/nativeAuth.ts src/lib/nativeAuth.test.ts
git commit -m @'
feat(mobile): helpers de deep link de auth (redirect por plataforma + parser do callback)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 3: `flowType: pkce` só no nativo em `src/lib/supabase.ts`

**Files:**
- Modify: `src/lib/supabase.ts:33-36`

**Interfaces:**
- Consumes: `isNativePlatform()` da Task 2 (`./nativeAuth` — sem import circular: `nativeAuth.ts` não importa nada).
- Produces: client Supabase que no nativo gera `?code=` + verifier local (PKCE) e na web mantém o flow implicit atual.

- [ ] **Step 1: Alterar a criação do client**

Em `src/lib/supabase.ts`, adicionar o import no topo (junto dos imports existentes):

```ts
import { isNativePlatform } from "./nativeAuth";
```

E trocar o `createClient` final (hoje sem options) por:

```ts
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? rawUrl : fallbackUrl,
  isSupabaseConfigured ? rawKey : fallbackKey,
  {
    auth: {
      // PKCE só no app nativo: o retorno via custom scheme pode ser interceptado
      // por outro app; com PKCE o `?code=` é inútil sem o verifier local.
      // Na web mantém o flow implicit (comportamento atual, inalterado).
      flowType: isNativePlatform() ? "pkce" : "implicit",
    },
  },
);
```

- [ ] **Step 2: Rodar a suíte inteira (nada pode quebrar)**

```powershell
npm test
```

Expected: PASS — todos os testes existentes verdes (os que precisam mockam `@/lib/supabase`).

- [ ] **Step 3: Type-check**

```powershell
npx tsc -b
```

Expected: sem erros (exit 0, sem output).

- [ ] **Step 4: Commit**

```powershell
git add src/lib/supabase.ts
git commit -m @'
feat(mobile): flowType PKCE no client Supabase quando nativo (web segue implicit)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 4: Redirects do AuthContext + Google via Custom Tab no nativo

**Files:**
- Modify: `src/contexts/AuthContext.tsx:224-273` (os 4 métodos com redirect)
- Test: `src/contexts/AuthContext.signInWithGoogle.test.tsx` (novo)

**Interfaces:**
- Consumes: `authRedirectUrl(path)`, `isNativePlatform()` (Task 2); `Browser.open({ url })` de `@capacitor/browser` (Task 1) via dynamic import.
- Produces: `signInWithGoogle()` que no nativo abre Custom Tab e resolve (retorno vem pelo deep link — Task 5); os 4 redirects usando `authRedirectUrl("/me")`.

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `src/contexts/AuthContext.signInWithGoogle.test.tsx`:

```tsx
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOAuthMock = vi.fn();
const browserOpenMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithOAuth: (...args: unknown[]) => signInWithOAuthMock(...args),
    },
  },
}));

vi.mock("@capacitor/browser", () => ({
  Browser: { open: (...args: unknown[]) => browserOpenMock(...args) },
}));

import { AuthProvider, useAuth } from "@/contexts/AuthContext";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

const wrapper = ({ children }: PropsWithChildren) => <AuthProvider>{children}</AuthProvider>;

describe("signInWithGoogle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithOAuthMock.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/x" },
      error: null,
    });
  });

  afterEach(() => {
    delete (window as WindowWithCapacitor).Capacitor;
  });

  it("na web usa redirect da página pra origin/me (sem skipBrowserRedirect)", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.signInWithGoogle());
    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/me` },
    });
    expect(browserOpenMock).not.toHaveBeenCalled();
  });

  it("no nativo usa deep link + skipBrowserRedirect e abre o Custom Tab", async () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.signInWithGoogle());
    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "br.com.gestmiles.app://auth-callback",
        skipBrowserRedirect: true,
      },
    });
    expect(browserOpenMock).toHaveBeenCalledWith({ url: "https://accounts.google.com/o/oauth2/x" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npx vitest run src/contexts/AuthContext.signInWithGoogle.test.tsx
```

Expected: FAIL — o teste "no nativo…" falha (hoje não existe ramo nativo nem `skipBrowserRedirect`); o teste "na web…" já passa.

- [ ] **Step 3: Implementar no AuthContext**

Em `src/contexts/AuthContext.tsx`, adicionar o import:

```ts
import { authRedirectUrl, isNativePlatform } from "@/lib/nativeAuth";
```

Trocar os 4 redirects (mantendo o resto de cada método idêntico):

1. `signInWithMagicLink` — `emailRedirectTo: authRedirectUrl("/me")` (era `` `${window.location.origin}/me` ``).
2. `signUpWithPassword` — `options: { emailRedirectTo: authRedirectUrl("/me") }` (atualizar o comentário de "Mesmo destino do magic link / OAuth" pra mencionar que no app nativo vira o deep link).
3. `resendConfirmation` — `options: { emailRedirectTo: authRedirectUrl("/me") }`.
4. `signInWithGoogle` — substituir o método inteiro por:

```ts
  const signInWithGoogle = useCallback(async () => {
    if (isNativePlatform()) {
      // Google bloqueia OAuth em WebView (disallowed_useragent): abre em
      // Chrome Custom Tab e o retorno chega pelo deep link (NativeAuthDeepLinkHandler).
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: authRedirectUrl("/me"), skipBrowserRedirect: true },
      });
      if (error) throw error;
      if (data?.url) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: data.url });
      }
      return;
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: authRedirectUrl("/me"),
      },
    });
    if (error) throw error;
  }, []);
```

- [ ] **Step 4: Rodar e ver passar + suíte inteira**

```powershell
npx vitest run src/contexts/AuthContext.signInWithGoogle.test.tsx
npm test
```

Expected: PASS nos 2 novos e em toda a suíte.

- [ ] **Step 5: Commit**

```powershell
git add src/contexts/AuthContext.tsx src/contexts/AuthContext.signInWithGoogle.test.tsx
git commit -m @'
feat(mobile): redirects de auth por plataforma e Google via Custom Tab no app

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 5: `NativeAuthDeepLinkHandler` + wire no App.tsx

**Files:**
- Create: `src/components/NativeAuthDeepLinkHandler.tsx`
- Modify: `src/App.tsx:98-99` (render dentro do `BrowserRouter`) + import
- Test: `src/components/NativeAuthDeepLinkHandler.test.tsx`

**Interfaces:**
- Consumes: `isNativePlatform()` e `parseAuthCallbackUrl(url)` (Task 2); `supabase.auth.exchangeCodeForSession(code)` / `setSession({ access_token, refresh_token })`; `App.addListener("appUrlOpen", cb)` e `App.getLaunchUrl()` de `@capacitor/app` (Task 1); `Browser.close()`; `toast.error` do sonner (Toaster já montado no App).
- Produces: componente default-export sem UI que estabelece a sessão a partir do deep link e navega (`/me` sucesso, `/auth` erro).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/components/NativeAuthDeepLinkHandler.test.tsx`:

```tsx
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return { ...original, useNavigate: () => navigateMock };
});

const listenerRemoveMock = vi.fn();
let appUrlOpenCallback: ((event: { url: string }) => void) | null = null;
let launchUrl: string | null = null;

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async (_event: string, cb: (event: { url: string }) => void) => {
      appUrlOpenCallback = cb;
      return { remove: listenerRemoveMock };
    }),
    getLaunchUrl: vi.fn(async () => (launchUrl ? { url: launchUrl } : undefined)),
  },
}));

const browserCloseMock = vi.fn();
vi.mock("@capacitor/browser", () => ({
  Browser: { close: (...args: unknown[]) => browserCloseMock(...args) },
}));

const exchangeCodeForSessionMock = vi.fn();
const setSessionMock = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) => exchangeCodeForSessionMock(...args),
      setSession: (...args: unknown[]) => setSessionMock(...args),
    },
  },
}));

const toastErrorMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

import NativeAuthDeepLinkHandler from "./NativeAuthDeepLinkHandler";

const DEEP_LINK = "br.com.gestmiles.app://auth-callback";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

const renderHandler = () =>
  render(
    <MemoryRouter>
      <NativeAuthDeepLinkHandler />
    </MemoryRouter>,
  );

describe("NativeAuthDeepLinkHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appUrlOpenCallback = null;
    launchUrl = null;
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });
    setSessionMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    delete (window as WindowWithCapacitor).Capacitor;
  });

  it("na web não registra listener", async () => {
    delete (window as WindowWithCapacitor).Capacitor;
    renderHandler();
    const { App } = await import("@capacitor/app");
    await Promise.resolve();
    expect(App.addListener).not.toHaveBeenCalled();
  });

  it("troca ?code= por sessão e navega pro /me", async () => {
    renderHandler();
    await waitFor(() => expect(appUrlOpenCallback).not.toBeNull());
    appUrlOpenCallback?.({ url: `${DEEP_LINK}?code=abc` });
    await waitFor(() => expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc"));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/me", { replace: true }));
  });

  it("estabelece sessão por tokens no fragment (rota do E2E via adb)", async () => {
    renderHandler();
    await waitFor(() => expect(appUrlOpenCallback).not.toBeNull());
    appUrlOpenCallback?.({ url: `${DEEP_LINK}#access_token=at&refresh_token=rt` });
    await waitFor(() =>
      expect(setSessionMock).toHaveBeenCalledWith({ access_token: "at", refresh_token: "rt" }),
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/me", { replace: true }));
  });

  it("erro do GoTrue vira toast e volta pro /auth", async () => {
    renderHandler();
    await waitFor(() => expect(appUrlOpenCallback).not.toBeNull());
    appUrlOpenCallback?.({ url: `${DEEP_LINK}?error=access_denied&error_description=Cancelado` });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith("/auth", { replace: true });
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });

  it("falha no exchange vira toast e volta pro /auth", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: new Error("invalid code") });
    renderHandler();
    await waitFor(() => expect(appUrlOpenCallback).not.toBeNull());
    appUrlOpenCallback?.({ url: `${DEEP_LINK}?code=ruim` });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith("/auth", { replace: true });
  });

  it("processa o launch URL do cold start e deduplica com o evento", async () => {
    launchUrl = `${DEEP_LINK}?code=cold`;
    renderHandler();
    await waitFor(() => expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("cold"));
    appUrlOpenCallback?.({ url: `${DEEP_LINK}?code=cold` });
    await Promise.resolve();
    expect(exchangeCodeForSessionMock).toHaveBeenCalledTimes(1);
  });

  it("ignora deep link que não é o de auth", async () => {
    renderHandler();
    await waitFor(() => expect(appUrlOpenCallback).not.toBeNull());
    appUrlOpenCallback?.({ url: "br.com.gestmiles.app://outra-coisa" });
    await Promise.resolve();
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
    expect(setSessionMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npx vitest run src/components/NativeAuthDeepLinkHandler.test.tsx
```

Expected: FAIL — módulo `./NativeAuthDeepLinkHandler` não existe.

- [ ] **Step 3: Implementar `src/components/NativeAuthDeepLinkHandler.tsx`**

```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { isNativePlatform, parseAuthCallbackUrl } from "@/lib/nativeAuth";
import { supabase } from "@/lib/supabase";

/**
 * Recebe o retorno de OAuth/links de e-mail no app nativo (deep link
 * br.com.gestmiles.app://auth-callback) e estabelece a sessão.
 * Na web não registra nada (no-op).
 */
const NativeAuthDeepLinkHandler = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativePlatform()) return;

    let disposed = false;
    let removeListener: (() => void) | null = null;
    const handledUrls = new Set<string>();

    const closeBrowser = async () => {
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.close();
      } catch {
        // Browser.close() não é implementado em todo Android; o deep link já traz o app pra frente.
      }
    };

    const handleUrl = async (url: string) => {
      const parsed = parseAuthCallbackUrl(url);
      if (parsed.kind === "ignore") return;
      // No cold start o mesmo deep link pode chegar por getLaunchUrl E appUrlOpen.
      if (handledUrls.has(url)) return;
      handledUrls.add(url);

      await closeBrowser();

      if (parsed.kind === "error") {
        toast.error("Não foi possível concluir o login.", { description: parsed.message });
        navigate("/auth", { replace: true });
        return;
      }

      try {
        if (parsed.kind === "code") {
          const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (error) throw error;
        } else {
          const { error } = await supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });
          if (error) throw error;
        }
        navigate("/me", { replace: true });
      } catch (err) {
        console.warn("[NativeAuthDeepLink] falha ao estabelecer sessão:", err);
        toast.error("Não foi possível concluir o login. Tente novamente.");
        navigate("/auth", { replace: true });
      }
    };

    void (async () => {
      const { App: CapacitorApp } = await import("@capacitor/app");

      const handle = await CapacitorApp.addListener("appUrlOpen", (event) => {
        void handleUrl(event.url);
      });
      if (disposed) {
        void handle.remove();
        return;
      }
      removeListener = () => void handle.remove();

      // App fechado + deep link = cold start: o evento pode disparar antes do
      // listener existir; getLaunchUrl cobre esse caminho (o Set deduplica).
      const launch = await CapacitorApp.getLaunchUrl();
      if (launch?.url) void handleUrl(launch.url);
    })();

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, [navigate]);

  return null;
};

export default NativeAuthDeepLinkHandler;
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
npx vitest run src/components/NativeAuthDeepLinkHandler.test.tsx
```

Expected: PASS (7 testes).

- [ ] **Step 5: Montar no App.tsx**

Em `src/App.tsx`, adicionar o import junto dos componentes:

```tsx
import NativeAuthDeepLinkHandler from "@/components/NativeAuthDeepLinkHandler";
```

E renderizar como primeiro filho do `BrowserRouter` (antes do `Suspense`):

```tsx
          <BrowserRouter>
            <NativeAuthDeepLinkHandler />
            <Suspense fallback={<RouteLoading />}>
```

- [ ] **Step 6: Suíte inteira + type-check**

```powershell
npm test
npx tsc -b
```

Expected: tudo verde, tsc sem erros.

- [ ] **Step 7: Commit**

```powershell
git add src/components/NativeAuthDeepLinkHandler.tsx src/components/NativeAuthDeepLinkHandler.test.tsx src/App.tsx
git commit -m @'
feat(mobile): handler do deep link de auth (appUrlOpen -> sessao -> /me)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 6: Verificação estática completa + APK de debug

**Files:** nenhum novo (só builds).

**Interfaces:**
- Consumes: tudo das Tasks 1–5.
- Produces: `android\app\build\outputs\apk\debug\app-debug.apk` com o deep link, pra Task 7.

- [ ] **Step 1: Gates de código**

```powershell
npx tsc -b
npm test
npm run lint
npm run build
```

Expected: todos exit 0; nenhum erro novo de lint nos arquivos tocados.

- [ ] **Step 2: Build mobile + sync**

```powershell
npm run mobile:sync
```

Expected: build `--mode mobile` ok + `cap sync android` com os 2 plugins.

- [ ] **Step 3: APK de debug**

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
Set-Location android
.\gradlew.bat assembleDebug
Set-Location ..
```

Expected: **`BUILD SUCCESSFUL`** no output (obrigatório conferir — adb install de APK velho passa silenciosamente). Se falhar com "Unable to delete directory …intermediates": `Remove-Item android/app/build -Recurse -Force` e repetir.

- [ ] **Step 4: Commit (se o sync alterou arquivos versionados do android/)**

```powershell
git status --short
git add android/
git commit -m @'
chore(mobile): sync capacitor pos-build

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

(Se `git status` vier limpo, pular o commit.)

---

### Task 7: E2E no device físico via adb (sem e-mail/Google)

**Files:** nenhum (script efêmero no scratchpad).

**Interfaces:**
- Consumes: APK da Task 6; conta smoke (`smoke-usuario@gestmiles.com.br` — senha na memória da sessão/env local, NÃO commitar); `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` do `.env.local`.
- Produces: evidência (screenshot) de sessão estabelecida via deep link no device.

- [ ] **Step 1: Instalar o APK no device**

```powershell
adb devices
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Expected: device listado e `Success` no install. (Xiaomi do owner já tem depuração USB + "Instalar via USB" ativos.)

- [ ] **Step 2: Zerar o estado do app (garante que não há sessão prévia)**

```powershell
adb shell pm clear br.com.gestmiles.app
```

Expected: `Success`.

- [ ] **Step 3: Obter tokens reais por senha (conta smoke)**

No PowerShell (não imprimir tokens):

```powershell
$envMap = @{}
Get-Content .env.local | Where-Object { $_ -match '^\s*VITE_SUPABASE_(URL|ANON_KEY)\s*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2; $envMap[$k.Trim()] = $v.Trim()
}
$body = @{ email = "smoke-usuario@gestmiles.com.br"; password = "<SENHA_SMOKE>" } | ConvertTo-Json
$resp = Invoke-RestMethod -Method Post -Uri "$($envMap['VITE_SUPABASE_URL'])/auth/v1/token?grant_type=password" -Headers @{ apikey = $envMap['VITE_SUPABASE_ANON_KEY'] } -ContentType "application/json" -Body $body
"tokens ok: $([bool]$resp.access_token -and [bool]$resp.refresh_token)"
```

Expected: `tokens ok: True`. (`<SENHA_SMOKE>` = senha da conta smoke registrada na memória; nunca vai pra arquivo versionado.)

- [ ] **Step 4: Disparar o deep link com o app FECHADO (testa o caminho de cold start)**

```powershell
adb shell am force-stop br.com.gestmiles.app
adb shell "am start -a android.intent.action.VIEW -d 'br.com.gestmiles.app://auth-callback#access_token=$($resp.access_token)&refresh_token=$($resp.refresh_token)'"
```

Expected: app abre (abertura Constelação) e cai LOGADO no dashboard com dados reais. Se aparecer modal NPS/CSAT, dispensar com "Depois" (não sujar prod).

- [ ] **Step 5: Evidência**

```powershell
adb shell screencap -p /sdcard/deeplink-e2e.png
adb pull /sdcard/deeplink-e2e.png "$env:TEMP\deeplink-e2e.png"
adb shell rm /sdcard/deeplink-e2e.png
```

(NÃO usar `adb exec-out … > arquivo` no PowerShell 5.1 — a redireção converte o binário e corrompe o PNG.)

Ler o PNG (tool Read) e confirmar: dashboard logado (não a tela /auth).

- [ ] **Step 6: Teste do caso de erro (app aberto)**

```powershell
adb shell "am start -a android.intent.action.VIEW -d 'br.com.gestmiles.app://auth-callback?error=access_denied&error_description=Teste'"
```

Expected: app vem pra frente, toast "Não foi possível concluir o login." e navegação pra tela de login (a sessão do Step 4 continua válida no storage; o redirect pro /auth é só navegação — comportamento esperado do handler; voltar pro app/relançar cai logado de novo).

- [ ] **Step 7: Registrar evidência no PR (sem commit de código)**

Guardar o resultado (BUILD SUCCESSFUL, tokens ok, screenshot confere) pro corpo do PR na Task 8.

---

### Task 8: Config do dashboard (owner), Google real e PR

**Files:** nenhum.

- [ ] **Step 1: Pedir ao owner a config no Supabase (projeto compartilhado `jntkpcjmmnaghmimdcam`)**

Dashboard → **Authentication → URL Configuration → Redirect URLs** → **Add URL**:

```
br.com.gestmiles.app://auth-callback
```

(Aditivo; não mexer em Site URL. Sem isso o GoTrue ignora o `redirect_to` do app e cai no Site URL — o Google real não volta pro app.)

- [ ] **Step 2: Teste real do Google no aparelho (owner)**

No app: "Continuar com Google" → Custom Tab abre o Google → escolher conta → deve voltar pro app já logado no dashboard. (Só funciona depois do Step 1.)

- [ ] **Step 3: Abrir PR**

```powershell
git push -u origin feat/mobile-auth-deep-links
gh pr create --title "feat(mobile): deep links de auth no app Android (Google OAuth + links de e-mail)" --body "<corpo com resumo do design, evidência da Task 6/7 (tsc/test/build/APK/screenshot) e nota do passo de dashboard>"
```

Corpo do PR termina com:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 4: Merge (após owner validar) e follow-ups**

Merge via PR (main recebe trabalho paralelo — nunca push direto). Depois do merge: atualizar o APK do device com o main, atualizar a memória da frente mobile (fase 1 concluída; próxima = IAP/RevenueCat).
