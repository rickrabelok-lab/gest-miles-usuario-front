# Fase de Loja (Android) — AAB assinado: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produzir um `app-release.aab` de release assinado e endurecido (gate do `#access_token`, logs de release confirmados), pronto pra upload no Play Console.

**Architecture:** Assinatura via upload key (modelo Play App Signing) com `signingConfigs.release` no gradle lendo um `keystore.properties` gitignored. Hardening: o ramo de injeção de sessão por tokens (`parseAuthCallbackUrl`) passa a ser gateado por um parâmetro puro `allowTokenInjection`, alimentado pela flag de build `VITE_ALLOW_TOKEN_DEEPLINK` (off no `.env.mobile` versionado; on só no build E2E). `loggingBehavior` pinado no default seguro.

**Tech Stack:** Capacitor 8 (Android), Vite (modo `mobile`), Vitest, Gradle + JBR (OpenJDK 21), keytool/apksigner.

## Global Constraints

- Segredos NUNCA no git nem em `VITE_`: keystore + senhas são gitignored; a flag é pública (só liga/desliga um ramo).
- `.env.mobile` é **versionado** e só aceita valores PÚBLICOS.
- `parseAuthCallbackUrl` deve continuar **pura** (sem ler `import.meta.env` nem Capacitor por dentro).
- Fluxo real de auth = PKCE (`?code=`); o ramo de tokens só serve o E2E.
- Build mobile = `vite build --mode mobile` (build de PRODUÇÃO, `import.meta.env.DEV === false`) — não dá pra gatear por `DEV`.
- Ambiente de build Android: `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`, `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`. `android/gradle.properties` já tem `android.overridePathCheck=true`.
- App id: `br.com.gestmiles.app`. `versionCode 1` / `versionName "1.0"` (primeiro upload).
- `minifyEnabled` segue `false` (fora de escopo).

---

### Task 1: Gate do ramo de tokens em `parseAuthCallbackUrl`

Torna a injeção de sessão por tokens opcional e **desligada por default**, mantendo a função pura e testável. Erros do GoTrue e o fluxo `?code=` (PKCE) seguem inalterados.

**Files:**
- Modify: `src/lib/nativeAuth.ts` (função `parseAuthCallbackUrl`, ~linha 35)
- Test: `src/lib/nativeAuth.test.ts` (bloco `describe("parseAuthCallbackUrl", ...)`)

**Interfaces:**
- Produces: `parseAuthCallbackUrl(url: string, allowTokenInjection?: boolean): AuthCallbackResult` — segundo parâmetro default `false`. Com `false`, tokens no fragment (completos ou incompletos) resultam em `{ kind: "ignore" }`. Com `true`, comportamento atual (`{kind:"tokens"}` ou `{kind:"error"}` p/ incompleto). `code`/`error`/`ignore` inalterados nos dois modos.

- [ ] **Step 1: Atualizar os testes de token existentes p/ passar `true` e adicionar os casos do gate (default/false)**

Em `src/lib/nativeAuth.test.ts`, substituir os dois casos de token atuais e adicionar novos. O bloco `describe("parseAuthCallbackUrl", ...)` fica assim (mantém os casos de scheme/sem-payload/code/error como estão; troca só os de token):

```ts
  it("extrai tokens do fragment quando allowTokenInjection=true", () => {
    expect(
      parseAuthCallbackUrl(
        `${AUTH_DEEP_LINK}#access_token=at&refresh_token=rt&token_type=bearer`,
        true,
      ),
    ).toEqual({ kind: "tokens", accessToken: "at", refreshToken: "rt" });
  });

  it("trata token incompleto como erro quando allowTokenInjection=true", () => {
    expect(parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#access_token=at`, true)).toEqual({
      kind: "error",
      message: "Resposta de login incompleta.",
    });
  });

  it("IGNORA tokens do fragment quando allowTokenInjection=false", () => {
    expect(
      parseAuthCallbackUrl(
        `${AUTH_DEEP_LINK}#access_token=at&refresh_token=rt&token_type=bearer`,
        false,
      ),
    ).toEqual({ kind: "ignore" });
  });

  it("IGNORA token incompleto quando allowTokenInjection=false", () => {
    expect(parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#access_token=at`, false)).toEqual({
      kind: "ignore",
    });
  });

  it("por default (sem 2º arg) NÃO injeta tokens — ignora", () => {
    expect(
      parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#access_token=at&refresh_token=rt`),
    ).toEqual({ kind: "ignore" });
  });

  it("erro do GoTrue no fragment é reportado mesmo com allowTokenInjection=false", () => {
    expect(
      parseAuthCallbackUrl(`${AUTH_DEEP_LINK}#error=server_error&error_description=Oops`, false),
    ).toEqual({ kind: "error", message: "Oops" });
  });
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `npm test -- src/lib/nativeAuth.test.ts`
Expected: FAIL — o caso "IGNORA tokens ... false" e o "por default ... ignora" falham (hoje a função sempre devolve `{kind:"tokens"}`, ignorando o 2º arg que ainda não existe).

