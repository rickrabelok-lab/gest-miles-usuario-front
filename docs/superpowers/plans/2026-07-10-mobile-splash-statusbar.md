# Splash nativa + status bar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boot do app sem flash: splash nativa com o ícone "ponto" no fundo ink `#050008` segurada até a abertura Constelação pintar, e status bar escura durante a abertura → clara (`#F7F7F8`, ícones escuros) no app.

**Architecture:** `@capacitor/splash-screen` com `launchAutoHide: false` (config) + atributos do Splash API no launch theme (styles.xml); o script inline da abertura no `index.html` (dono da timeline) chama `SplashScreen.hide` no 1º frame pintado e vira a `StatusBar` nos marcos existentes (start/fade) — tudo best-effort via `window.Capacitor.Plugins`, gated no `nativo`.

**Tech Stack:** Capacitor 8 (`@capacitor/splash-screen` + `@capacitor/status-bar` — novos), Android Splash Screen API (12+), script vanilla no index.html.

**Spec:** `docs/superpowers/specs/2026-07-10-mobile-splash-statusbar-design.md`

## Global Constraints

- Branch: `feat/mobile-splash-statusbar` (já criada; spec commitada).
- Web 100% inalterada: na web o nó da abertura segue removido imediatamente e NENHUMA chamada de plugin acontece (gate `nativo` existente).
- SEM edge-to-edge: nenhuma tela muda de layout; safe-areas intocadas.
- Cores verbatim: ink `#050008` (splash/abertura/barra escura) e `#F7F7F8` (barra clara do app). Ícone da splash = `@mipmap/ic_launcher_foreground` (existente, da identidade).
- Toda chamada de plugin no index.html é best-effort (try + `.catch`) — plugin ausente nunca quebra o boot.
- Sem superfície de unit test nova (config + script inline, padrão do PR #69); os gates + smoke em device são a verificação.
- Gates: `npx tsc -b` + `npm test` + `npm run lint` + `npm run build`; `BUILD SUCCESSFUL` antes de `adb install`; adb via `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"`.
- Copy/commits PT-BR + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. ⚠️ COMMITS SEMPRE NA TOOL POWERSHELL (here-string `@'...'@`, `'@` na coluna 0) — NUNCA em bash (corrompe a mensagem com `@`).
- NUNCA commitar ruído pré-existente: `.claude/settings.local.json`, `CLAUDE.md`, `backend/.gitignore`.
- Shell: Windows PowerShell 5.1 (sem `&&`).

---

### Task 1: Plugins `@capacitor/splash-screen` + `@capacitor/status-bar`

**Files:**
- Modify: `package.json` / `package-lock.json` (npm install)
- Modify (regenerados): `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`

**Interfaces:**
- Produces: plugins registrados (sync deve listar **7**); confirmação da API que a Task 3 usa via proxy `window.Capacitor.Plugins`: `SplashScreen.hide({ fadeOutDuration })`, `StatusBar.setStyle({ style: "DARK" | "LIGHT" })` (enum `Style.Dark = 'DARK'`/`Style.Light = 'LIGHT'` no .d.ts), `StatusBar.setBackgroundColor({ color })`.

- [ ] **Step 1: Instalar**

```powershell
npm install @capacitor/splash-screen @capacitor/status-bar
```

Conferir majors compatíveis com `@capacitor/core` ^8.x (`npm ls @capacitor/core`).

- [ ] **Step 2: Sync**

```powershell
npm run mobile:sync
```

Expected: "Found 7 Capacitor plugins for android", sem erro.

- [ ] **Step 3: Conferir API nos .d.ts instalados**

Ler os `definitions.d.ts` dos 2 pacotes e confirmar: `hide(options?: { fadeOutDuration?: number })`; enum `Style` com valores string `'DARK'`/`'LIGHT'`; `setBackgroundColor({ color: string })`. Divergências → anotar assinatura real no report (Task 3 usa o que você anotar).

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json android/app/capacitor.build.gradle android/capacitor.settings.gradle
git commit -m @'
feat(mobile): plugins @capacitor/splash-screen+status-bar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 2: Config da splash — `capacitor.config.ts` + `styles.xml`

**Files:**
- Modify: `capacitor.config.ts` (9 linhas hoje)
- Modify: `android/app/src/main/res/values/styles.xml` (estilo `AppTheme.NoActionBarLaunch`)

**Interfaces:**
- Consumes: plugin da Task 1.
- Produces: splash do sistema = ponto no ink, segurada até `SplashScreen.hide()` (Task 3).

- [ ] **Step 1: `capacitor.config.ts`**

Substituir o conteúdo por:

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.gestmiles.app',
  appName: 'Gest Miles',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // O script da abertura (index.html) esconde quando o 1º frame da
      // Constelação estiver pintado — sem flash entre splash e abertura.
      launchAutoHide: false,
    },
  },
};

