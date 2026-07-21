# Edge-to-edge real + safe-areas (Android) — Design

**Data:** 2026-07-21 · **Branch:** `feat/mobile-edge-to-edge-safe-areas` · **Aprovado pelo owner** (abordagem A)

## Objetivo

Fechar o follow-up de loja registrado no PR #73: no app Android, a WebView passa a desenhar **sob** as barras do sistema (edge-to-edge real). Resultado visível:

- A abertura Constelação (overlay `fixed inset:0` ink) cobre a faixa da status bar — a "faixa ink" que o SDK 36 impedia via `setBackgroundColor` (no-op documentado na fase 4).
- No app, os headers encostam na barra (o fundo deles cobre a faixa — padrão Material/Gmail) e os ícones da barra ficam escuros e legíveis sobre fundo claro.
- Nenhuma tela fica com conteúdo embaixo do relógio/bateria nem da barra de gestos; teclado não cobre inputs.
- **Web 100% inalterada** (mudança inteira é web-side, mas inerte fora do nativo).

## Mecanismo (verdade lida do código instalado, não de blog)

Fonte: `node_modules/@capacitor/android/capacitor/.../plugin/SystemBars.java` (@capacitor/android **8.4.1**) e `native-bridge.js`.

- `SystemBars` é **plugin do core**, auto-registrado (`Bridge.java:658`) — não requer instalar nada. Config `insetsHandling` default `'css'`.
- **Passthrough (edge-to-edge real)** liga quando: WebView major **≥ 140** E o último `meta[name=viewport]` contém **`viewport-fit=cover`** (checado via `onDOMReady`, chamado pelo `native-bridge.js` no Android). Aí o Capacitor:
  - remove o padding que hoje encaixa a WebView abaixo da barra (a "faixa clara" atual);
  - repassa os insets pro WebView (`env(safe-area-inset-*)` funciona — fix do Chromium no M140);
  - injeta `--safe-area-inset-*` no `documentElement` com valores reais (dp), atualizados a cada mudança de inset;
  - **trata teclado**: padding bottom do parent = altura do IME quando visível, e `--safe-area-inset-bottom` vira 0 com IME aberto (sem soma dupla). Bug de env+teclado em WebView < 144 tem workaround nativo.
- **Degradação**: WebView < 140 ou sem `viewport-fit=cover` → exatamente o comportamento de hoje (WebView encaixada, vars = 0). Android < 15 idem. Sem quebra em aparelho velho.
- `SystemBars.setStyle({ style, bar })`: controla o contraste dos ícones das **duas** barras (`LIGHT` = barra clara/ícones escuros; `DARK` = ícones claros; `bar` vazio = ambas).
- O app é light-only (next-themes só no sonner, sem ThemeProvider) → estilo do app é `LIGHT` fixo; `DARK` só durante splash/abertura ink.

## Mudanças

### 1. `index.html`

- Meta viewport ganha `viewport-fit=cover` (na web só tem efeito em PWA standalone iOS — inofensivo).
- Script da abertura: troca `plugins.StatusBar` → `plugins.SystemBars` (best-effort, try/catch como hoje):
  - splash/abertura ink → `setStyle({ style: 'DARK' })` (ícones claros);
  - fim da abertura e caminhos de skip (`!el`, reduced-motion) → `setStyle({ style: 'LIGHT' })`;
  - remove a chamada `setBackgroundColor` (no-op no SDK 36) e o comentário da limitação antiga (substituído pela realidade nova).

### 2. `src/index.css` — variáveis canônicas

```css
:root {
  --gm-safe-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  --gm-safe-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
  --gm-safe-left: var(--safe-area-inset-left, env(safe-area-inset-left, 0px));
  --gm-safe-right: var(--safe-area-inset-right, env(safe-area-inset-right, 0px));
}
```

`var()` injetada pelo Capacitor vence no nativo; `env()` cobre WebView ≥ 140 antes da injeção; `0px` na web. Uso via arbitrary values do Tailwind (`pt-[var(--gm-safe-top)]`, `top-[var(--gm-safe-top)]`, `calc(...)`) — sem plugin novo.

### 3. Varredura das telas (3 regras)

1. **Elemento no topo da tela** (header `sticky top-0` que abre a página, header `fixed top-0`, ou primeiro bloco de tela sem header): padding-top vira `calc(<atual> + var(--gm-safe-top))` — o fundo do elemento cobre a faixa sempre.
2. **Sticky que NÃO está no topo da página** (ex.: pills do BonusOffers): ganha `top-[var(--gm-safe-top)]` — quando gruda, fica abaixo da faixa; conteúdo rola atrás dos ícones da barra (padrão Android).
3. **Fixed bottom**: BottomNav troca o spacer `h-[env(safe-area-inset-bottom)]` pela cadeia `var(--gm-safe-bottom)` (hoje zera com navegação 3-botões em WebView < 140... e continua zerando — degradação idêntica à atual; em passthrough passa a valer). Viewport do toast radix (`fixed top-0`) ganha safe-top.

