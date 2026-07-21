# Edge-to-edge real + safe-areas (Android) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebView Android desenha sob as barras do sistema (edge-to-edge real): abertura Constelação cobre a faixa da status bar (ink), headers absorvem a safe-area, teclado/gestos ok — web 100% inalterada.

**Architecture:** Mudança 100% web-side. O `SystemBars` (plugin do core @capacitor/android 8.4.1) liga o passthrough quando o meta viewport tem `viewport-fit=cover` e o WebView é ≥ 140; ele injeta `--safe-area-inset-*` reais e trata o teclado. O app consome via cadeia `var(--gm-safe-*)` definida no `index.css` e aplicada por classes Tailwind arbitrárias nas telas. `@capacitor/status-bar` sai (substituído pelo `SystemBars` do core no script da abertura).

**Tech Stack:** Capacitor 8.4.1 (Android), React 18 + Vite + Tailwind 3, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-21-mobile-edge-to-edge-safe-areas-design.md`

## Global Constraints

- Branch: `feat/mobile-edge-to-edge-safe-areas` (já existe; spec commitada).
- **Web não pode mudar visualmente**: toda classe nova resolve `0px` na web (`var(--gm-safe-*)` → fallback `env()` → `0px`).
- Zero mudança nativa manual: Manifest, styles.xml, MainActivity, gradle intocados (exceto o que `cap sync` gerar na remoção do plugin — esse diff é legítimo e deve ser commitado).
- Commits em PT-BR com escopo (`feat(usuario):` / `chore(usuario):` / `test(usuario):`).
- Gates antes de "pronto": `npx tsc -b` limpo + `npm test` + `npm run build`.
- Tarefas de device (Task 1 e 7) são da **sessão principal** (precisam do Xiaomi via adb + julgamento visual) — não despachar pra subagente.
- ⚠️ OneDrive: se o gradle falhar com "Unable to delete directory .../build/intermediates", rodar numa ÚNICA invocação PS: `Remove-Item` dos build dirs + `assets/public` → `npx cap copy android` → `gradlew assembleDebug` (receita da fase 4).

---

### Task 1: Spike — provar o passthrough no device (SESSÃO PRINCIPAL)

Gate de viabilidade da spec (issue aberto ionic-team/capacitor#8416). Se falhar → PARAR o plano e reportar.

**Files:**
- Modify: `index.html:5`

**Interfaces:**
- Produces: meta viewport com `viewport-fit=cover` (pré-requisito de TODAS as tasks seguintes; Task 2 testa isso).

- [ ] **Step 1: Editar o meta viewport**

`index.html` linha 5, de:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

pra:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 2: Build + instalar no Xiaomi**

PowerShell (repo raiz):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run mobile:sync
Set-Location android; .\gradlew.bat assembleDebug; Set-Location ..
```

Esperado: `BUILD SUCCESSFUL` (conferir ANTES de instalar — adb install sucede com APK velho).

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am force-stop br.com.gestmiles.app
adb shell am start -n br.com.gestmiles.app/.MainActivity
```

- [ ] **Step 3: Screenshot durante a abertura (janela de ~4,9s) e depois no app**

```powershell
# disparar rápido após o start (abertura dura ~4,9s):
adb exec-out screencap -p > "$env:TEMP\spike-abertura.png"
# ~8s depois (app claro):
adb exec-out screencap -p > "$env:TEMP\spike-app.png"
```

Ler as duas imagens. **PASSA se:** na abertura, o ink (#050008) chega até o TOPO físico da tela (faixa clara sumiu). No app claro, o conteúdo do dashboard encosta no topo (vai ficar SOB o relógio — esperado nesta fase, as safe-areas vêm nas Tasks 3-5).

- [ ] **Step 4: Se PASSOU → commit. Se FALHOU → reverter e parar o plano.**

```bash
git add index.html
git commit -m "feat(usuario): viewport-fit=cover — liga o passthrough edge-to-edge do Capacitor 8 (spike validado no device)"
```

---

### Task 2: Variáveis `--gm-safe-*` + teste de shell

**Files:**
- Modify: `src/index.css` (bloco `:root` dentro de `@layer base`, após `--radius: 1rem;`)
- Create: `src/mobile-shell.test.ts`

**Interfaces:**
- Produces: variáveis CSS `--gm-safe-top`, `--gm-safe-bottom`, `--gm-safe-left`, `--gm-safe-right` — consumidas pelas Tasks 3, 4 e 5 via classes Tailwind arbitrárias (`pt-[var(--gm-safe-top)]` etc.).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/mobile-shell.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Shell mobile (edge-to-edge): o meta viewport e as variáveis de safe-area são
// pré-requisitos do passthrough do Capacitor 8 — regressão aqui volta a faixa
// clara da status bar no app Android.
const indexHtml = readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
const indexCss = readFileSync(path.resolve(process.cwd(), "src", "index.css"), "utf-8");

describe("shell mobile — edge-to-edge", () => {
  it("meta viewport declara viewport-fit=cover (gatilho do passthrough)", () => {
    expect(indexHtml).toContain("viewport-fit=cover");
  });

  it("index.css define a cadeia --gm-safe-* (var do Capacitor → env → 0px)", () => {
    expect(indexCss).toContain(
      "--gm-safe-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));",
    );
    expect(indexCss).toContain(
      "--gm-safe-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));",
    );
    expect(indexCss).toContain(
      "--gm-safe-left: var(--safe-area-inset-left, env(safe-area-inset-left, 0px));",
    );
    expect(indexCss).toContain(
      "--gm-safe-right: var(--safe-area-inset-right, env(safe-area-inset-right, 0px));",
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/mobile-shell.test.ts`
Esperado: FAIL no teste do index.css (o do viewport já passa — Task 1 fez).