export default config;
```

- [ ] **Step 2: `styles.xml`**

Trocar o estilo `AppTheme.NoActionBarLaunch` por:

```xml
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <!-- Android 12+: ponto da marca centralizado no ink; pré-12 cai no drawable. -->
        <item name="android:background">@drawable/splash</item>
        <item name="windowSplashScreenBackground">#050008</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
```

(Nada mais no arquivo muda.)

- [ ] **Step 3: Sync + build de sanidade**

```powershell
npm run mobile:sync
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
Set-Location android; .\gradlew.bat assembleDebug; Set-Location ..
```

Expected: **BUILD SUCCESSFUL** (o resource `@mipmap/ic_launcher_foreground` e o theme compilam).

- [ ] **Step 4: Commit**

```powershell
git add capacitor.config.ts android/app/src/main/res/values/styles.xml
git commit -m @'
feat(mobile): splash nativa com o ponto no ink, segurada ate a abertura (launchAutoHide off)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

(Se o sync alterou `android/app/src/main/assets/capacitor.config.json`… esse arquivo é gitignored — conferir com `git status --short`; commitar apenas os 2 arquivos acima.)

---

### Task 3: Script da abertura — hide da splash + timeline da status bar

**Files:**
- Modify: `index.html:359-384` (só o `<script>` da abertura; nada no CSS/SVG)

**Interfaces:**
- Consumes: `window.Capacitor.Plugins.SplashScreen/StatusBar` (Tasks 1–2).

- [ ] **Step 1: Substituir o script da abertura**

Ler o bloco atual (index.html, `<script>` após o SVG da abertura, ~linhas 359-384). Substituir o conteúdo do `<script>` por:

```js
      // Gate da abertura: só no app nativo (Capacitor injeta window.Capacitor antes
      // dos scripts da página). Na web o nó é removido imediatamente.
      (function () {
        var el = document.getElementById("gm-abertura");
        if (!el) return;
        var nativo = !!(
          window.Capacitor &&
          typeof window.Capacitor.isNativePlatform === "function" &&
          window.Capacitor.isNativePlatform()
        );
        var reduz =
          window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        // Plugins nativos (splash/status bar): sempre best-effort — indisponíveis
        // não podem quebrar o boot.
        var plugins = (nativo && window.Capacitor.Plugins) || {};
        function esconderSplash(fadeMs) {
          try {
            if (plugins.SplashScreen) {
              plugins.SplashScreen.hide({ fadeOutDuration: fadeMs }).catch(function () {});
            }
          } catch (e) {}
        }
        function barra(estilo, cor) {
          try {
            if (plugins.StatusBar) {
              plugins.StatusBar.setStyle({ style: estilo }).catch(function () {});
              // Android 15+ pode ignorar a cor (edge-to-edge do sistema); o estilo
              // dos ícones é o que garante o contraste.
              plugins.StatusBar.setBackgroundColor({ color: cor }).catch(function () {});
            }
          } catch (e) {}
        }

        if (!nativo || reduz) {
          el.parentNode.removeChild(el);
          if (nativo) {
            // Abertura pulada (reduced motion): destrava a splash e aplica a barra do app.
            esconderSplash(0);
            barra("LIGHT", "#F7F7F8");
          }
          return;
        }

        el.classList.add("gm-ab-on");
        // 2x rAF = 1º frame da abertura pintado -> splash some (emenda sem flash)
        // e a barra acompanha o ink.
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(function () {
            esconderSplash(150);
            barra("DARK", "#050008");
          });
        });
        window.setTimeout(function () {
          el.classList.add("gm-ab-out");
          barra("LIGHT", "#F7F7F8");
        }, 4900);
        window.setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 5400);
      })();
```

(Timings 4900/5400 e todo o resto do index.html intocados.)

- [ ] **Step 2: Gates de código**

```powershell
npx tsc -b
npm test
npm run lint
npm run build
```

