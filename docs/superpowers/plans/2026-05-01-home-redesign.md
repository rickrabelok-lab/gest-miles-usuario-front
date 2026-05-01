# Home Redesign — Ultra Clean Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Melhorar o visual da Home para Ultra Clean sem alterar nenhuma lógica, prop, estado ou rota existente.

**Architecture:** Quatro componentes afetados — `DashboardHeader`, `BalanceTabs`, `ProgramCard` e `Index.tsx`. Cada task modifica apenas classes Tailwind e estrutura JSX visual de um componente por vez.

**Tech Stack:** React + TypeScript + Tailwind CSS v3, sem testes unitários (mudanças são puramente visuais — verificação é visual via dev server).

---

## Arquivos modificados

| Arquivo | O que muda |
|---|---|
| `src/components/DashboardHeader.tsx` | Background flat + avatar quadrado + banner âmbar + título uppercase |
| `src/components/BalanceTabs.tsx` | Tabs underline em vez de pills |
| `src/components/ProgramCard.tsx` | Border card + avatar neutro cinza + badge de variação isolada |
| `src/pages/Index.tsx` | Título "Meus programas" com link + border-radius dos botões de ação |

---

## Task 1: DashboardHeader — background flat, banner âmbar, avatar quadrado

**Files:**
- Modify: `src/components/DashboardHeader.tsx`

- [ ] **Step 1: Remover gradiente do wrapper — deixar roxo flat**

Localizar a linha (~L166):
```tsx
<div className="gradient-primary text-header-foreground">
```
Substituir por:
```tsx
<div className="bg-[#8A05BE] text-header-foreground">
```

- [ ] **Step 2: Arredondar avatar como quadrado**

Localizar o botão do avatar (~L173) com `rounded-[16px]`:
```tsx
className="flex items-center gap-2 rounded-[16px] bg-white/15 px-3 py-2 text-sm font-medium backdrop-blur-sm transition-all duration-200 hover:bg-white/25"
```
Substituir por:
```tsx
className="flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium backdrop-blur-sm transition-all duration-200 hover:bg-white/25"
```

- [ ] **Step 3: Deixar título uppercase com tracking**

Localizar (~L205):
```tsx
<h1 className="font-display text-xl font-bold tracking-tight">Gest Miles</h1>
```
Substituir por:
```tsx
<h1 className="font-display text-xl font-bold uppercase tracking-widest">Gest Miles</h1>
```

- [ ] **Step 4: Refinar o banner de promoção — fundo âmbar**

Localizar o div do banner (~L219):
```tsx
<div className="mx-4 mb-2.5 flex items-center gap-2 rounded-[14px] border border-white/20 bg-white/95 px-3 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
```
Substituir por:
```tsx
<div className="mx-4 mb-2.5 flex items-center gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2">
```

- [ ] **Step 5: Refinar ícone Zap e texto do banner**

Localizar a linha do Zap dentro do banner:
```tsx
<Zap size={18} className="shrink-0 text-warning" />
```
Substituir por:
```tsx
<Zap size={16} className="shrink-0 text-amber-600" />
```

Localizar o parágrafo do banner (versão cliente/não-gestor):
```tsx
<p className="flex-1 text-sm text-nubank-text">
  Bônus de até <span className="font-bold text-warning">133%</span> na transferência.
  Confira
</p>
```
Substituir por:
```tsx
<p className="flex-1 text-sm text-amber-900">
  Bônus de até <span className="font-bold text-amber-600">133%</span> na transferência. Confira
</p>
```

- [ ] **Step 6: Verificar visualmente**

Rodar o dev server:
```bash
npm run dev
```
Abrir `http://localhost:8080` (ou a porta padrão do projeto). Verificar:
- Header: roxo flat sem gradiente
- Avatar: cantos ligeiramente quadrados
- Título "GEST MILES" com letras espaçadas
- Banner: fundo amarelo claro, borda amarela, texto âmbar