**Inventário preliminar** (confirmar 100% das rotas do app na fase de plano):

- Headers sticky no topo: ClientePage, ConvideAmigosPage, DuvidasPage, FaleConoscoPage, EmissionDetailsScreen, RegistrarEmissaoPage, PurchaseOptionsScreen, SobreGestMilesPage, SimularCompraMilhasPage, PreferenciasSugestoesPage, CriarAlertaPage.
- Header fixed: PriceCalendarScreen (conferir spacer do conteúdo).
- Misto: BonusOffersScreen (header estático no topo + pills sticky → regras 1 e 2).
- Sem header (padding no container): Index, SearchFlightsScreen, FlightResultsScreen, LoyaltyProgramDetails, VencimentosPage, MinhaEconomiaPage, PerfilPage, ClientProfile, RadarOportunidadesPage, HistoricoRotasScreen, BonusOfferDetailScreen (conferir header próprio), NotificacoesPage, AssinaturaAppScreen, AssinaturaClientePage, Auth, SignUp, ForgotPassword, ResetPassword, AcceptInvite, Me, NotFound, legal/*, ClienteInsightsPage, ClienteTimelinePage.
- Componentes: BottomNav (spacer), `components/ui/toast.tsx` (viewport). ProgramSelectionSheet: sticky dentro de sheet (container próprio de scroll) — provável no-op, confirmar.
- **Fora do escopo**: `pages/admin/*` (admin é expulso do app), sonner (verificar no smoke; ajustar `offset` só se toast ficar coberto).

### 4. Remoção de `@capacitor/status-bar`

Único uso era o script do `index.html` (substituído pelo SystemBars do core). `npm uninstall @capacitor/status-bar` + `cap sync` (⚠️ churn de EOL em `capacitor.build.gradle`/`capacitor.settings.gradle` → `git checkout --` neles, receita conhecida). 7 → 6 plugins.

### 5. Zero mudança nativa

Manifest, styles.xml, MainActivity, gradle: intocados (fora o sync de plugins). `capacitor.config.ts`: intocado (defaults do SystemBars já servem; estilo inicial é irrelevante porque o splash nativo cobre o boot e o script assume antes do hide).

## Ordem de execução — spike primeiro

**Passo 0 (gate de viabilidade):** só `viewport-fit=cover` + rebuild + screenshot no Xiaomi. Prova o passthrough (faixa some, abertura cobre a barra) ANTES da varredura de ~25 arquivos. Motivação: issue aberto ionic-team/capacitor#8416 reporta edge-to-edge quebrado em 8.3.0 (cenário diferente do nosso, mas barato de provar). Se o spike falhar → parar e redesenhar sem custo.

Depois: CSS vars → varredura → abertura/SystemBars → uninstall status-bar → smokes.

## Critérios de sucesso

**Device (Xiaomi, APK debug, receita conhecida):**
1. Splash nativa: barra ink + ícones claros (comportamento atual preservado).
2. Abertura: faixa da status bar **ink** (ícones claros) — o objetivo do follow-up.
3. App: headers encostados na barra com fundo cobrindo a faixa; ícones escuros legíveis; nenhuma tela principal com conteúdo sob o relógio (Index, BonusOffers, SearchFlights, Perfil, Vencimentos, detalhe de programa).
4. Teclado aberto (ex.: busca de voos): input visível, sem salto de layout quebrado, toast não coberto.
5. Barra de gestos: BottomNav com respiro correto; rodapé de telas sem BottomNav não colado na barra.

**Web (gate de regressão):** smoke Playwright 390×844 nas telas principais — screenshots idênticos ao atual (vars resolvem 0px).

**Gates de código:** `npx tsc -b` limpo + `npm test` + `npm run build` + `BUILD SUCCESSFUL` no gradle.

## Testes

- Unit (Vitest): BottomNav renderiza o spacer com a cadeia nova; teste lendo `index.html` afirma `viewport-fit=cover` e ausência de `StatusBar.` no script (se já existir suite que lê index.html, estender; senão criar leve).
- O grosso da verificação é visual/device (CSS não se unit-testa útil): smoke device + smoke web acima.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Passthrough não ativa no device (issue #8416) | Spike passo 0 antes de tudo |
| Tela esquecida na varredura → conteúdo sob o relógio | Checklist de TODAS as rotas do `App.tsx` no plano + smoke device nas principais |
| WebView < 140 na base de usuários | Degrada pro comportamento atual (faixa clara) — sem quebra |
| Toast/sonner coberto | Verificação explícita no smoke; ajuste de offset só se necessário |
| Churn EOL do `cap sync` | `git checkout --` nos 2 gradle files (receita conhecida) |

## Fora de escopo

- Réplica no manager: as telas forkadas lá são web-only (sem Capacitor) → classes de safe-area seriam inertes. **Não portar**; anotar no PR (exceção consciente à regra de sync).
- Dark mode do app, mudanças visuais na web, iOS (sem conta/Mac ainda — as vars `--gm-safe-*` já nascem compatíveis via `env()`).
