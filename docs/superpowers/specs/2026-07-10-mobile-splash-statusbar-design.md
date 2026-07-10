# Splash nativa + status bar no app (fase mobile 4) — Design

**Data:** 2026-07-10
**Status:** aprovado pelo owner (splash = ícone "ponto" no fundo ink; status bar clara combinando com o app, SEM edge-to-edge)

## Problema

1. **Splash**: o launch theme já é `Theme.SplashScreen` com fundo `#050008` (`drawable/splash.xml`), mas sem o plugin: no Android 12+ o sistema mostra o **ícone default do launcher** na splash (sem controle nosso) e a splash some quando o WebView inicializa — podendo dar **flash branco** entre a splash e a abertura Constelação (timing por sorte).
2. **Status bar**: zero controle. Durante a abertura (~5s de tela ink) a barra fica clara com ícones escuros — contraste quebrado; dentro do app, comportamento default do sistema.

## Decisões (owner, 2026-07-10)

- **Splash**: ícone "ponto" da marca (o `@mipmap/ic_launcher_foreground` da identidade) centralizado no fundo ink `#050008`, segurada pelo plugin até a abertura estar pintada.
- **Status bar**: escura (ícones claros) durante a abertura → clara (bg `#F7F7F8`, ícones escuros) no fade pro app. **SEM edge-to-edge** — nenhuma tela muda de layout; safe-areas seguem como estão (só o BottomNav trata bottom, como hoje).

## Componentes

### 1. Plugins novos

`@capacitor/splash-screen` + `@capacitor/status-bar` (npm install + sync → **7 plugins**).

### 2. `capacitor.config.ts`

```ts
const config: CapacitorConfig = {
  appId: 'br.com.gestmiles.app',
  appName: 'Gest Miles',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // O JS esconde quando a abertura Constelação estiver pintada (index.html).
      launchAutoHide: false,
    },
  },
};
```

### 3. `android/app/src/main/res/values/styles.xml`

`AppTheme.NoActionBarLaunch` (parent `Theme.SplashScreen`, já existente) ganha os atributos do Splash API (Android 12+):

```xml
<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
    <item name="android:background">@drawable/splash</item>
    <item name="windowSplashScreenBackground">#050008</item>
    <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>
    <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
</style>
```

`@drawable/splash` fica como fallback pré-12. Sem novos assets (o foreground do launcher já é a marca da identidade).

### 4. `index.html` — script da abertura (dono da timeline)

O script existente (gate `nativo` + `gm-ab-on` → fade t+4900 → remove t+5400) ganha as chamadas de plugin via `window.Capacitor.Plugins`, todas best-effort (`.catch`/try — plugin ausente nunca quebra o boot):

- **Início (após `gm-ab-on`, em `requestAnimationFrame` pra garantir 1º frame pintado)**: `SplashScreen.hide({ fadeOutDuration: 150 })` + `StatusBar.setStyle({ style: "DARK" })` + `StatusBar.setBackgroundColor({ color: "#050008" })`.
- **No fade (t+4900)**: `StatusBar.setStyle({ style: "LIGHT" })` + `StatusBar.setBackgroundColor({ color: "#F7F7F8" })`.
- **Nativo com `prefers-reduced-motion`** (abertura pulada): `SplashScreen.hide()` imediato + barra clara direto.
- **Web**: caminho atual intocado (nó removido, zero chamadas).

Semântica do plugin StatusBar: `Style.Dark` = barra escura/ícones claros; `Style.Light` = barra clara/ícones escuros (conferir enum de string na versão instalada — via proxy `Plugins.StatusBar` os styles são `"DARK"`/`"LIGHT"`).

Nota calibrada: em Android 15+ `setBackgroundColor` pode ser no-op (edge-to-edge do sistema); o `setStyle` (contraste dos ícones — o que importa) funciona. Confirmar no smoke.

## Fora de escopo (consciente)

Edge-to-edge; dark mode da barra (app é light-only); iOS; mudanças de layout/safe-area; assets novos.

## Verificação

- Fase de config + script inline — **sem superfície de unit test nova** (mesmo padrão do PR #69 da identidade). A suíte existente protege o resto (o `index.html` muda só dentro do script gated).
- **Gates**: `npx tsc -b` + `npm test` + `npm run lint` + `npm run build` + `npm run mobile:sync` (7 plugins) + `gradlew assembleDebug` (BUILD SUCCESSFUL).
- **Device (Xiaomi)**: cold start com screenshot por estágio — (1) splash: ponto no ink; (2) abertura pintada sem flash branco no meio; (3) durante a abertura: barra escura/ícones claros; (4) app: barra clara/ícones escuros; (5) sem crash, logcat sem erro de plugin.
- **Web**: `npm run build` ok + abrir preview ou os testes existentes — comportamento idêntico (abertura removida na web; sem chamadas de plugin; console limpo).