- [ ] **Step 7: Commit**

```bash
git add src/components/DashboardHeader.tsx
git commit -m "style: DashboardHeader — background flat, banner âmbar, avatar quadrado"
```

---

## Task 2: BalanceTabs — underline style em vez de pills

**Files:**
- Modify: `src/components/BalanceTabs.tsx`

- [ ] **Step 1: Remover a lógica de colunas do grid**

Localizar e remover as linhas (~L51-L56):
```tsx
const gridColsClass =
  visibleTabs.length === 5
    ? "grid-cols-5"
    : visibleTabs.length === 6
      ? "grid-cols-6"
      : "grid-cols-7";
```
Deletar essas 6 linhas. (A variável não será mais usada.)

- [ ] **Step 2: Trocar container de grid para flex com linha inferior**

Localizar (~L58):
```tsx
<div className={`grid ${gridColsClass} gap-1.5 px-5 py-3`}>
```
Substituir por:
```tsx
<div className="flex overflow-x-auto border-b border-gray-200 px-5 scrollbar-hide">
```

- [ ] **Step 3: Trocar estilo de cada botão para underline**

Localizar o `className` do `<button>` dentro do `.map()` (~L64):
```tsx
className={`flex items-center justify-center gap-1 rounded-[14px] border px-2.5 py-2 text-[11px] font-medium transition-all duration-300 ease-out ${
  isActive
    ? "border-transparent gradient-primary text-primary-foreground shadow-[0_2px_10px_-2px_rgba(138,5,190,0.25)] active:scale-[0.98]"
    : "border-nubank-border bg-white text-nubank-text-secondary shadow-nubank hover:shadow-nubank-hover hover:border-primary/15 hover:text-nubank-text active:scale-[0.98]"
}`}
```
Substituir por:
```tsx
className={`-mb-px flex shrink-0 items-center justify-center gap-1 border-b-2 px-3 py-2.5 text-[11px] font-medium transition-colors ${
  isActive
    ? "border-[#8A05BE] font-bold text-[#8A05BE]"
    : "border-transparent text-gray-400 hover:text-gray-600"
}`}
```

- [ ] **Step 4: Verificar visualmente**

Com o dev server rodando, verificar na Home:
- Tabs aparecem como texto com linha embaixo
- Tab ativa "Início" tem linha roxa embaixo e texto roxo em bold
- Tabs inativas ficam cinza claro
- Sem pills, sem fundo, sem sombra

- [ ] **Step 5: Commit**

```bash
git add src/components/BalanceTabs.tsx
git commit -m "style: BalanceTabs — underline style em vez de pills"
```

---

## Task 3: ProgramCard — border card, avatar neutro, badge de variação

**Files:**
- Modify: `src/components/ProgramCard.tsx`

- [ ] **Step 1: Trocar container do card — border fino, sem sombra, sem gradiente**

Localizar o div raiz do card (~L73):
```tsx
className="relative cursor-pointer rounded-[14px] gradient-card-subtle p-2 text-nubank-text shadow-nubank outline-none transition-all duration-300 ease-out hover:shadow-nubank-hover hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/20 active:scale-[0.99]"
```
Substituir por:
```tsx
className="relative cursor-pointer rounded-xl border border-[#EBEBEB] bg-white p-3 text-nubank-text outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/20 active:scale-[0.99]"
```

- [ ] **Step 2: Trocar avatar do logo — quadrado cinza neutro para todos**

Localizar o botão de logo (~L90):
```tsx
className="group relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[8px] font-bold transition-all duration-300 ease-out hover:brightness-95"
style={{ backgroundColor: logoColor + "20", color: logoColor }}
```
Substituir por:
```tsx
className="group relative flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 text-[7px] font-bold text-gray-500 transition-all hover:brightness-95"
```
(remover completamente o atributo `style={{ ... }}` desta linha)

- [ ] **Step 3: Reestruturar o layout interno do card**

