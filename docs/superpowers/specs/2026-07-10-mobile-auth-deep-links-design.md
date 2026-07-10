# Deep links de autenticação no app Android (Capacitor) — Design

**Data:** 2026-07-10
**Status:** aprovado pelo owner (custom scheme agora; App Links ficam pra fase de loja)

## Problema

No app nativo (Capacitor, build `--mode mobile`), os fluxos de auth que dependem de redirect estão quebrados por definição:

- **"Continuar com Google"** (Auth/SignUp): `signInWithOAuth` redireciona o próprio WebView pro Google, e o Google bloqueia login em WebView (`disallowed_useragent`). Além disso o `redirectTo` usa `window.location.origin` = `https://localhost` no app.
- **Confirmação de cadastro** (Confirm email está LIGADO em prod): o link do e-mail volta pra `https://localhost/me` — página morta no browser do celular e sessão perdida.
- **Magic link** (`signInWithMagicLink`): mesmo problema, mas hoje é código morto na UI (nenhuma tela chama). O encanamento deste design o conserta de graça, sem criar UI.

A web NÃO muda em nada.

## Decisões

1. **Deep link por custom scheme** — `br.com.gestmiles.app://auth-callback`. Funciona já no APK de debug, sem depender de domínio nem keystore de release. App Links (https + assetlinks.json) ficam pra fase de publicação nas lojas.
2. **PKCE só no nativo** — o client Supabase é criado com `flowType: "pkce"` apenas quando `window.Capacitor?.isNativePlatform()`; na web permanece o flow default (implicit), zero mudança.
   - Motivo: outro app poderia registrar o mesmo scheme e interceptar o retorno. Com PKCE trafega um `?code=` inútil sem o verifier que fica no localStorage do app; com implicit trafegariam os tokens da sessão inteira.
   - Edge aceito: cadastro feito no app + e-mail de confirmação clicado no desktop não auto-loga no desktop (a conta é confirmada mesmo assim; a pessoa entra com senha).

## Componentes

### 1. Plugins Capacitor (novos)

- `@capacitor/app` — evento `appUrlOpen` (recebe o deep link).
- `@capacitor/browser` — Chrome Custom Tabs (browser de verdade, aceito pelo Google).

`npm install` + `npx cap sync android`.

### 2. AndroidManifest.xml

Intent-filter novo na `MainActivity` (que já tem `launchMode="singleTask"` — retorno não abre segunda instância):

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="br.com.gestmiles.app" android:host="auth-callback" />
</intent-filter>
```

### 3. `src/lib/nativeAuth.ts` (novo)

- `isNativePlatform(): boolean` — lê `window.Capacitor?.isNativePlatform?.()`, safe na web e no jsdom.
- `AUTH_DEEP_LINK = "br.com.gestmiles.app://auth-callback"`.
- `authRedirectUrl(path: string): string` — nativo → `AUTH_DEEP_LINK`; web → `${window.location.origin}${path}`.
- `parseAuthCallbackUrl(url: string)` — **função pura** (unit-testável): reconhece a URL do scheme e extrai, em ordem de precedência:
  - `error`/`error_description` (query ou fragment) → `{ kind: "error", message }`;
  - `?code=` → `{ kind: "code", code }`;
  - `#access_token=…&refresh_token=…` → `{ kind: "tokens", accessToken, refreshToken }`;
  - URL de outro scheme/sem payload → `{ kind: "ignore" }`.

### 4. `src/lib/supabase.ts`

`createClient(..., { auth: { flowType: isNativePlatform() ? "pkce" : "implicit" } })`. Nenhuma outra opção muda (`detectSessionInUrl` segue default; no nativo o WebView nunca carrega tokens na URL).

### 5. `src/contexts/AuthContext.tsx`

- Os 4 pontos de redirect passam a usar `authRedirectUrl("/me")`: `signUpWithPassword`, `resendConfirmation`, `signInWithMagicLink`, `signInWithGoogle`.
- `signInWithGoogle` no nativo: `signInWithOAuth({ provider: "google", options: { redirectTo: AUTH_DEEP_LINK, skipBrowserRedirect: true } })` → `Browser.open({ url: data.url })`. Na web, comportamento atual (redirect da página).

### 6. `src/components/NativeAuthDeepLinkHandler.tsx` (novo)

Componente sem UI, renderizado dentro do `BrowserRouter` (precisa de `useNavigate`). No web é no-op (nem registra listener).

No nativo, registra `App.addListener("appUrlOpen")` e, para URL do scheme:

- `kind: "code"` → `supabase.auth.exchangeCodeForSession(code)`;
- `kind: "tokens"` → `supabase.auth.setSession({ access_token, refresh_token })` (ramo defensivo; é também o que permite E2E via adb sem e-mail/Google);
- sucesso → `Browser.close()` em try/catch (nem toda versão Android implementa) → `navigate("/me", { replace: true })` (o `/me` já faz bootstrap de perfil novo e roteamento por role);
- `kind: "error"` ou falha na troca → toast (sonner) + `navigate("/auth")`;
- `kind: "ignore"` → nada (deep links futuros de outra natureza não passam por aqui).

Cleanup do listener no unmount.

### 7. Config no Supabase (dashboard — ação do owner)

Adicionar `br.com.gestmiles.app://auth-callback` em **Auth → URL Configuration → Redirect URLs** do projeto `jntkpcjmmnaghmimdcam`. Aditivo: não mexe em Site URL nem afeta manager/admin. Sem essa entrada o GoTrue recusa o `redirect_to` e cai no Site URL.

## Fluxos resultantes

**Google no app:** botão → `signInWithOAuth(skipBrowserRedirect)` → Custom Tab abre Google → consentimento → callback do Supabase → 302 pra `br.com.gestmiles.app://auth-callback?code=…` → Android traz o app pra frente → `appUrlOpen` → `exchangeCodeForSession` → `SIGNED_IN` (AuthContext já reage) → `/me` → dashboard.

**Confirmação de cadastro no app:** e-mail → link `verify` do Supabase no browser do celular → confirma → 302 pro deep link com `?code=` → mesmo caminho acima. (PKCE: o verifier está no localStorage do app que iniciou o cadastro — funciona porque é o mesmo aparelho.)

## Verificação

- **Unit (Vitest):** `parseAuthCallbackUrl` (code / tokens / erro / lixo / outro scheme) e `authRedirectUrl` web×nativo (mock de `window.Capacitor`). Suíte existente intacta.
- **Estática/build:** `npx tsc -b` + `npm test` + `npm run build` + `npm run mobile:sync` + `gradlew assembleDebug` (conferir BUILD SUCCESSFUL antes de instalar — lição da memória).
- **Device E2E (sem e-mail/Google):** login por senha da conta smoke via REST → dispara `adb shell am start -a android.intent.action.VIEW -d "br.com.gestmiles.app://auth-callback#access_token=…&refresh_token=…"` → app deve estabelecer sessão e cair no dashboard.
- **Google real:** owner testa no aparelho (conta Google dele) após a config do dashboard.

## Fora de escopo (consciente)

- App Links / assetlinks.json (fase de loja, exige keystore de release).
- iOS.
- Botão/tela de magic link (método fica funcional, UI não existe e não foi pedida).
- Deep link do reset de senha (a página web de reset funciona no browser do celular).
- Réplica no manager (não tem app nativo) e migrations (nenhuma).
