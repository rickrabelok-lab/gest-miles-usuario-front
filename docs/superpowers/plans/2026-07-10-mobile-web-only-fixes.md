# Ajustes web-only no app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF funcionando no app (share sheet via Filesystem+Share) nos dois fluxos (Minha Economia e análise de economia do Index) e aba Passagens navegando via SPA (fim do reload completo/replay da abertura).

**Architecture:** Helper único `src/lib/pdfDelivery.ts` concentra o pipeline html2canvas→jsPDF A4 (extraído do Index) e a entrega por plataforma (web `pdf.save` inalterado; nativo cache+share sheet). As duas telas passam a consumi-lo. BottomNav troca `window.location.assign` por `navigate()`.

**Tech Stack:** Capacitor 8 (`@capacitor/filesystem` + `@capacitor/share` — novos), html2canvas + jspdf (já existentes, dynamic import), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-10-mobile-web-only-fixes-design.md`

## Global Constraints

- Branch: `feat/mobile-web-only-fixes` (já criada; spec commitada).
- Web preservada nos PDFs: Minha Economia continua `window.print()` na web; Index continua com download (`pdf.save`) na web — a mudança web é SÓ a aba Passagens virar `navigate()` (decisão do owner).
- Plugins do Capacitor só via dynamic import (nada no bundle web); `import type` é permitido (apagado na compilação).
- Paginação A4 extraída do Index preservada em comportamento: margem 6mm, `imgWidth = pageWidth - 12`, loop de `addPage` idêntico.
- Gates reais: `npx tsc -b` + `npm test` + `npm run lint`; `vite build` não type-checka.
- Copy/testes PT-BR; commits PT-BR com escopo + trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (here-string PowerShell, `'@` na coluna 0).
- NUNCA commitar ruído pré-existente: `.claude/settings.local.json`, `CLAUDE.md`, `backend/.gitignore`.
- Build Android: `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`, `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`; exigir `BUILD SUCCESSFUL` antes de `adb install`; adb via `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"`.
- Shell: Windows PowerShell 5.1 (sem `&&`).

---

### Task 1: Plugins `@capacitor/filesystem` + `@capacitor/share`

**Files:**
- Modify: `package.json` / `package-lock.json` (npm install)
- Modify (regenerados): `android/app/capacitor.build.gradle`, `android/capacitor.settings.gradle`

**Interfaces:**
- Produces: módulos `@capacitor/filesystem` (exports `Filesystem`, `Directory`) e `@capacitor/share` (export `Share`) importáveis via dynamic import (Task 2 consome). Sync deve listar **5** plugins (app, browser, purchases, filesystem, share).

- [ ] **Step 1: Instalar**

```powershell
npm install @capacitor/filesystem @capacitor/share
```

Conferir majors compatíveis com `@capacitor/core` ^8.x (`npm ls @capacitor/core` sem conflito de peer).

- [ ] **Step 2: Sync**

```powershell
npm run mobile:sync
```

Expected: "Found 5 Capacitor plugins for android" (com filesystem e share), sem erro.

- [ ] **Step 3: Conferir API dos plugins instalados**

Ler os `.d.ts` dos pacotes e confirmar: `Filesystem.writeFile({ path, data, directory }): Promise<{ uri: string }>` (data base64 SEM `encoding` grava binário) com `Directory.Cache`; `Share.share({ title, url }): Promise<...>` e que o cancelamento do usuário rejeita com erro cuja message contém "cancel". Divergências → anotar assinatura real no report (Task 2 usa o que você anotar).

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json android/app/capacitor.build.gradle android/capacitor.settings.gradle
git commit -m @'
feat(mobile): plugins @capacitor/filesystem+share pra entrega de PDF no app

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 2: `src/lib/pdfDelivery.ts` (TDD)

**Files:**
- Create: `src/lib/pdfDelivery.ts`
- Test: `src/lib/pdfDelivery.test.ts`

