# Remoção do menu lateral — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matar o menu lateral (hambúrguer) do app cliente, re-alojando as funções que só existiam nele e removendo Registrar Emissão do front do cliente.

**Architecture:** Mudança 100% front-end (sem migration/backend). O `DashboardHeader` perde o Sheet/drawer; o export LGPD migra pro `PerfilPage`; Compra de Milhas ganha CTA na seção "Meus programas" da Home; Radar ganha card na tela de Alertas; Minha Economia ganha botão na aba Economia da Home. Spec: `docs/superpowers/specs/2026-07-21-remocao-menu-lateral-design.md`.

**Tech Stack:** React 18 + Vite, Tailwind, lucide-react, Vitest + Testing Library (jsdom).

## Global Constraints

- TS é frouxo e `vite build` NÃO type-checka → gates de saída: `npx tsc -b` + `npm test` + `npm run build`.
- Testes com descrição em PT-BR, `vi.clearAllMocks()` no `beforeEach`.
- Commits em PT-BR com escopo (`feat(usuario): …` / `fix(usuario): …`).
- Branch de trabalho: `feat/remover-menu-lateral` (já criada a partir de `origin/main`).
- Não tocar em `GESTMILES_EMISSION_ENABLED` (`PurchaseOptionsScreen` continua usando).
- Desvio consciente do spec: asserts de presença pra CTAs em `Index.tsx`/`VencimentosPage.tsx` NÃO são baratos (páginas exigem mock pesado de supabase/hooks); cobertura via `tsc`+build+smoke visual no device. Testes unitários novos ficam onde é barato: `DashboardHeader` e `PerfilPage`.

---

### Task 1: DashboardHeader — remover hambúrguer + drawer

**Files:**
- Modify: `src/components/DashboardHeader.tsx`
- Test: `src/components/DashboardHeader.test.tsx` (novo)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: header sem drawer; `handleExportData` DEIXA de existir aqui (Task 3 recria no Perfil).

- [ ] **Step 1: Escrever o teste (novo arquivo)**

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "c@x.com" }, signOut: vi.fn() }),
}));
vi.mock("@/hooks/useBrandingConfig", () => ({
  useBrandingConfig: () => ({ data: { brandAssets: {} } }),
}));
vi.mock("@/hooks/useBonusPromotions", () => ({
  useBonusPromotions: () => ({ promotions: [] }),
}));
vi.mock("@/components/notifications/NotificationsDropdown", () => ({
  default: () => <div data-testid="notif" />,
}));

import DashboardHeader from "./DashboardHeader";