- [ ] **Step 3: Implementar as variáveis**

Em `src/index.css`, dentro do `:root` do `@layer base`, logo após a linha `--radius: 1rem;`, inserir:

```css
    /* Safe-areas (edge-to-edge Android/iOS): o Capacitor 8 injeta --safe-area-inset-*
       no nativo; env() cobre WebView >= 140; na web tudo resolve 0px. */
    --gm-safe-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
    --gm-safe-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
    --gm-safe-left: var(--safe-area-inset-left, env(safe-area-inset-left, 0px));
    --gm-safe-right: var(--safe-area-inset-right, env(safe-area-inset-right, 0px));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/mobile-shell.test.ts`
Esperado: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/mobile-shell.test.ts
git commit -m "feat(usuario): variáveis --gm-safe-* (cadeia var Capacitor -> env -> 0px) + teste de shell"
```

---

### Task 3: Componentes compartilhados — BottomNav, toast, LegalShell

**Files:**
- Modify: `src/components/BottomNav.tsx:193`
- Modify: `src/components/ui/toast.tsx:17`
- Modify: `src/pages/legal/LegalShell.tsx:15`
- Test: `src/components/BottomNav.test.tsx`

**Interfaces:**
- Consumes: `--gm-safe-top`/`--gm-safe-bottom` (Task 2).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Escrever o teste que falha (BottomNav)**

Em `src/components/BottomNav.test.tsx`, adicionar ao final do `describe` existente (ou num `describe` novo "BottomNav — safe-area"):

```tsx
describe("BottomNav — safe-area", () => {
  beforeEach(() => vi.clearAllMocks());

  it("spacer do rodapé usa a cadeia --gm-safe-bottom (barra de gestos no edge-to-edge)", () => {
    const { container } = renderNav("/");
    expect(container.querySelector('[class="h-[var(--gm-safe-bottom)]"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/BottomNav.test.tsx`
Esperado: FAIL (spacer ainda é `h-[env(safe-area-inset-bottom)]`).

- [ ] **Step 3: Implementar os 3 componentes**

`src/components/BottomNav.tsx:193`, de:

```tsx
      <div className="h-[env(safe-area-inset-bottom)]" />
```

pra:

```tsx
      <div className="h-[var(--gm-safe-bottom)]" />
```

`src/components/ui/toast.tsx:17` — na className do `ToastViewport`, trocar `p-4` por `p-4 pt-[calc(1rem+var(--gm-safe-top))]` (toast no mobile é `fixed top-0`; na web resolve os mesmos 1rem). De:

```tsx
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
```

pra:

```tsx
      "fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 pt-[calc(1rem+var(--gm-safe-top))] sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]",
```

`src/pages/legal/LegalShell.tsx:15` — header estático no topo (bg-white cobre a faixa), de:

```tsx
      <header className="border-b border-nubank-border bg-white">
```

pra:

```tsx
      <header className="border-b border-nubank-border bg-white pt-[var(--gm-safe-top)]">
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/BottomNav.test.tsx`
Esperado: PASS (todos, incluindo os 2 pré-existentes de Passagens).

- [ ] **Step 5: Commit**

```bash
git add src/components/BottomNav.tsx src/components/ui/toast.tsx src/pages/legal/LegalShell.tsx src/components/BottomNav.test.tsx
git commit -m "feat(usuario): safe-areas nos componentes compartilhados (BottomNav, toast viewport, LegalShell)"
```

---

### Task 4: Telas com header sticky/fixed no topo (13 arquivos)

Regra da spec #1: o fundo do header cobre a faixa — adicionar `pt-[var(--gm-safe-top)]` no elemento externo (o padding interno fica intocado). Cada arquivo é uma troca de className exata (usar Edit; se a string não for única no arquivo, incluir contexto da linha).

**Files:** (linha ≈ inventário de 2026-07-21; conferir com o arquivo aberto)
- Modify: `src/pages/ConvideAmigosPage.tsx:86`, `src/pages/ClientePage.tsx:143`, `src/pages/DuvidasPage.tsx:10`, `src/pages/FaleConoscoPage.tsx:49`, `src/pages/CriarAlertaPage.tsx:99`, `src/pages/PreferenciasSugestoesPage.tsx:66`, `src/pages/RegistrarEmissaoPage.tsx:133`, `src/pages/SobreGestMilesPage.tsx:10`, `src/pages/SimularCompraMilhasPage.tsx:307`, `src/pages/EmissionDetailsScreen.tsx:123+191`, `src/pages/PurchaseOptionsScreen.tsx:57+163`, `src/pages/PriceCalendarScreen.tsx:81+120+211`, `src/pages/BonusOffersScreen.tsx:57+83`

**Interfaces:**
- Consumes: `--gm-safe-top`/`--gm-safe-bottom` (Task 2).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Aplicar as trocas (lista exata old → new)**

8 headers padrão (ConvideAmigos:86, ClientePage:143, Duvidas:10, FaleConosco:49, CriarAlerta:99, PreferenciasSugestoes:66, RegistrarEmissao:133, SobreGestMiles:10):

```
sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm
→ sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm pt-[var(--gm-safe-top)]
```

SimularCompraMilhasPage:307 (variante z-30):

```
sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm
→ sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-sm pt-[var(--gm-safe-top)]
```

EmissionDetailsScreen:123 e PurchaseOptionsScreen:57 (variante nubank):

```
sticky top-0 z-40 border-b border-nubank-border bg-white/90 backdrop-blur-sm
→ sticky top-0 z-40 border-b border-nubank-border bg-white/90 backdrop-blur-sm pt-[var(--gm-safe-top)]
```

CTAs fixos no rodapé dessas 2 telas — EmissionDetailsScreen:191:

```
fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-nubank-border bg-white/95 backdrop-blur-sm
→ fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-nubank-border bg-white/95 backdrop-blur-sm pb-[var(--gm-safe-bottom)]
```

PurchaseOptionsScreen:163:

```
fixed inset-x-0 bottom-0 z-40
→ fixed inset-x-0 bottom-0 z-40 pb-[var(--gm-safe-bottom)]
```

PriceCalendarScreen (header fixed :81, compensação :120, CTA :211):

```
fixed inset-x-0 top-0 z-40 flex justify-center bg-nubank-bg/95 backdrop-blur
→ fixed inset-x-0 top-0 z-40 flex justify-center bg-nubank-bg/95 backdrop-blur pt-[var(--gm-safe-top)]

px-4 pb-28 pt-[132px]
→ px-4 pb-28 pt-[calc(132px+var(--gm-safe-top))]

fixed inset-x-0 bottom-0 z-40 flex justify-center bg-gradient-to-t from-nubank-bg via-nubank-bg to-transparent pt-6
→ fixed inset-x-0 bottom-0 z-40 flex justify-center bg-gradient-to-t from-nubank-bg via-nubank-bg to-transparent pt-6 pb-[var(--gm-safe-bottom)]
```

BonusOffersScreen (root :57 recebe o safe-top — header é estático; pills sticky :83 ganham offset, regra da spec #2):

```
mx-auto min-h-screen max-w-md bg-nubank-bg
→ mx-auto min-h-screen max-w-md bg-nubank-bg pt-[var(--gm-safe-top)]

sticky top-0 z-10 flex gap-2 overflow-x-auto bg-nubank-bg/95 px-5 py-2.5 backdrop-blur-sm scrollbar-hide
→ sticky top-[var(--gm-safe-top)] z-10 flex gap-2 overflow-x-auto bg-nubank-bg/95 px-5 py-2.5 backdrop-blur-sm scrollbar-hide
```

⚠️ BonusOffersScreen root: a string `mx-auto min-h-screen max-w-md bg-nubank-bg` (sem sufixo) aparece em outros arquivos e pode não ser única NESTE arquivo — usar contexto (é a div raiz do return, linha ~57).

- [ ] **Step 2: Gates**

Run: `npx tsc -b && npx vitest run`
Esperado: limpo + suíte toda verde (essas telas têm testes existentes — ConvideAmigos, BonusOffers etc. — nenhum deve quebrar: só classes adicionadas).

- [ ] **Step 3: Commit**

```bash
git add src/pages/
git commit -m "feat(usuario): safe-area nos headers sticky/fixed e CTAs fixos (13 telas)"
```

---

### Task 5: Telas sem header sticky — safe-top no container raiz (18 arquivos)

Regra da spec #1 (primeiro bloco absorve) na forma mais simples: `pt-[var(--gm-safe-top)]` no root; onde o root JÁ tem padding-top, vira `calc()`. Tailwind ordena `pt-*` depois de `p-*`/`py-*` no CSS gerado, então o override é confiável.

**Files:**
- Modify (root SEM pt próprio — apenas ACRESCENTAR ` pt-[var(--gm-safe-top)]` ao final da className do root):
  - `src/pages/Index.tsx:1623` — root `mx-auto min-h-screen max-w-md bg-nubank-bg pb-28`
  - `src/pages/ClienteInsightsPage.tsx:50` — idem `pb-28`
  - `src/pages/ClienteTimelinePage.tsx:50` — idem `pb-28`
  - `src/pages/SearchFlightsScreen.tsx:192` — root `min-h-screen bg-nubank-bg`
  - `src/pages/FlightResultsScreen.tsx:124` — root `min-h-screen bg-nubank-bg` (tradeoff consciente: faixa clara acima do hero escuro; ícones escuros legíveis)
  - `src/pages/LoyaltyProgramDetails.tsx:996` — root `mx-auto flex min-h-screen max-w-md flex-col bg-nubank-bg text-nubank-text`
  - `src/pages/VencimentosPage.tsx:322` — root `... pb-28`
  - `src/pages/MinhaEconomiaPage.tsx:79` — root `min-h-screen bg-nubank-bg pb-10`
  - `src/pages/PerfilPage.tsx:117` — root `... pb-28`
  - `src/pages/RadarOportunidadesPage.tsx:163` — root `... pb-28`
  - `src/pages/HistoricoRotasScreen.tsx:19` — root `mx-auto min-h-screen max-w-md bg-nubank-bg`
  - `src/pages/BonusOfferDetailScreen.tsx:76` — root `mx-auto min-h-screen max-w-md bg-nubank-bg`
  - `src/pages/NotificacoesPage.tsx:24` — root `... pb-28`
- Modify (root COM pt próprio — trocar pela forma calc):
  - `src/pages/ClientProfile.tsx:296`: `pt-5` → `pt-[calc(1.25rem+var(--gm-safe-top))]`
  - `src/pages/AssinaturaAppScreen.tsx:111`: `pt-4` → `pt-[calc(1rem+var(--gm-safe-top))]`
  - `src/pages/AssinaturaClientePage.tsx:253` (`p-5 pb-24`) e `:207` (`p-5`): ACRESCENTAR ` pt-[calc(1.25rem+var(--gm-safe-top))]` ao final (o `pt-*` vence o `p-5`)
  - `src/components/auth/AuthFlowShell.tsx:21` (`px-6 py-10`): ACRESCENTAR ` pt-[calc(2.5rem+var(--gm-safe-top))]`
  - `src/pages/AcceptInvite.tsx:86` (`p-5`, centrada): ACRESCENTAR ` pt-[calc(1.25rem+var(--gm-safe-top))]`
- Modify (CTAs fixed bottom dessas telas — ACRESCENTAR ` pb-[var(--gm-safe-bottom)]`):
  - `src/pages/FlightResultsScreen.tsx:348` (`fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-nubank-border bg-white/97 backdrop-blur-sm shadow-lg`) e `:384` (`fixed inset-x-0 bottom-0 z-40`)
  - `src/pages/SearchFlightsScreen.tsx:509` (`pointer-events-auto fixed inset-x-0 bottom-0 z-[100] flex flex-col border-t border-[#F1F0F3] bg-white/95 backdrop-blur-sm`)

**Fora do escopo desta task (decisão da spec):** estados de loading centrados (Auth:49, SignUp:71, ResetPassword:132, AcceptInvite:78), `Me.tsx`, `NotFound.tsx` (conteúdo centrado nunca encosta nas barras), `pages/admin/*` (admin é expulso do app), `ProgramSelectionSheet` (sticky em scroll próprio — no-op).

**Interfaces:**
- Consumes: `--gm-safe-top`/`--gm-safe-bottom` (Task 2).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Aplicar as trocas da lista acima**

⚠️ Strings de root repetem entre arquivos e às vezes DENTRO do arquivo (estados de loading/erro usam roots parecidos). Editar SEMPRE o root do render principal indicado pela linha; incluir contexto no Edit quando a string não for única. Em `Index.tsx` (arquivo de ~1700 linhas) conferir que é o root do return principal (L~1623).

- [ ] **Step 2: Gates**

Run: `npx tsc -b && npx vitest run`
Esperado: limpo + verde (PerfilPage, MinhaEconomia, Notificacoes, Assinatura* têm testes — só classes mudam, nada deve quebrar).

- [ ] **Step 3: Commit**

```bash
git add src/pages/ src/components/auth/AuthFlowShell.tsx
git commit -m "feat(usuario): safe-area no topo das telas sem header sticky + CTAs fixos (18 telas)"
```

---

### Task 6: Abertura usa SystemBars; remover @capacitor/status-bar

**Files:**
- Modify: `index.html:380-431` (função `barra` + call sites + comentários)
- Modify: `package.json` / `package-lock.json` (uninstall)
- Modify (gerados pelo sync — commitar): `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle`, `android/app/src/main/assets/capacitor.plugins.json`
- Test: `src/mobile-shell.test.ts` (estender)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: script da abertura final (Task 7 valida no device).

- [ ] **Step 1: Estender o teste de shell (falha primeiro)**

Adicionar em `src/mobile-shell.test.ts`, dentro do `describe` existente:

```ts
  it("abertura controla as barras via SystemBars (core) — sem plugin StatusBar", () => {
    expect(indexHtml).toContain("plugins.SystemBars");
    expect(indexHtml).not.toContain("plugins.StatusBar");
    expect(indexHtml).not.toContain("setBackgroundColor");
  });
```

Run: `npx vitest run src/mobile-shell.test.ts` → Esperado: FAIL.

- [ ] **Step 2: Reescrever o controle de barra no script da abertura**

Em `index.html`, trocar a função `barra` (linhas ~380-389), de:

```js
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
```

pra (SystemBars é plugin do CORE do Capacitor 8 — sempre registrado; controla os ícones das duas barras: status + gestos):

```js
        function barra(estilo) {
          try {
            if (plugins.SystemBars) {
              plugins.SystemBars.setStyle({ style: estilo }).catch(function () {});
            }
          } catch (e) {}
        }
```

Call sites:

1. Caminho `!el` (linha ~395): `barra("LIGHT", "#F7F7F8");` → `barra("LIGHT");`
2. Caminho reduced-motion/web (linha ~407): `barra("LIGHT", "#F7F7F8");` → `barra("LIGHT");`
3. Primeiro frame da abertura (linha ~422): `barra("LIGHT", "#F7F7F8");` → `barra("DARK");` — com edge-to-edge real a abertura ink cobre a faixa: ícones CLAROS durante a Constelação.
4. **Novo**: no timeout do fade (linha ~425-427), voltar os ícones pro app claro junto do início do fade:

```js
        window.setTimeout(function () {
          el.classList.add("gm-ab-out");
          barra("LIGHT");
        }, 4900);
```

5. Substituir o comentário desatualizado (linhas ~413-417, "…força edge-to-edge: a faixa da status bar mostra o fundo claro da window…") por:

```js
        // Edge-to-edge real (viewport-fit=cover + passthrough do Cap 8): a abertura
        // cobre a tela inteira, incluindo a faixa da status bar. Ícones claros (DARK)
        // durante a Constelação ink; volta pra LIGHT quando o app claro assume no fade.
```

- [ ] **Step 3: Desinstalar o plugin e sincronizar**

```powershell
npm uninstall @capacitor/status-bar
npm run mobile:sync
```

Conferir o diff dos gerados: `git diff --stat android/` — esperado: `capacitor.settings.gradle` e `app/capacitor.build.gradle` sem o projeto `capacitor-status-bar`, `capacitor.plugins.json` sem a entrada StatusBar. Esses diffs são REAIS (não churn) — commitar. Se vier churn de EOL misturado, tudo bem: o conteúdo muda de verdade nesta task.

Conferir que nada no src importa o plugin: `grep -rn "@capacitor/status-bar" src/ backend/src/` → vazio.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/mobile-shell.test.ts`
Esperado: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add index.html src/mobile-shell.test.ts package.json package-lock.json android/capacitor.settings.gradle android/app/capacitor.build.gradle android/app/src/main/assets/capacitor.plugins.json
git commit -m "feat(usuario): abertura com faixa ink via SystemBars (core) + remove @capacitor/status-bar"
```

---

### Task 7: Gates finais + smoke web + smoke device (SESSÃO PRINCIPAL)

**Files:** nenhum (verificação).

- [ ] **Step 1: Gates de código**

```powershell
npx tsc -b        # esperado: limpo
npm test          # esperado: suíte toda verde
npm run build     # esperado: build ok
```

- [ ] **Step 2: Smoke web (regressão zero)**

Playwright 390×844 (receita smoke-r2.cjs): screenshots de `/auth` e, logado com a conta smoke, `/` (dashboard), `/bonus-offers`, `/search-flights`, `/perfil`, `/vencimentos`. Esperado: visual idêntico ao atual (todas as vars resolvem 0px na web). Qualquer deslocamento = bug (provavelmente classe aplicada errada).

- [ ] **Step 3: Build + instalar APK do branch completo**

Mesma receita da Task 1 (JAVA_HOME/ANDROID_HOME → `npm run mobile:sync` → `gradlew.bat assembleDebug` → conferir BUILD SUCCESSFUL → `adb install -r`).

- [ ] **Step 4: Smoke device (critérios da spec)**

1. Force-stop + relaunch: splash ink + ícones claros → abertura com faixa **ink** até o topo + ícones claros → fade → app com ícones escuros. Screenshots nos 3 momentos.
2. Dashboard: header encostado na barra, sem conteúdo sob o relógio; scroll: conteúdo passa por trás dos ícones da barra (esperado).
3. `/bonus-offers`: pills grudam ABAIXO da faixa ao rolar.
4. Busca de voos: abrir teclado num input → input visível, layout não quebra; disparar um toast (ex.: validação) → não coberto pela status bar.
5. Barra de gestos: BottomNav com respiro; tela sem BottomNav (detalhe de emissão ou calendário) → CTA fixo não colado na barra de gestos.
6. `logcat -d | grep -i "SystemBars\|chromium.*error"` → sem erro novo.

- [ ] **Step 5: Push + PR**

```bash
git push -u origin feat/mobile-edge-to-edge-safe-areas
gh pr create --title "feat(usuario): edge-to-edge real + safe-areas (Android)" --body "..."
```

Corpo do PR: objetivo (follow-up do PR #73), mecanismo (passthrough Cap 8), evidências (screenshots device + gates), nota de exceção consciente à regra de sync com o manager (classes inertes na web), degradação WebView < 140.

---

## Self-review do plano (feito na escrita)

- **Cobertura da spec:** viewport (T1), vars (T2), regra 1 (T3 LegalShell + T4 headers + T5 roots), regra 2 (T4 pills BonusOffers), regra 3 (T3 BottomNav/toast + T4/T5 CTAs), SystemBars/remoção do plugin (T6), spike (T1), smokes e gates (T7). Fora de escopo documentado (T5).
- **Placeholders:** nenhum — toda troca tem old→new literal.
- **Consistência de nomes:** `--gm-safe-top/bottom/left/right` idênticos em T2-T6; `plugins.SystemBars.setStyle({ style })` confere com a API nativa lida (`SystemBars.java`: `setStyle` lê `style` e `bar` opcional).