**Interfaces:**
- Consumes: `isNativePlatform()` de `@/lib/nativeAuth`; `html2canvas`/`jspdf` (dynamic); plugins da Task 1 (dynamic).
- Produces (Tasks 3–4 consomem, nomes exatos):
  - `renderElementToA4Pdf(el: HTMLElement, backgroundColor?: string): Promise<jsPDF>` (default backgroundColor `"#F7F7F8"`)
  - `deliverPdf(pdf: jsPDF, filename: string): Promise<"delivered" | "cancelled">`
  - `isShareCancelledError(err: unknown): boolean` (pura, exportada p/ teste)

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/lib/pdfDelivery.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { jsPDF } from "jspdf";

const mocks = vi.hoisted(() => {
  const addImage = vi.fn();
  const addPage = vi.fn();
  const pdfInstance = {
    addImage,
    addPage,
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  };
  return {
    addImage,
    addPage,
    pdfInstance,
    JsPdfCtor: vi.fn(() => pdfInstance),
    html2canvas: vi.fn(),
    writeFile: vi.fn(),
    share: vi.fn(),
  };
});

vi.mock("html2canvas", () => ({ default: mocks.html2canvas }));
vi.mock("jspdf", () => ({ jsPDF: mocks.JsPdfCtor }));
vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { writeFile: mocks.writeFile },
  Directory: { Cache: "CACHE" },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: mocks.share } }));

import { deliverPdf, isShareCancelledError, renderElementToA4Pdf } from "./pdfDelivery";

type WindowWithCapacitor = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

const fakeCanvas = (height: number) => ({
  width: 800,
  height,
  toDataURL: () => "data:image/png;base64,IMG",
});

const fakePdf = () =>
  ({
    save: vi.fn(),
    output: vi.fn(() => "data:application/pdf;base64,QUJDRA=="),
  }) as unknown as jsPDF;

describe("isShareCancelledError", () => {
  it("reconhece cancelamento do share sheet e ignora erros reais", () => {
    expect(isShareCancelledError(new Error("Share canceled"))).toBe(true);
    expect(isShareCancelledError({ message: "Share cancelled" })).toBe(true);
    expect(isShareCancelledError(new Error("disk full"))).toBe(false);
    expect(isShareCancelledError(null)).toBe(false);
  });
});

describe("renderElementToA4Pdf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("conteúdo curto vira 1 página (sem addPage)", async () => {
    mocks.html2canvas.mockResolvedValue(fakeCanvas(800)); // imgHeight = 198mm < 285
    const el = document.createElement("div");
    await renderElementToA4Pdf(el);
    expect(mocks.html2canvas).toHaveBeenCalledWith(el, {
      scale: 2,
      backgroundColor: "#F7F7F8",
      useCORS: true,
    });
    expect(mocks.addImage).toHaveBeenCalledTimes(1);
    expect(mocks.addPage).not.toHaveBeenCalled();
  });

  it("conteúdo longo pagina com addPage", async () => {
    mocks.html2canvas.mockResolvedValue(fakeCanvas(4000)); // imgHeight = 990mm -> várias páginas
    await renderElementToA4Pdf(document.createElement("div"), "#FFFFFF");
    expect(mocks.html2canvas).toHaveBeenCalledWith(expect.anything(), {
      scale: 2,
      backgroundColor: "#FFFFFF",
      useCORS: true,
    });
    expect(mocks.addPage.mock.calls.length).toBeGreaterThan(0);
    expect(mocks.addImage.mock.calls.length).toBe(mocks.addPage.mock.calls.length + 1);
  });
});