- [ ] **Step 3: Implementar o gate na função**

Em `src/lib/nativeAuth.ts`, alterar a assinatura e envolver o bloco de tokens no flag. Substituir da linha da assinatura até o `return { kind: "ignore" };` final:

```ts
export function parseAuthCallbackUrl(
  url: string,
  allowTokenInjection = false,
): AuthCallbackResult {
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

  // Injeção de sessão por tokens no fragment: só é habilitada por build (E2E).
  // Em produção/loja o flag vem `false` e este ramo fica inerte — evita
  // session-fixation via deep link. Fluxo real de auth é PKCE (`?code=`) acima.
  if (allowTokenInjection) {
    const accessToken = fragmentParams.get("access_token");
    const refreshToken = fragmentParams.get("refresh_token");
    if (accessToken && refreshToken) {
      return { kind: "tokens", accessToken, refreshToken };
    }
    if (accessToken || refreshToken) {
      return { kind: "error", message: "Resposta de login incompleta." };
    }
  }

  return { kind: "ignore" };
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `npm test -- src/lib/nativeAuth.test.ts`
Expected: PASS (todos os casos, incluindo os novos do gate).

- [ ] **Step 5: type-check**

Run: `npx tsc -b`
Expected: exit 0. (Nenhum outro caller passa 2 args ainda; `NativeAuthDeepLinkHandler` chama com 1 arg e o default cobre — mas será atualizado na Task 2.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/nativeAuth.ts src/lib/nativeAuth.test.ts
git commit -m "feat(usuario): gate do ramo #access_token em parseAuthCallbackUrl (off por default)"
```

---

### Task 2: Flag de build `VITE_ALLOW_TOKEN_DEEPLINK` + fiação no handler

Liga o gate da Task 1 a uma flag de build pública. Off no `.env.mobile` versionado (build de loja); o build E2E liga via override de env de shell.

**Files:**
- Modify: `src/lib/nativeAuth.ts` (novo helper `isTokenInjectionAllowed`)
- Test: `src/lib/nativeAuth.test.ts` (novo `describe` p/ o helper)
- Modify: `src/components/NativeAuthDeepLinkHandler.tsx` (linha 48 — passar o flag)
- Modify: `.env.mobile` (adicionar `VITE_ALLOW_TOKEN_DEEPLINK=false` + comentário do override E2E)

**Interfaces:**
- Consumes: `parseAuthCallbackUrl(url, allowTokenInjection)` da Task 1.
- Produces: `isTokenInjectionAllowed(): boolean` — retorna `true` sse `import.meta.env.VITE_ALLOW_TOKEN_DEEPLINK === "true"`.

- [ ] **Step 1: Escrever o teste do helper (falha)**

Adicionar em `src/lib/nativeAuth.test.ts` (e incluir `vi` no import do vitest: `import { afterEach, describe, expect, it, vi } from "vitest";`, e `isTokenInjectionAllowed` no import de `./nativeAuth`):

```ts
describe("isTokenInjectionAllowed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("é true só quando VITE_ALLOW_TOKEN_DEEPLINK === 'true'", () => {
    vi.stubEnv("VITE_ALLOW_TOKEN_DEEPLINK", "true");
    expect(isTokenInjectionAllowed()).toBe(true);
  });

  it("é false quando a flag é 'false'", () => {
    vi.stubEnv("VITE_ALLOW_TOKEN_DEEPLINK", "false");
    expect(isTokenInjectionAllowed()).toBe(false);
  });

  it("é false quando a flag está ausente", () => {
    vi.stubEnv("VITE_ALLOW_TOKEN_DEEPLINK", "");
    expect(isTokenInjectionAllowed()).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/nativeAuth.test.ts`
Expected: FAIL — `isTokenInjectionAllowed is not a function` / não exportado.

- [ ] **Step 3: Implementar o helper**

