# Fase de Loja (Android) — AAB assinado pronto pra upload

**Data:** 2026-07-17
**Repo:** gest-miles-usuario-front
**Plataforma:** Android (Play Store). iOS fora de escopo.

## Objetivo

Produzir um **App Bundle de release assinado** (`app-release.aab`) e endurecido, pronto
pra upload no Play Console assim que o owner criar a conta ($25). Fecha os itens de
"fase de loja" que **não dependem de conta nenhuma**: assinatura de release + hardening
pré-loja (gate do `#access_token`, logs do deep link no release).

Contexto: as fases mobile 1–4 (deep links de auth, IAP/RevenueCat, ajustes web-only,
splash+status bar) já estão mergeadas e no ar. Ver
`docs/superpowers/specs/2026-07-10-mobile-*`.

## Escopo

### Em escopo (esta entrega)

1. **Assinatura de release (upload key, modelo Play App Signing).**
2. **Hardening — gate do ramo `#access_token` (injeção de sessão via deep link).**
3. **Hardening — desligar log do deep link no build de release.**
4. **Build do `.aab` + verificação de assinatura + smoke de release no device.**

### Fora de escopo (adiado, decisão consciente)

- **App Links / `assetlinks.json`** — precisa do fingerprint SHA-256 do certificado de
  assinatura, que com Play App Signing só existe depois de criar o app no Console. Fica
  pra pós-upload. O custom scheme (`br.com.gestmiles.app://auth-callback`) já cobre o
  retorno de auth.
- **iOS** — precisa de Mac + Apple Developer ($99/ano).
- **Rollout IAP/RevenueCat** — migration `20260710190000_perfis_subscription_provider`
  não aplicada; depende das contas Play/RevenueCat do owner (runbook
  `docs/revenuecat_setup.md`).
- **`minifyEnabled`/R8** — segue `false`. Risco de quebrar plugins Capacitor por ganho
  marginal de tamanho; revisita depois.
- **Ficha da loja, Data Safety, privacy policy, publicar a tela de consent do Google** —
  ações do owner no Console.

## Componentes

### 1. Assinatura de release

**Modelo:** Play App Signing. O Google segura a chave de assinatura real do app; o repo
guarda apenas a **upload key** (recuperável via Play se perder → risco baixo).

**Keystore:**
- Arquivo: `android/gestmiles-upload.keystore` (PKCS12).
- Geração: `keytool -genkeypair -v -keystore gestmiles-upload.keystore
  -alias gestmiles-upload -keyalg RSA -keysize 2048 -validity 10000 -storetype PKCS12`
  (validade ~27 anos; Play exige a chave válida até pelo menos 2033).
- Alias: `gestmiles-upload`.
- Senhas: geradas fortes na implementação e **entregues ao owner** pra guardar em
  password manager (exibidas uma vez no transcript).

**Config de credenciais:** `android/keystore.properties` (gitignored):

```
storeFile=gestmiles-upload.keystore
storePassword=<gerado>
keyAlias=gestmiles-upload
keyPassword=<gerado>
```