describe("deliverPdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.writeFile.mockResolvedValue({ uri: "file:///cache/x.pdf" });
    mocks.share.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete (window as WindowWithCapacitor).Capacitor;
  });

  it("na web usa pdf.save (comportamento atual)", async () => {
    const pdf = fakePdf();
    const result = await deliverPdf(pdf, "relatorio.pdf");
    expect(result).toBe("delivered");
    expect(pdf.save).toHaveBeenCalledWith("relatorio.pdf");
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it("no nativo grava no cache e abre o share sheet", async () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    const pdf = fakePdf();
    const result = await deliverPdf(pdf, "relatorio.pdf");
    expect(result).toBe("delivered");
    expect(pdf.save).not.toHaveBeenCalled();
    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: "relatorio.pdf",
      data: "QUJDRA==",
      directory: "CACHE",
    });
    expect(mocks.share).toHaveBeenCalledWith({ title: "relatorio.pdf", url: "file:///cache/x.pdf" });
  });

  it("usuário fechando o share sheet é silencioso (cancelled)", async () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    mocks.share.mockRejectedValue(new Error("Share canceled"));
    const result = await deliverPdf(fakePdf(), "x.pdf");
    expect(result).toBe("cancelled");
  });

  it("erro real na escrita propaga", async () => {
    (window as WindowWithCapacitor).Capacitor = { isNativePlatform: () => true };
    mocks.writeFile.mockRejectedValue(new Error("disk full"));
    await expect(deliverPdf(fakePdf(), "x.pdf")).rejects.toThrow("disk full");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npx vitest run src/lib/pdfDelivery.test.ts
```

Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/lib/pdfDelivery.ts`**

(⚠️ conferir contra o report da Task 1 se a API real dos plugins divergir.)

```ts
/**
 * Geração e entrega de PDF por plataforma.
 * Web: download normal (pdf.save — comportamento que sempre existiu).
 * App nativo: o WebView não trata download de blob nem window.print, então o
 * arquivo vai pro cache (Filesystem) e abre o share sheet do Android (Share).
 * Spec: docs/superpowers/specs/2026-07-10-mobile-web-only-fixes-design.md
 */
import type { jsPDF } from "jspdf";

import { isNativePlatform } from "@/lib/nativeAuth";

export function isShareCancelledError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = String((err as { message?: string }).message ?? "").toLowerCase();
  return msg.includes("cancel");
}

/** Pipeline html2canvas -> jsPDF A4 retrato com paginação (extraído do Index.tsx). */
export async function renderElementToA4Pdf(
  el: HTMLElement,
  backgroundColor = "#F7F7F8",
): Promise<jsPDF> {
  const [{ default: html2canvas }, { jsPDF: JsPdf }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(el, { scale: 2, backgroundColor, useCORS: true });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new JsPdf("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth - 12;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 6;
  pdf.addImage(imgData, "PNG", 6, position, imgWidth, imgHeight);
  heightLeft -= pageHeight - 12;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + 6;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 6, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 12;
  }

  return pdf;
}

/** Entrega por plataforma; "cancelled" = usuário fechou o share sheet (não é erro). */
export async function deliverPdf(
  pdf: jsPDF,
  filename: string,
): Promise<"delivered" | "cancelled"> {
  if (!isNativePlatform()) {
    pdf.save(filename);
    return "delivered";
  }

  const dataUri = pdf.output("datauristring");
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");

  // data base64 sem `encoding` = escrita binária (contrato do Filesystem).
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });

  try {
    await Share.share({ title: filename, url: written.uri });
  } catch (err) {
    if (isShareCancelledError(err)) return "cancelled";
    throw err;
  }
  return "delivered";
}
```

- [ ] **Step 4: Rodar e ver passar + tsc + eslint**

```powershell
npx vitest run src/lib/pdfDelivery.test.ts
npx tsc -b
npx eslint src/lib/pdfDelivery.ts src/lib/pdfDelivery.test.ts
```

Expected: PASS (7 testes); tsc e eslint limpos.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/pdfDelivery.ts src/lib/pdfDelivery.test.ts
git commit -m @'
feat(mobile): pdfDelivery — pipeline A4 extraído + entrega por plataforma (save/share sheet)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 3: Index — `handleDownloadEconomiaPdf` usa o helper

**Files:**
- Modify: `src/pages/Index.tsx:1609-1644` (o handler) + import

**Interfaces:**
- Consumes: `renderElementToA4Pdf`, `deliverPdf` (Task 2); `toast` (já importado no arquivo, linha 43); `economiaReportRef` (linha 735, existente).

- [ ] **Step 1: Trocar o handler**

Ler o trecho atual (linhas ~1609-1644) antes. Adicionar o import junto dos imports de `@/lib`:

```ts
import { deliverPdf, renderElementToA4Pdf } from "@/lib/pdfDelivery";
```

Substituir o corpo INTEIRO de `handleDownloadEconomiaPdf` por:

```ts
  const handleDownloadEconomiaPdf = async () => {
    if (!economiaReportRef.current) return;
    try {
      const pdf = await renderElementToA4Pdf(economiaReportRef.current, "#F7F7F8");
      const dataArquivo = new Date().toISOString().slice(0, 10);
      await deliverPdf(pdf, `analise-economia-${economiaPeriodoMeses}m-${dataArquivo}.pdf`);
    } catch (err) {
      console.warn("[Index] PDF economia:", err);
      toast.error("Não foi possível gerar o PDF. Tente novamente.");
    }
  };
```

(Comportamento web idêntico por construção: mesmo pipeline, mesma paginação, mesmo nome de arquivo, `deliverPdf` → `pdf.save` na web. Ganhos: erro agora tem toast; nativo ganha share sheet. Não há teste unitário do Index pra esse handler — a cobertura é a do helper na Task 2 + suíte inteira verde.)

- [ ] **Step 2: Suíte + tsc**

```powershell
npm test
npx tsc -b
```

Expected: suíte inteira verde (139 + 7 da Task 2 = 146); tsc limpo.

- [ ] **Step 3: Commit**

```powershell
git add src/pages/Index.tsx
git commit -m @'
fix(mobile): PDF da análise de economia entrega por plataforma (share sheet no app)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 4: Minha Economia — botão PDF vivo no nativo (TDD)

**Files:**
- Modify: `src/pages/MinhaEconomiaPage.tsx` (handler + ref + estado de loading)
- Test: `src/pages/MinhaEconomiaPage.test.tsx` (1 teste novo; os existentes ficam)

**Interfaces:**
- Consumes: `renderElementToA4Pdf`, `deliverPdf` (Task 2); `isNativePlatform` (`@/lib/nativeAuth`); `toast` (sonner — import novo no arquivo).

- [ ] **Step 1: Escrever o teste novo (falhando)**

Ler `src/pages/MinhaEconomiaPage.test.tsx` INTEIRO primeiro (usa injeção de hook por prop — padrão do repo). Adicionar ao arquivo: mock do helper no topo (junto dos outros mocks) e o caso nativo:

```tsx
const renderPdfMock = vi.fn().mockResolvedValue({ fake: "pdf" });
const deliverPdfMock = vi.fn().mockResolvedValue("delivered");
vi.mock("@/lib/pdfDelivery", () => ({
  renderElementToA4Pdf: (...args: unknown[]) => renderPdfMock(...args),
  deliverPdf: (...args: unknown[]) => deliverPdfMock(...args),
}));
```

E o teste (dentro do describe existente; adaptar o render/fixture ao padrão do arquivo — o hook injetado precisa devolver `data` pra o relatório montar):

```tsx
  it("no app nativo o botão gera PDF e abre o share (sem window.print)", async () => {
    (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor = {
      isNativePlatform: () => true,
    };
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      <MemoryRouter>
        <MinhaEconomiaPage useHook={useHookComDados} />
      </MemoryRouter>,
    );
    const btn = await screen.findByRole("button", { name: /baixar relatório em pdf/i });
    fireEvent.click(btn);
    await waitFor(() => expect(renderPdfMock).toHaveBeenCalled());
    expect(deliverPdfMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/^minha-economia-.*\.pdf$/),
    );
    expect(printSpy).not.toHaveBeenCalled();
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
  });
```

(`useHookComDados` = o stub de hook com `data` que o arquivo já usa nos testes que renderizam o relatório — reusar o fixture existente; se o arquivo usa outro nome, adaptar. Se o teste web existente "Baixar relatório chama window.print" não limpar `window.Capacitor`, garantir cleanup no afterEach.)

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npx vitest run src/pages/MinhaEconomiaPage.test.tsx
```

Expected: FAIL — o clique chama `window.print` (ramo nativo não existe).

- [ ] **Step 3: Implementar**

Em `src/pages/MinhaEconomiaPage.tsx`:

1. Imports novos:
```ts
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { isNativePlatform } from "@/lib/nativeAuth";
import { deliverPdf, renderElementToA4Pdf } from "@/lib/pdfDelivery";
```
(mesclar com os imports existentes — `useEffect`/`useState` já vêm de react.)

2. No componente:
```ts
  const printRef = useRef<HTMLDivElement | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const handleBaixarRelatorio = async () => {
    if (!isNativePlatform()) {
      window.print();
      return;
    }
    if (!printRef.current) return;
    setGerandoPdf(true);
    try {
      const pdf = await renderElementToA4Pdf(printRef.current);
      const dataArquivo = new Date().toISOString().slice(0, 10);
      await deliverPdf(pdf, `minha-economia-${periodo}-${dataArquivo}.pdf`);
    } catch (err) {
      console.warn("[MinhaEconomia] PDF:", err);
      toast.error("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setGerandoPdf(false);
    }
  };
```

3. Botão (linhas ~72-80): `onClick={() => void handleBaixarRelatorio()}` + `disabled={gerandoPdf}` + `aria-busy={gerandoPdf}` (classes inalteradas).

4. Container do relatório (linha ~112): `<div id="minha-economia-print" ref={printRef}>` (id fica — é o alvo do print CSS na web).

- [ ] **Step 4: Rodar e ver passar + suíte + tsc**

```powershell
npx vitest run src/pages/MinhaEconomiaPage.test.tsx
npm test
npx tsc -b
```

Expected: arquivo verde (existentes + 1 novo); suíte inteira verde (147); tsc limpo.

- [ ] **Step 5: Commit**

```powershell
git add src/pages/MinhaEconomiaPage.tsx src/pages/MinhaEconomiaPage.test.tsx
git commit -m @'
fix(mobile): botão de PDF da Minha Economia funciona no app (share sheet; web segue print)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 5: BottomNav — aba Passagens via navigate (TDD)

**Files:**
- Modify: `src/components/BottomNav.tsx:139-168` (remove o ramo especial) e o handler comum (~174-188)
- Test: `src/components/BottomNav.test.tsx` (novo)

**Interfaces:**
- Consumes: `useNavigate` (react-router); `passagensHref` (memo existente no componente, preservado).

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `src/components/BottomNav.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-router-dom")>();
  return { ...original, useNavigate: () => navigateMock };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock("@/hooks/useNotificacoes", () => ({
  useNotificacoes: () => ({ data: undefined }),
}));

import BottomNav from "./BottomNav";

const renderNav = (initialEntry = "/") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <BottomNav />
    </MemoryRouter>,
  );