Localizar e substituir todo o bloco de conteúdo interno do card, a partir da `<div className="flex items-start justify-between gap-1">` (~L88) até o fechamento do erro/expiringTag (~L124), mantendo o `{/* Expiring badge */}` acima:

**Remover** o bloco atual:
```tsx
<div className="flex items-start justify-between gap-1">
  {/* Logo */}
  <button
    type="button"
    onClick={handleOpenLogoPicker}
    className="group relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[8px] font-bold transition-all duration-300 ease-out hover:brightness-95"
    style={{ backgroundColor: logoColor + "20", color: logoColor }}
    title="Alterar imagem do programa"
    aria-label={`Alterar imagem do programa ${name}`}
  >
    {logoImageUrl ? (
      <img
        src={logoImageUrl}
        alt={`Logo ${name}`}
        className="h-full w-full object-cover"
      />
    ) : (
      logo
    )}
    <span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-white group-hover:flex">
      <ImagePlus size={10} />
    </span>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleLogoFileChange}
      onClick={(event) => event.stopPropagation()}
    />
  </button>

  {/* Variation arrow + balance */}
  <div className="flex min-w-0 flex-1 items-center justify-end gap-0.5">
    {variation === "up" && <ArrowUp size={11} className="shrink-0 text-success" strokeWidth={2.5} />}
    {variation === "down" && <ArrowDown size={11} className="shrink-0 text-destructive" strokeWidth={2.5} />}
    <span
      className={`truncate font-display text-sm font-bold tabular-nums ${
        variation === "up"
          ? "text-success"
          : variation === "down"
          ? "text-destructive"
          : "text-foreground"
      }`}
    >
      {balance}
    </span>
  </div>
</div>

<div className="mt-1 flex items-baseline justify-between gap-1">
  <p className="text-[10px] font-medium text-nubank-text-secondary leading-tight">{lastUpdate}</p>
  <p className="text-xs font-semibold tabular-nums text-nubank-text leading-tight">R$ {valueInBRL}</p>
</div>
```

**Inserir** no lugar:
```tsx
{/* Top row: avatar + variation badge */}
<div className="mb-1.5 flex items-start justify-between">
  <button
    type="button"
    onClick={handleOpenLogoPicker}
    className="group relative flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 text-[7px] font-bold text-gray-500 transition-all hover:brightness-95"
    title="Alterar imagem do programa"
    aria-label={`Alterar imagem do programa ${name}`}
  >
    {logoImageUrl ? (
      <img
        src={logoImageUrl}
        alt={`Logo ${name}`}
        className="h-full w-full object-cover"
      />
    ) : (
      logo
    )}
    <span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-white group-hover:flex">
      <ImagePlus size={10} />
    </span>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={handleLogoFileChange}
      onClick={(event) => event.stopPropagation()}
    />
  </button>

  {variation === "up" && (
    <span className="rounded bg-green-50 px-1.5 py-0.5 text-[8px] font-bold text-green-700">↑</span>
  )}
  {variation === "down" && (
    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[8px] font-bold text-red-600">↓</span>
  )}
  {variation === "none" && (
    <span className="rounded bg-gray-50 px-1.5 py-0.5 text-[8px] font-bold text-gray-300">—</span>
  )}
</div>

{/* Balance number */}
<div className="mb-1 font-extrabold tabular-nums leading-tight tracking-tight text-gray-900" style={{ fontSize: "15px" }}>
  {balance}
</div>

{/* Value + last update */}
<div className="leading-tight text-gray-400" style={{ fontSize: "9px" }}>
  R$ {valueInBRL} · {lastUpdate}
</div>
```

- [ ] **Step 4: Remover imports não mais usados de ArrowUp/ArrowDown**

Localizar o import no topo do arquivo:
```tsx
import { ArrowUp, ArrowDown, AlertCircle, ImagePlus } from "lucide-react";
```
Substituir por:
```tsx
import { AlertCircle, ImagePlus } from "lucide-react";
```