**`android/app/build.gradle`:** carregar o `.properties` e adicionar `signingConfigs`:

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    ...
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
    buildTypes {
        release {
            signingConfig keystorePropertiesFile.exists()
                ? signingConfigs.release
                : signingConfigs.debug
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

Fallback pro debug signing quando o `.properties` não existe → build de outra máquina
(sem o keystore) não quebra; só não sai assinado pra loja.

**`.gitignore` (raiz e/ou `android/`):** `*.keystore`, `*.jks`, `keystore.properties`.
O segredo nunca entra no git.

**Custódia (nota pro owner):** gitignored ≠ backup. Guardar keystore + senhas em
password manager. O repo mora no OneDrive → o keystore sincroniza pra nuvem (aceitável
pra upload key; movível pra fora da árvore se o owner preferir).

### 2. Gate do `#access_token`

**Problema:** `src/lib/nativeAuth.ts` → `parseAuthCallbackUrl` interpreta tokens no
fragment (`access_token`/`refresh_token`) e devolve `{kind:"tokens"}`, que o handler usa
pra injetar sessão direto. É a rota do E2E (`adb`), mas em produção é um vetor de
session-fixation (link malicioso logaria a vítima numa conta do atacante). O fluxo real
já é PKCE (`?code=`), então o ramo só serve o E2E.

**Restrição:** o build mobile é `vite build --mode mobile` = build de produção
(`import.meta.env.DEV === false`) mesmo no APK debug. Gatear por `DEV` mataria o E2E.

**Solução — flag de build `VITE_ALLOW_TOKEN_DEEPLINK`:**
- `parseAuthCallbackUrl` continua **pura**: recebe novo parâmetro
  `allowTokenInjection: boolean` (default `false`). Com `false`, todo o bloco de tokens
  é pulado → cai em `{kind:"ignore"}` (não retorna erro; tokens não são fluxo suportado
  em prod).
- O caller (handler de deep link / AuthContext) passa
  `import.meta.env.VITE_ALLOW_TOKEN_DEEPLINK === 'true'`.
- `.env.mobile` (build de loja): `VITE_ALLOW_TOKEN_DEEPLINK=false` (explícito) → ramo
  morto em produção.
- **Build E2E:** liga a flag. Mecanismo (a decidir no plano, sem duplicar `.env.mobile`):
  script `mobile:sync:e2e` que buildar com `VITE_ALLOW_TOKEN_DEEPLINK=true`. Preserva o
  harness de `adb`.
- **Testes:** `parseAuthCallbackUrl` cobre os dois estados — com `allowTokenInjection`
  `true`, tokens válidos → `{kind:"tokens"}`; com `false`, os mesmos tokens →
  `{kind:"ignore"}`. Casos existentes (code/error/ignore) inalterados.

### 3. Logs no release

Correção sobre a semântica do Capacitor (`loggingBehavior` é **top-level**, não
`android.*`, e os valores são: `'none'` = nunca loga; `'debug'` = loga só em builds
debug **[default]**; `'production'` = loga em debug E release). O default `'debug'` já
**silencia** a bridge em release — então o objetivo (release não logar a URL do deep
link) já vem de fábrica; a ação é **pinar o default explicitamente** pra evitar flip
acidental pra `'production'` e documentar a intenção, mantendo o log em debug pro E2E.

- **`capacitor.config.ts`:** adicionar `loggingBehavior: 'debug'` (top-level). Pin
  defensivo; nenhuma mudança de comportamento vs. o default. Web inalterada.
- **Nosso código:** o handler (`NativeAuthDeepLinkHandler.tsx`) **não loga a URL** em
  nenhum ponto; o único log é `console.warn` do objeto de erro na falha de sessão (linha
  ~75) — não contém URL nem token (é o `AuthError` do supabase-js). Fica.
- **Verificação:** build de release + `logcat` ao abrir um deep link, confirmando que a
  URL/tokens não aparecem (bridge silenciosa em release; nosso warn só dispara em erro,
  sem URL).

### 4. Build + verificação

Pipeline:
1. `vite build --mode mobile` (env de prod, `VITE_ALLOW_TOKEN_DEEPLINK=false`).
2. `cap sync android`.
3. `cd android && gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.

Verificações:
- **Assinatura:** `jarsigner -verify app-release.aab` → "jar verified".
- **Smoke de release no device** (precisa do Xiaomi plugado):
  `gradlew assembleRelease` → APK assinado com a mesma config →
  `adb install -r app-release.apk` → confirmar:
  - (a) login e-mail/senha OK via custom scheme (conta smoke,
    ver `conta-teste-cliente-smoke`);
  - (b) deep link com `#access_token` **não** loga nem injeta sessão (gate provado no
    build de loja).
  - Se o device não estiver disponível: entregar o AAB verificado por assinatura e
    deixar o smoke como pendência do owner.

`versionCode`/`versionName` seguem `1`/`"1.0"` (primeiro upload). Play exige incrementar
`versionCode` a cada upload subsequente.

## Riscos & armadilhas conhecidas (do histórico mobile)

- **OneDrive re-hidrata build intermediates entre tentativas** → limpar
  `android/app/build` + `android/app/src/main/assets/public` e rodar `cap copy` +
  gradle numa **única invocação PS** (sem gap pro OneDrive desidratar). `attrib +P`
  não ajuda.
- **`adb install` SUCEDE mesmo após BUILD FAILED** (instala APK velho) → conferir
  "BUILD SUCCESSFUL" antes de instalar.
- **Ambiente de build:** `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`,
  `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`. `android/gradle.properties` já tem
  `android.overridePathCheck=true` (pasta com acento).
- **`vite build` NÃO type-checka** — rodar `tsc -b` à parte.

## Verificação (gates de "pronto")

- `tsc -b` exit 0.
- `npm test` (front) verde, incluindo os novos casos do `parseAuthCallbackUrl`.
- `npm run build` OK.
- `gradlew bundleRelease` → BUILD SUCCESSFUL.
- `jarsigner -verify app-release.aab` → jar verified.
- (se device disponível) smoke de release: login OK + `#access_token` inerte.