describe("BottomNav — aba Passagens", () => {
  beforeEach(() => vi.clearAllMocks());

  it("navega via SPA pra /search-flights (sem recarregar o app)", () => {
    renderNav("/");
    fireEvent.click(screen.getByRole("button", { name: /passagens/i }));
    expect(navigateMock).toHaveBeenCalledWith("/search-flights");
  });

  it("preserva os searchParams (menos view) no destino", () => {
    renderNav("/?clientId=abc&view=programas");
    fireEvent.click(screen.getByRole("button", { name: /passagens/i }));
    expect(navigateMock).toHaveBeenCalledWith("/search-flights?clientId=abc");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
npx vitest run src/components/BottomNav.test.tsx
```

Expected: FAIL — o ramo atual usa `window.location.assign` (jsdom pode até lançar "Not implemented: navigation"); `navigateMock` não é chamado.

- [ ] **Step 3: Implementar**

Em `src/components/BottomNav.tsx`:

1. REMOVER o bloco especial `if (id === "passagens") { return (...) }` (linhas ~139-168) inteiro.
2. No handler comum do botão genérico (dentro do `onClick`, junto dos outros `if`), adicionar antes do fallback de perfil:

```ts
                  if (id === "passagens") {
                    navigate(passagensHref);
                    return;
                  }
```

(`passagensHref` já existe e preserva os searchParams sem `view` — nada mais muda; o `aria-current` do ramo especial se perde? O botão genérico não tem `aria-current` — ADICIONAR `aria-current={isActive ? "page" : undefined}` ao botão genérico pra não regredir acessibilidade da aba Passagens e de quebra dar o atributo às outras.)

- [ ] **Step 4: Rodar e ver passar + suíte + tsc**

```powershell
npx vitest run src/components/BottomNav.test.tsx
npm test
npx tsc -b
```

Expected: 2 novos PASS; suíte inteira verde (149); tsc limpo.

- [ ] **Step 5: Commit**

```powershell
git add src/components/BottomNav.tsx src/components/BottomNav.test.tsx
git commit -m @'
fix(usuario): aba Passagens navega via SPA (fim do reload herdado do scaffold)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 6: Gates completos + APK + smoke no device

**Files:** nenhum novo (builds e verificação).

- [ ] **Step 1: Gates**

```powershell
npx tsc -b
npm test
npm run lint
npm run build
```

Expected: tudo exit 0 (front ~149 testes).

- [ ] **Step 2: Build mobile + APK + install**

```powershell
npm run mobile:sync
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
Set-Location android; .\gradlew.bat assembleDebug; Set-Location ..
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Expected: sync com **5 plugins**; **BUILD SUCCESSFUL** (obrigatório antes do install); install `Success`.

- [ ] **Step 3: Smoke no device (screenshots com screencap+pull; NUNCA exec-out >)**

App já logado (conta smoke). Três verificações:

1. **Passagens SPA**: da home, tocar a aba Passagens → tela de busca abre **imediatamente, SEM a abertura Constelação** (evidência: screenshot da tela de busca; se a abertura tocasse, um screenshot ~2s após o tap mostraria a animação escura). Voltar pra home pela aba Início.
2. **Minha Economia PDF**: navegar até a tela (atalho Economia na home ou rota /minha-economia) → tocar o botão de download (ícone FileDown no header) → **share sheet do Android abre** com o arquivo `minha-economia-*.pdf` (screenshot). Fechar o share sheet (back) — app não quebra.
3. **Análise de economia (Index)**: na home, achar a seção de análise de economia (tab/atalho R$/Economia) → botão de download → **share sheet abre** com `analise-economia-*.pdf` (screenshot). Fechar com back.

Dispensar modal NPS/CSAT no X se aparecer (sem interagir com o form). Limpar screenshots do device no final.

- [ ] **Step 4: Commit (só se o sync alterou arquivos versionados)**

`git status --short` — se houver mudanças tracked em `android/`: add + commit `chore(mobile): sync capacitor pos-build` (here-string com trailer). Senão, pular.

---

### Task 7: PR

**Files:** nenhum.

- [ ] **Step 1: Push + PR**

```powershell
git push -u origin feat/mobile-web-only-fixes
gh pr create --title "fix(mobile): PDFs via share sheet no app + aba Passagens sem reload" --body "<corpo>"
```

Corpo: resumo (3 fixes + helper), evidência (gates + BUILD SUCCESSFUL + screenshots do smoke), nota de que a única mudança web é a aba Passagens virar SPA (decisão do owner; era herança do scaffold). Sem migration, sem espelho no manager (nada de SQL/schema; BottomNav do manager é outro componente — conferir com grep no repo manager se `window.location.assign` existe lá e, se existir, apenas ANOTAR no PR como possível replicação futura, sem mexer). Rodapé:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 2: Registrar pendências**

Merge após owner aprovar; pós-merge: APK do main no device, memória da frente mobile atualizada (fase 3 concluída; próxima = status bar/splash nativa).