- [ ] **Step 5: Verificar visualmente**

Com o dev server rodando, verificar na seção "Meus programas":
- Cards brancos com borda fina cinza
- Avatar: quadrado cinza neutro igual para todos os programas
- Número do saldo em bold grande na própria linha
- Badge `↑` verde ou `↓` vermelho no canto superior direito
- R$ e tipo na mesma linha abaixo, cinza claro

- [ ] **Step 6: Commit**

```bash
git add src/components/ProgramCard.tsx
git commit -m "style: ProgramCard — border card, avatar neutro, badge de variação isolada"
```

---

## Task 4: Index.tsx — título "Meus programas" + border-radius dos botões de ação

**Files:**
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Adicionar link "Ver todos →" ao título da seção**

Localizar (~L2190):
```tsx
<section id="meus-programas" className="px-5 pb-1">
  <h2 className="section-label-lg text-lg">Meus programas</h2>
</section>
```
Substituir por:
```tsx
<section id="meus-programas" className="flex items-center justify-between px-5 pb-1">
  <h2 className="text-[15px] font-bold text-gray-900">Meus programas</h2>
  <span className="text-[11px] font-semibold text-[#8A05BE]">Ver todos →</span>
</section>
```

- [ ] **Step 2: Trocar border-radius do botão "+"**

Localizar (~L1951):
```tsx
className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-full border border-nubank-border bg-white px-2 text-[11px] font-semibold whitespace-nowrap text-nubank-text shadow-nubank transition-colors hover:bg-white/90 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
```
Substituir por:
```tsx
className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-[10px] border border-[#8A05BE] bg-white px-2 text-[11px] font-semibold whitespace-nowrap text-[#8A05BE] shadow-nubank transition-colors hover:bg-purple-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
```

- [ ] **Step 3: Trocar border-radius do botão "Solicitar Cotação"**

Localizar (~L2002):
```tsx
className="inline-flex h-9 w-full items-center justify-center rounded-full border border-transparent bg-primary px-2 text-[11px] font-semibold whitespace-nowrap text-primary-foreground shadow-nubank transition-colors hover:bg-primary/90"
```
Substituir por:
```tsx
className="inline-flex h-9 w-full items-center justify-center rounded-[10px] border border-transparent bg-primary px-2 text-[11px] font-semibold whitespace-nowrap text-primary-foreground shadow-nubank transition-colors hover:bg-primary/90"
```

- [ ] **Step 4: Trocar border-radius do botão de ação (Plano de Ação / feather)**

Localizar (~L2013):
```tsx
className={`inline-flex h-9 w-full items-center justify-center gap-1 rounded-full border border-nubank-border bg-transparent px-2 text-[11px] font-semibold whitespace-nowrap text-nubank-text shadow-nubank transition-colors hover:bg-white/90 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-700 ${
  !canEditActionPlan ? "cursor-not-allowed opacity-60" : ""
}`}
```
Substituir por:
```tsx
className={`inline-flex h-9 w-full items-center justify-center gap-1 rounded-[10px] border border-gray-200 bg-white px-2 text-[11px] font-semibold whitespace-nowrap text-nubank-text shadow-nubank transition-colors hover:bg-gray-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-700 ${
  !canEditActionPlan ? "cursor-not-allowed opacity-60" : ""
}`}
```

- [ ] **Step 5: Verificar visualmente**

Com o dev server rodando, verificar:
- Título "Meus programas" aparece ao lado de "Ver todos →" em roxo
- Botão "+" tem borda roxa e texto roxo, cantos não totalmente redondos
- Botão "Solicitar Cotação" tem cantos `rounded-[10px]`
- Botão de ação (feather/Plano de Ação) tem borda cinza e fundo branco com cantos `rounded-[10px]`

- [ ] **Step 6: Commit final**

```bash
git add src/pages/Index.tsx
git commit -m "style: Home — título 'Meus programas' com link + border-radius dos botões de ação"
```