describe("DashboardHeader — sem menu lateral", () => {
  beforeEach(() => vi.clearAllMocks());

  it("não renderiza mais o botão de abrir o menu (hambúrguer)", () => {
    render(
      <MemoryRouter>
        <DashboardHeader />
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText("Abrir menu")).not.toBeInTheDocument();
  });

  it("mantém o dropdown do avatar (Menu do usuário)", () => {
    render(
      <MemoryRouter>
        <DashboardHeader />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText("Menu do usuário")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/components/DashboardHeader.test.tsx`
Expected: FAIL — o hambúrguer (`aria-label="Abrir menu"`) ainda existe.

- [ ] **Step 3: Remover o drawer do componente**

Em `src/components/DashboardHeader.tsx`:
1. Apagar o bloco `<Sheet>…</Sheet>` inteiro (do `<Sheet>` em ~linha 202 até `</Sheet>` em ~linha 414 — inclui SheetTrigger com o botão "Abrir menu" e todo o SheetContent).
2. Apagar `handleExportData` e o estado `isExporting` (linhas ~62 e ~90–114).
3. Enxugar imports: de `lucide-react` ficam só `User, Zap, LogIn, LogOut, CreditCard`; apagar os imports de `GestMilesLogo`, `Sheet/SheetContent/SheetTrigger/SheetClose`, `toast` (sonner), `gatherUserData/deliverJson`, `isNativePlatform`.
4. Nada mais muda: logo/wordmark, `NotificationsDropdown`, dropdown do avatar e banner de bônus ficam como estão.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/components/DashboardHeader.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardHeader.tsx src/components/DashboardHeader.test.tsx
git commit -m "feat(usuario): remove o menu lateral (hamburguer) do header"
```

---

### Task 2: Remover Registrar Emissão do app cliente

**Files:**
- Modify: `src/App.tsx` (lazy import ~linha 39 + rota ~linhas 192–199)
- Modify: `src/components/BottomNav.tsx:48`
- Delete: `src/pages/RegistrarEmissaoPage.tsx`, `src/lib/registrar-emissao.ts`

**Interfaces:**
- Consumes: nada.
- Produces: rota `/registrar-emissao` deixa de existir (cai no `NotFound`).

- [ ] **Step 1: Remover rota e lazy import no App.tsx**

Apagar a linha:
```tsx
const RegistrarEmissaoPage = lazy(() => import("./pages/RegistrarEmissaoPage"));
```
E o bloco:
```tsx
<Route
  path="/registrar-emissao"
  element={
    <ClienteOnly>
      <RegistrarEmissaoPage />
    </ClienteOnly>
  }
/>
```

- [ ] **Step 2: Limpar o match no BottomNav**

Em `src/components/BottomNav.tsx`, no match da aba `passagens`, remover a linha final:
```tsx
      pathname === "/registrar-emissao",
```
ficando:
```tsx
    match: ({ pathname }) =>
      pathname.startsWith("/search-flights") ||
      pathname.startsWith("/price-calendar") ||
      pathname.startsWith("/bonus-offers") ||
      pathname === "/passagens",
```

- [ ] **Step 3: Deletar os arquivos**

```bash
git rm src/pages/RegistrarEmissaoPage.tsx src/lib/registrar-emissao.ts
```

- [ ] **Step 4: Verificar que nada mais referencia**

Run: `git grep -n "registrar-emissao\|RegistrarEmissao" -- src` → sem resultados.
Run: `npx tsc -b` → limpo. Run: `npx vitest run src/components/BottomNav.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat(usuario): remove Registrar Emissao do app cliente (rota, pagina e lib)"
```

---

### Task 3: PerfilPage — Termos de Uso + export LGPD "Baixar meus dados"

**Files:**
- Modify: `src/pages/PerfilPage.tsx`
- Test: `src/pages/PerfilPage.test.tsx`

**Interfaces:**
- Consumes: header sem export (Task 1).
- Produces: export LGPD acessível em `/perfil`; linha "Termos de Uso" → `/termos`.

- [ ] **Step 1: Adicionar testes no PerfilPage.test.tsx**

Acrescentar mocks no topo (depois dos existentes):
```tsx
const gatherUserDataMock = vi.fn().mockResolvedValue({ conta: {} });
const deliverJsonMock = vi.fn().mockResolvedValue("delivered");
vi.mock("@/services/dataExportService", () => ({
  gatherUserData: (...a: unknown[]) => gatherUserDataMock(...a),
  deliverJson: (...a: unknown[]) => deliverJsonMock(...a),
}));
vi.mock("@/lib/nativeAuth", () => ({ isNativePlatform: () => false }));
vi.mock("sonner", () => ({
  toast: { loading: vi.fn(() => "t1"), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));
```
E o describe novo (importar `fireEvent`, `waitFor` de `@testing-library/react`):
```tsx
describe("PerfilPage — legal e export LGPD (ex-menu lateral)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = "cliente";
  });

  it("mostra a linha 'Termos de Uso'", () => {
    renderPerfil();
    expect(screen.getByText("Termos de Uso")).toBeInTheDocument();
  });

  it("'Baixar meus dados' dispara o export (gather + deliver)", async () => {
    renderPerfil();
    fireEvent.click(screen.getByText("Baixar meus dados"));
    await waitFor(() => expect(deliverJsonMock).toHaveBeenCalledTimes(1));
    expect(gatherUserDataMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ id: "u1", email: "c@x.com" }),
    );
  });
});
```
Obs.: o mock de `gatherUserData` precisa aceitar a chamada com 2 args (client default no 3º).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/pages/PerfilPage.test.tsx`
Expected: FAIL — "Termos de Uso" e "Baixar meus dados" não existem.

- [ ] **Step 3: Implementar no PerfilPage.tsx**

1. Imports: adicionar `Download, FileText` ao import de `lucide-react`; adicionar:
```tsx
import { toast } from "sonner";
import { gatherUserData, deliverJson } from "@/services/dataExportService";
import { isNativePlatform } from "@/lib/nativeAuth";
```
2. Estado + handler (dentro do componente, junto de `handleLogout` — mesma lógica que vivia no header):
```tsx
const [isExporting, setIsExporting] = useState(false);

const handleExportData = async () => {
  if (!user || isExporting) return;
  setIsExporting(true);
  const toastId = toast.loading("Gerando seu arquivo de dados…");
  try {
    const bundle = await gatherUserData(user.id, {
      id: user.id,
      email: user.email ?? null,
      criadoEm: (user as { created_at?: string }).created_at ?? null,
    });
    const outcome = await deliverJson(bundle);
    if (outcome === "cancelled") {
      toast.dismiss(toastId);
    } else {
      toast.success(
        isNativePlatform() ? "Pronto! Seu arquivo de dados foi gerado." : "Pronto! Seu arquivo foi baixado.",
        { id: toastId },
      );
    }
  } catch {
    toast.error("Não foi possível gerar seu arquivo agora. Tente novamente.", { id: toastId });
  } finally {
    setIsExporting(false);
  }
};
```
3. Na seção **Suporte**, depois da linha `{menuRow(ShieldCheck, "Privacidade e LGPD", …)}` acrescentar:
```tsx
{divider}
{menuRow(FileText, "Termos de Uso", () => navigate("/termos"))}
{divider}
{menuRow(Download, isExporting ? "Gerando…" : "Baixar meus dados", () => void handleExportData())}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/pages/PerfilPage.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/pages/PerfilPage.tsx src/pages/PerfilPage.test.tsx
git commit -m "feat(usuario): Termos de Uso e export LGPD no Perfil (ex-menu lateral)"
```

---

### Task 4: Home (Index.tsx) — CTA Compra de Milhas + botão Relatório completo

**Files:**
- Modify: `src/pages/Index.tsx`

**Interfaces:**
- Consumes: rotas existentes `/simular-compra-milhas` e `/minha-economia` (inalteradas).
- Produces: pontos de entrada na Home pras duas telas.

- [ ] **Step 1: Imports**

No import de `lucide-react` (linhas 2–16), acrescentar `Calculator` e `FileText` (ordem alfabética: `Calculator` depois de `BarChart3`; `FileText` depois de `Download`).

- [ ] **Step 2: CTA "Simular compra de milhas" na seção Meus programas**

Logo APÓS o bloco `{!showAll && programs.length > 4 && (…Ver todos…)}` (~linha 1755) e ANTES do bloco `{vencimentoCritico && (…)}`, inserir:
```tsx
          <button
            type="button"
            onClick={() => navigate("/simular-compra-milhas")}
            className="mx-5 mt-3 flex items-center gap-3 rounded-[20px] bg-white p-4 text-left shadow-nubank-card transition-colors hover:bg-nubank-bg/60"
          >
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] bg-nubank-tint text-nubank-primary">
              <Calculator size={20} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-nubank-text">Simular compra de milhas</span>
              <span className="block text-[12.5px] text-nubank-text-secondary">
                Compare o custo do milheiro antes de comprar
              </span>
            </span>
            <ChevronRight size={17} strokeWidth={2} className="shrink-0 text-[#C4C3C9]" aria-hidden />
          </button>
```
Obs.: o botão é irmão da `<section id="meus-programas">` e do grid — mesmo nível de indentação dos blocos vizinhos. `ChevronRight` já é importado.

- [ ] **Step 3: Botão "Relatório completo" na aba Economia**

No bloco `{activeTab === "economia" && (…)}` (~linha 2279), o botão "Baixar PDF" vive num flex de controles. Envolver os dois botões num grupo — trocar:
```tsx
            <button
              type="button"
              onClick={handleDownloadEconomiaPdf}
              className="inline-flex items-center gap-1 rounded-full border border-nubank-border bg-white px-3 py-1.5 text-xs font-semibold text-nubank-text shadow-nubank transition-colors hover:bg-white/90"
            >
              <Download size={14} />
              Baixar PDF
            </button>
```
por:
```tsx
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate("/minha-economia")}
                className="inline-flex items-center gap-1 rounded-full border border-nubank-border bg-white px-3 py-1.5 text-xs font-semibold text-nubank-text shadow-nubank transition-colors hover:bg-white/90"
              >
                <FileText size={14} />
                Relatório completo
              </button>
              <button
                type="button"
                onClick={handleDownloadEconomiaPdf}
                className="inline-flex items-center gap-1 rounded-full border border-nubank-border bg-white px-3 py-1.5 text-xs font-semibold text-nubank-text shadow-nubank transition-colors hover:bg-white/90"
              >
                <Download size={14} />
                Baixar PDF
              </button>
            </div>
```

- [ ] **Step 4: Verificar**

Run: `npx tsc -b` → limpo. Run: `npm test` → suíte verde (sem teste novo aqui — ver Global Constraints).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Index.tsx
git commit -m "feat(usuario): entradas na Home pra Compra de Milhas e relatorio Minha Economia"
```

---

### Task 5: VencimentosPage — card Radar de Oportunidades

**Files:**
- Modify: `src/pages/VencimentosPage.tsx`

**Interfaces:**
- Consumes: rota existente `/radar-oportunidades` (inalterada; BottomNav já a trata como aba Alertas).
- Produces: entrada visível pro Radar na tela de Alertas.

- [ ] **Step 1: Imports**

Linha 3 vira:
```tsx
import { ArrowLeft, BellRing, ChevronRight, Plus, Radio, Search, Zap, X } from "lucide-react";
```

- [ ] **Step 2: Card no topo do main**

Dentro de `<main className="flex flex-col gap-3 px-5 py-3">`, como PRIMEIRO filho (antes do banner de demandas), inserir:
```tsx
        {!isGestor && (
          <button
            type="button"
            onClick={() => navigate("/radar-oportunidades")}
            className="flex items-center gap-3 rounded-[20px] bg-white p-4 text-left shadow-nubank-card transition-colors hover:bg-nubank-bg/60"
          >
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] bg-nubank-tint text-nubank-primary">
              <Radio size={20} strokeWidth={1.75} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-nubank-text">Radar de Oportunidades</span>
              <span className="block text-[12.5px] text-nubank-text-secondary">
                Sugestões pra aproveitar suas milhas
              </span>
            </span>
            <ChevronRight size={17} strokeWidth={2} className="shrink-0 text-[#C4C3C9]" aria-hidden />
          </button>
        )}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc -b` → limpo (confirma que `navigate` e `isGestor` existem no escopo — ambos já usados na página).

- [ ] **Step 4: Commit**

```bash
git add src/pages/VencimentosPage.tsx
git commit -m "feat(usuario): card do Radar de Oportunidades na tela de Alertas"
```

---

### Task 6: Gates finais + PR

- [ ] **Step 1: Gates**

Run (na raiz):
```bash
npx tsc -b
npm test
npm run build
```
Expected: os três limpos/verdes.

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/remover-menu-lateral
gh pr create --title "feat(usuario): remove o menu lateral (hamburguer)" --body "..."
```
Corpo do PR: resumo das decisões do spec (drawer morre; Registrar Emissão sai do cliente; re-alojamentos Compra de Milhas/Radar/Minha Economia; Termos + export LGPD no Perfil) + link do spec + gates rodados. Rodar code-review antes de mergear.

---

## Self-review do plano

- **Cobertura do spec:** drawer (T1), Registrar Emissão (T2), Perfil legal/export (T3), Compra de Milhas + Minha Economia (T4), Radar (T5), gates (T6). Sync do manager é follow-up fora deste repo (registrado no spec). ✓
- **Placeholders:** nenhum — todo step tem código/comando concreto. ✓
- **Consistência de tipos/nomes:** `handleExportData` idêntico ao original do header; `menuRow(Icon, label, onClick)` conforme assinatura existente; ícones adicionados aos imports certos. ✓
- **Desvio registrado:** sem testes unitários pra Index/Vencimentos (mock pesado); cobertos por tsc+build+smoke no device. ✓