Adicionar em `src/lib/nativeAuth.ts` (perto de `isNativePlatform`):

```ts
/**
 * Flag de build (pública): habilita o ramo de injeção de sessão por tokens no
 * deep link. Off no `.env.mobile` (loja); on só no build E2E. Ver
 * parseAuthCallbackUrl(url, allowTokenInjection).
 */
export function isTokenInjectionAllowed(): boolean {
  return import.meta.env.VITE_ALLOW_TOKEN_DEEPLINK === "true";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/nativeAuth.test.ts`
Expected: PASS.

- [ ] **Step 5: Fiar o flag no handler**

Em `src/components/NativeAuthDeepLinkHandler.tsx`:

- No import da linha 5, adicionar `isTokenInjectionAllowed`:
```ts
import { isNativePlatform, isTokenInjectionAllowed, parseAuthCallbackUrl } from "@/lib/nativeAuth";
```
- Trocar a linha 48 (`const parsed = parseAuthCallbackUrl(url);`) por:
```ts
      const parsed = parseAuthCallbackUrl(url, isTokenInjectionAllowed());
```

- [ ] **Step 6: Adicionar a flag no `.env.mobile`**

Anexar ao fim de `.env.mobile`:

```
# Gate do ramo de injeção de sessão por tokens no deep link (#access_token).
# Público (só liga/desliga um ramo). LOJA/RELEASE: false (ramo inerte — anti
# session-fixation). Build E2E (adb forja login via tokens): sobrescreva no
# shell — bash:  VITE_ALLOW_TOKEN_DEEPLINK=true npm run mobile:sync
#                (PowerShell: $env:VITE_ALLOW_TOKEN_DEEPLINK='true'; npm run mobile:sync)
# Vars de env já existentes no shell têm prioridade sobre .env.[mode] no Vite.
VITE_ALLOW_TOKEN_DEEPLINK=false
```

- [ ] **Step 7: type-check + suíte completa**

Run: `npx tsc -b && npm test`
Expected: exit 0; toda a suíte verde.

- [ ] **Step 8: Commit**

```bash
git add src/lib/nativeAuth.ts src/lib/nativeAuth.test.ts src/components/NativeAuthDeepLinkHandler.tsx .env.mobile
git commit -m "feat(usuario): flag VITE_ALLOW_TOKEN_DEEPLINK gateia injeção de sessão (off na loja)"
```

---

### Task 3: Pinar `loggingBehavior` no default seguro

Fixa o comportamento de log do Capacitor no default `'debug'` (silencioso em release, ativo em debug pro E2E). Pin defensivo — evita flip acidental pra `'production'`.

**Files:**
- Modify: `capacitor.config.ts`

**Interfaces:** nenhuma (config).

- [ ] **Step 1: Adicionar `loggingBehavior` ao config**

Em `capacitor.config.ts`, adicionar a chave top-level (entre `webDir` e `plugins`):

```ts
const config: CapacitorConfig = {
  appId: 'br.com.gestmiles.app',
  appName: 'Gest Miles',
  webDir: 'dist',
  // Default do Capacitor. Explícito pra travar a intenção: logs da bridge
  // (incl. a URL do deep link em appUrlOpen) só saem em builds DEBUG; o build
  // de release/loja fica silencioso. Não trocar pra 'production'.
  loggingBehavior: 'debug',
  plugins: {
    SplashScreen: {
      // O script da abertura (index.html) esconde quando o 1º frame da
      // Constelação estiver pintado — sem flash entre splash e abertura.
      launchAutoHide: false,
    },
  },
};
```

- [ ] **Step 2: type-check (valida o tipo do CapacitorConfig)**

Run: `npx tsc -b`
Expected: exit 0. (Se `loggingBehavior` não for aceito no tipo, o `tsc` acusa — nesse caso o valor/local está errado.)

- [ ] **Step 3: Commit**

```bash
git add capacitor.config.ts
git commit -m "chore(usuario): pin loggingBehavior='debug' (release silencioso, mantém E2E)"
```

---

### Task 4: Assinatura de release (upload key + signingConfig no gradle)

Gera a upload key, guarda credenciais gitignored e configura o buildType `release` pra assinar. Fallback pro debug signing quando o keystore não existe (build de outra máquina não quebra).

**Files:**
- Create: `android/gestmiles-upload.keystore` (gitignored — binário)
- Create: `android/keystore.properties` (gitignored)
- Modify: `android/.gitignore` (descomentar `*.jks`/`*.keystore` + adicionar `keystore.properties`)
- Modify: `android/app/build.gradle` (carregar properties + `signingConfigs.release` + `signingConfig` no `release`)

