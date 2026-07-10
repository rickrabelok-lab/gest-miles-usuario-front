# Ajustes web-only no app (fase mobile 3) — Design

**Data:** 2026-07-10
**Status:** aprovado pelo owner (PDF nativo via share sheet; aba Passagens vira navegação SPA nos DOIS ambientes)

## Problema

Três pontos do app web quebram ou degradam no Capacitor:

1. **Minha Economia — `window.print()`** (`src/pages/MinhaEconomiaPage.tsx:74`): no WebView Android é **no-op** — o botão "Baixar relatório em PDF" está morto no app. Na web funciona (diálogo de impressão do browser).
2. **Análise de economia (Index) — `pdf.save()`** (`src/pages/Index.tsx`, `handleDownloadEconomiaPdf`): jsPDF entrega via download de blob, que o WebView **não trata** — falha silenciosa no app. O pipeline html2canvas→jsPDF→paginação A4 em si funciona.
3. **BottomNav aba Passagens — `window.location.assign`** (`src/components/BottomNav.tsx:145`): reload completo do documento a cada toque. Herança do scaffold Lovable ("design home", sem razão documentada; o redesign fase 2 declarou "zero mudança de lógica"). Custo: web recarrega o app inteiro; **no nativo replay da abertura Constelação (~5s) por toque**.

## Decisões (owner, 2026-07-10)

- **Entrega de PDF no nativo: share sheet do Android** (Filesystem cache + Share) — padrão moderno, sem fricção de permissão de storage. Web inalterada.
- **Aba Passagens: navegação SPA nos dois ambientes** (`navigate()`). Efeito colateral aceito: a tela de busca pode reabrir com a última busca retida; se o smoke mostrar problema real, reset explícito ao entrar — nunca reload.

## Componentes

### 1. `src/lib/pdfDelivery.ts` (novo)

Plugins novos: `@capacitor/filesystem` + `@capacitor/share` (dynamic import — nada no bundle web).

- `renderElementToA4Pdf(el: HTMLElement, backgroundColor?: string): Promise<jsPDF>` — extração do pipeline que hoje vive inline no `Index.tsx`: html2canvas (scale 2, useCORS) → jsPDF A4 retrato → paginação com margem de 6mm (lógica atual preservada byte-a-byte em comportamento). Dynamic import de `html2canvas`/`jspdf` (como hoje).
- `deliverPdf(pdf: jsPDF, filename: string): Promise<"delivered" | "cancelled">`
  - **Web** (`!isNativePlatform()`): `pdf.save(filename)` → `"delivered"` (comportamento atual, idêntico).
  - **Nativo**: `pdf.output("datauristring")` → base64 (strip do prefixo) → `Filesystem.writeFile({ path: filename, data, directory: Directory.Cache })` → `Share.share({ title: filename, url: uri })`. Usuário fechou o share sheet sem escolher = `"cancelled"` (silencioso; o plugin lança erro de cancelamento — detectar por mensagem, mesmo padrão do `isUserCancelledError` do RevenueCat). Erro real propaga (caller mostra toast).

### 2. Minha Economia (`src/pages/MinhaEconomiaPage.tsx`)

- **Web: inalterada** — botão continua `window.print()` (teste existente continua valendo no ramo web).
- **Nativo**: o mesmo botão passa a gerar PDF do nó do relatório (o container que hoje é o alvo do print CSS — identificar o elemento na implementação; se não houver ref, criar) via `renderElementToA4Pdf` → `deliverPdf("minha-economia-<data>.pdf")`. Estado de loading no botão durante a geração; erro → toast (sonner); cancelamento silencioso.

### 3. Index — `handleDownloadEconomiaPdf` (`src/pages/Index.tsx`)

- Corpo do handler troca o pipeline inline por `renderElementToA4Pdf(economiaReportRef.current, "#F7F7F8")` + `deliverPdf(pdf, "analise-economia-<período>m-<data>.pdf")`.
- Web idêntica por construção (deliverPdf → `pdf.save`). Erro → toast; cancelamento silencioso.

### 4. BottomNav (`src/components/BottomNav.tsx`)

- Ramo especial da aba `passagens` (botão com `window.location.assign`) é removido; a aba entra no fluxo comum com `navigate(passagensHref)`.
- `passagensHref` continua preservando os searchParams atuais (menos `view`).
- Sem reset do `SearchFlightsContext` neste escopo — só se o smoke em device mostrar comportamento quebrado (aí: reset explícito ao montar a tela, decisão à parte).

## Fora de escopo (consciente)

- Reset/limpeza do formulário de busca (só se o smoke provar necessário).
- iOS; impressão nativa (share sheet cobre "salvar como PDF"); mudanças no conteúdo/CSS dos relatórios.

## Verificação

- **Unit (Vitest)**:
  - `pdfDelivery`: web → chama `pdf.save` (mock jsPDF); nativo → Filesystem.writeFile + Share.share chamados com o filename (plugins mockados); cancelamento do share → `"cancelled"` sem throw; erro real propaga. `renderElementToA4Pdf` fica coberto por mock de html2canvas/jspdf (paginação: 1 página curta e N páginas com altura grande).
  - `BottomNav`: toque em Passagens chama `navigate("/search-flights…")` (e NÃO `window.location.assign`) — atualizar/if necessário o teste existente.
  - `MinhaEconomiaPage`: web continua `window.print` (teste atual); nativo chama o pipeline mockado.
- **Gates**: `npx tsc -b` + `npm test` + `npm run lint` + `npm run build` + `npm run mobile:sync` + `gradlew assembleDebug` (BUILD SUCCESSFUL antes de instalar).
- **Device (Xiaomi, plugado)**: tocar Passagens → tela de busca abre **instantânea, SEM replay da abertura**; Minha Economia → botão PDF → share sheet abre com o arquivo; Index → download da análise → share sheet. Sem crash.
- **Web**: testes cobrem (print inalterado, save inalterado, navigate); build ok.