Expected: tudo exit 0 (suíte ~149; nada testa o script inline — proteção é contra regressão do resto).

- [ ] **Step 3: Commit**

```powershell
git add index.html
git commit -m @'
feat(mobile): abertura esconde a splash no 1o frame e rege a status bar (ink -> clara)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 4: APK + smoke no device (estágios do boot)

**Files:** nenhum (builds e verificação).

- [ ] **Step 1: Build + install**

```powershell
npm run mobile:sync
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
Set-Location android; .\gradlew.bat assembleDebug; Set-Location ..
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Expected: 7 plugins no sync; **BUILD SUCCESSFUL**; install `Success`.

- [ ] **Step 2: Smoke de cold start com screenshots por estágio**

Device `ivmbxc7heev8priz` (Xiaomi), app logado. Screenshots via `screencap` no device + `adb pull` (NUNCA `exec-out >`); ler cada PNG antes de afirmar o que mostra. Acordar a tela antes (`input keyevent KEYCODE_WAKEUP`; se travar com PIN, reportar — owner desbloqueia).

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb shell am force-stop br.com.gestmiles.app
& $adb shell input keyevent KEYCODE_WAKEUP
# dispara e captura os estágios (timing aproximado; ajustar se necessário):
& $adb shell "am start -n br.com.gestmiles.app/.MainActivity; sleep 0.6; screencap -p /sdcard/boot-1-splash.png; sleep 1.5; screencap -p /sdcard/boot-2-abertura.png; sleep 4; screencap -p /sdcard/boot-3-app.png"
& $adb pull /sdcard/boot-1-splash.png "$env:TEMP\boot-1-splash.png"
& $adb pull /sdcard/boot-2-abertura.png "$env:TEMP\boot-2-abertura.png"
& $adb pull /sdcard/boot-3-app.png "$env:TEMP\boot-3-app.png"
& $adb shell rm /sdcard/boot-1-splash.png /sdcard/boot-2-abertura.png /sdcard/boot-3-app.png
```

Verificar (lendo os PNGs):
1. `boot-1-splash`: fundo ink com o **ponto** centralizado (não o ícone default com moldura), SEM tela branca.
2. `boot-2-abertura`: Constelação rodando; **status bar com ícones claros** sobre o ink (sem faixa clara no topo).
3. `boot-3-app`: dashboard; **status bar clara com ícones escuros**.
4. Logcat sem erro dos plugins: `& $adb logcat -d -t 200` filtrado por `Capacitor|SplashScreen|StatusBar` — sem stacktrace/erro (avisos ok).

Se o timing errar o estágio (screenshot pegou outro momento), repetir o cold start ajustando os sleeps — a evidência precisa dos 3 estágios.

- [ ] **Step 3: Smoke web (nada mudou)**

O `npm run build` da Task 3 já passou; conferência barata: `npx vite preview` + abrir `/` num fetch (`curl -s http://localhost:4173 | grep -c gm-abertura` → o nó existe no HTML e o script gated remove na web). Alternativa mínima aceitável: confirmar no build (`dist/index.html`) que o script mantém o gate `nativo` antes de qualquer chamada de plugin. Registrar o que foi feito.

- [ ] **Step 4: Commit (só se o sync alterou tracked files)**

`git status --short` → se houver mudanças tracked em `android/`: add + commit `chore(mobile): sync capacitor pos-build` (here-string com trailer). Senão, pular.

---

### Task 5: PR

**Files:** nenhum.

- [ ] **Step 1: Push + PR**

```powershell
git push -u origin feat/mobile-splash-statusbar
gh pr create --title "feat(mobile): splash nativa com o ponto + status bar regida pela abertura" --body "<corpo>"
```

Corpo: resumo (splash Android 12+ com o ponto no ink segurada até o 1º frame da abertura; status bar escura na abertura → clara no app; web intocada — gate nativo), evidência (gates + BUILD SUCCESSFUL + os 3 screenshots de estágio + logcat limpo), nota "sem edge-to-edge por decisão do owner; sem migration; sem espelho no manager". Rodapé:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 2: Registrar pendências**

Merge após owner; pós-merge: APK do main já estará no device (instalado na Task 4 com o conteúdo final, se nada mudar depois); memória da frente mobile (fase 4 concluída; próxima = fase de loja: keystore/App Links/contas + rollout IAP).