**Interfaces:** nenhuma de código (build config).

- [ ] **Step 1: Ignorar keystore + properties ANTES de criá-los**

Em `android/.gitignore`, na seção "Keystore files", descomentar as duas linhas e adicionar o properties:

```
# Keystore files
*.jks
*.keystore
keystore.properties
```

- [ ] **Step 2: Confirmar que estão ignorados**

Run (bash):
```bash
git check-ignore android/gestmiles-upload.keystore android/keystore.properties && echo IGNORED
```
Expected: imprime os dois caminhos + `IGNORED` (exit 0 = ignorados).

- [ ] **Step 3: Gerar a upload key (senha forte) e o keystore.properties**

Rodar numa única invocação bash (PKCS12 usa a MESMA senha p/ store e key):

```bash
export JAVA_HOME="C:\\Program Files\\Android\\Android Studio\\jbr"
PW=$(openssl rand -base64 24)
"$JAVA_HOME/bin/keytool" -genkeypair -v \
  -keystore "android/gestmiles-upload.keystore" \
  -storetype PKCS12 \
  -alias gestmiles-upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$PW" -keypass "$PW" \
  -dname "CN=Gest Miles, OU=Mobile, O=Gest Miles, L=Vitoria, ST=ES, C=BR"
cat > android/keystore.properties <<EOF
storeFile=gestmiles-upload.keystore
storePassword=$PW
keyAlias=gestmiles-upload
keyPassword=$PW
EOF
echo "=== GUARDE ESTA SENHA (upload key) ==="; echo "$PW"
```
Expected: keystore criado; `keystore.properties` escrito; a senha impressa **uma vez** — entregar ao owner pra salvar no password manager.

- [ ] **Step 4: Verificar o keystore**

Run (bash):
```bash
"$JAVA_HOME/bin/keytool" -list -v -keystore android/gestmiles-upload.keystore \
  -storepass "$(grep storePassword android/keystore.properties | cut -d= -f2)" | head -20
```
Expected: lista 1 entrada `gestmiles-upload`, `PrivateKeyEntry`, algoritmo `RSA`, validade ~27 anos. Anotar o SHA-256 (será útil pro assetlinks.json na fase pós-upload).

- [ ] **Step 5: Wire do signingConfig no build.gradle**

Em `android/app/build.gradle`, no topo (após `apply plugin: 'com.android.application'`), adicionar o carregamento das properties:

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Dentro do bloco `android { ... }`, adicionar `signingConfigs` (antes de `buildTypes`):

```gradle
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
```

E no `buildTypes.release`, adicionar a primeira linha `signingConfig`:

```gradle
    buildTypes {
        release {
            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
```

- [ ] **Step 6: Verificar que o build.gradle é o único arquivo versionado alterado**

Run (bash):
```bash
git status --short android/
```
Expected: só `android/.gitignore` e `android/app/build.gradle` como modificados. `gestmiles-upload.keystore` e `keystore.properties` **NÃO aparecem** (ignorados). Se aparecerem, PARAR — o gitignore falhou.

- [ ] **Step 7: Commit (só os arquivos versionados)**

```bash
git add android/.gitignore android/app/build.gradle
git commit -m "build(android): signing de release via upload key (keystore.properties gitignored)"
```

---

### Task 5: Build do AAB assinado + verificação (+ smoke de release no device)

Integra tudo: build de produção com a flag off, sync, bundle de release assinado, e verificação da assinatura. Smoke no device se o Xiaomi estiver disponível.

**Files:** nenhum (build/verificação). Artefato: `android/app/build/outputs/bundle/release/app-release.aab` (gitignored).

> **Preâmbulo (env de build):** exports do shell **não persistem** entre invocações do Bash — cada step abaixo reexporta `JAVA_HOME`/`ANDROID_HOME`. O `cd` roda em subshell `( ... )` pra não mudar o cwd persistente (e não disparar prompt de permissão).

- [ ] **Step 1: Build web (modo mobile, flag off) + sync — limpa build dirs na mesma invocação (armadilha OneDrive)**

Run (bash, do root):
```bash
export JAVA_HOME="C:\\Program Files\\Android\\Android Studio\\jbr"
export ANDROID_HOME="$LOCALAPPDATA\\Android\\Sdk"
npm run build:mobile \
  && rm -rf android/app/build android/app/src/main/assets/public \
  && npx cap sync android
```
Expected: `vite build` OK; `cap sync` copia web assets + regenera `capacitor.config.json` (com `loggingBehavior`). A flag `VITE_ALLOW_TOKEN_DEEPLINK` vem `false` do `.env.mobile` → ramo de tokens inerte neste bundle.

- [ ] **Step 2: Bundle de release (AAB)**

Run (bash, do root):
```bash
export JAVA_HOME="C:\\Program Files\\Android\\Android Studio\\jbr"
export ANDROID_HOME="$LOCALAPPDATA\\Android\\Sdk"
( cd android && ./gradlew.bat bundleRelease )
```
Expected: `BUILD SUCCESSFUL`. Artefato em `android/app/build/outputs/bundle/release/app-release.aab`. **Conferir "BUILD SUCCESSFUL" explicitamente** (armadilha: `adb install` sucede mesmo após BUILD FAILED). Se falhar com "Unable to delete directory .../build" (lock OneDrive), reexecutar o Step 1 (clean+sync) e este Step numa sequência sem gap.

- [ ] **Step 3: Verificar a assinatura do AAB**

Run (bash, do root):
```bash
export JAVA_HOME="C:\\Program Files\\Android\\Android Studio\\jbr"
"$JAVA_HOME/bin/jarsigner" -verify -verbose:summary \
  android/app/build/outputs/bundle/release/app-release.aab | tail -5
```
Expected: `jar verified.` (assinado com a upload key). Se aparecer "jar is unsigned", a signingConfig não pegou — revisar Task 4 (properties/build.gradle).

- [ ] **Step 4 (condicional — device disponível): APK de release + smoke**

Só se o Xiaomi estiver plugado (`adb devices` lista um device). O `bundleRelease` gera AAB (não instalável direto); gerar o APK de release pra smoke:

```bash
export JAVA_HOME="C:\\Program Files\\Android\\Android Studio\\jbr"
export ANDROID_HOME="$LOCALAPPDATA\\Android\\Sdk"
( cd android && ./gradlew.bat assembleRelease )
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n br.com.gestmiles.app/.MainActivity
```

Smoke manual (owner ou via adb):
- (a) **Login e-mail/senha** com a conta smoke (`conta-teste-cliente-smoke`) → chega no dashboard (custom scheme intocado). Dispensar modais NPS/CSAT com "Depois".
- (b) **Gate provado:** forjar um deep link de tokens e confirmar que **NÃO** injeta/loga. Aspas duplas no comando remoto + aspas simples na URL (senão o `&` do fragment corta a URL no shell do device):
  ```bash
  adb logcat -c
  adb shell "am start -a android.intent.action.VIEW -d 'br.com.gestmiles.app://auth-callback#access_token=fake&refresh_token=fake'"
  # esperar ~3s
  adb logcat -d | grep -iE "access_token|NativeAuthDeepLink|setSession" | head
  ```
  Expected: **sem linhas** de sessão estabelecida; o app permanece no estado anterior (ramo inerte → `{kind:"ignore"}`; nenhuma navegação pra `/me`). Bridge silenciosa (release + `loggingBehavior:'debug'`).

Se o device não estiver disponível: pular este step; o AAB verificado por assinatura já é o entregável. Registrar o smoke como pendência do owner.

- [ ] **Step 5: Nenhum commit de artefato**

Confirmar que nada de build entrou no git:
```bash
git status --short
```
Expected: working tree limpo (AAB/APK/keystore todos ignorados). Sem commit neste step.

---

## Verificação final (gates de "pronto")

- [ ] `npx tsc -b` → exit 0
- [ ] `npm test` → suíte verde (inclui novos casos de `parseAuthCallbackUrl` + `isTokenInjectionAllowed`)
- [ ] `npm run build` → OK
- [ ] `gradlew bundleRelease` → BUILD SUCCESSFUL
- [ ] `jarsigner -verify app-release.aab` → jar verified
- [ ] (se device) smoke de release: login OK + deep link de tokens inerte
- [ ] `git status` limpo (nenhum segredo/artefato versionado)

## Entrega ao owner (pós-plano)

- Senha da upload key (impressa no Step 3 da Task 4) → salvar em password manager + backup do `android/gestmiles-upload.keystore`.
- SHA-256 do cert (Step 4 da Task 4) → guardar pro `assetlinks.json` da fase pós-upload (App Links).
- `app-release.aab` pronto pra subir no Play Console (faixa de teste interno primeiro).
