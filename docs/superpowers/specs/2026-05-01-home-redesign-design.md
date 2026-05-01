# Home Redesign — Ultra Clean

**Data:** 2026-05-01  
**Status:** Aprovado

## Objetivo

Melhorar o visual da Home sem alterar nenhuma lógica, fluxo ou estrutura de componentes. O resultado deve ser mais profissional, intuitivo e elegante.

## Decisões de Design

- **Estilo:** Ultra Clean — fundo levemente off-white (`#F8F8FA`), bordas finas, sem sombras pesadas
- **Cards de programa:** Avatar cinza neutro quadrado/arredondado, sem cor por programa
- **Tipografia de números:** `font-weight: 800`, `letter-spacing: -0.5px` para destaque

## Escopo — apenas mudanças visuais

Nenhuma lógica, prop, estado ou rota será alterada. Apenas classes Tailwind e estilos CSS.

---

## Componentes afetados

### 1. `DashboardHeader`

**Antes:** gradiente roxo com efeitos de camada  
**Depois:**
- Background: `bg-[#8A05BE]` flat (sem gradiente)
- Avatar: `rounded-lg` (quadrado arredondado) em vez de `rounded-full`
- Título: `uppercase tracking-widest` para mais personalidade

### 2. Banner de bônus (notificação inline na Home)

**Antes:** fundo branco com pill arredondado, texto genérico  
**Depois:**
- Background: `bg-amber-50` (`#FFFBEB`)
- Borda: `border border-amber-200` (`#FDE68A`)
- Ícone ⚡ em `text-amber-600`
- Texto principal em `text-amber-900`, valor destacado em `text-amber-600 font-bold`

### 3. `BalanceTabs`

**Antes:** tab ativa = pill preenchido roxo; inativas = pill com borda cinza  
**Depois:**
- Container: `border-b border-gray-200` (linha horizontal divisória)
- Tab ativa: `text-[#8A05BE] font-bold border-b-2 border-[#8A05BE]` (underline)
- Tabs inativas: `text-gray-400` sem borda, sem background
- Remover `rounded-full` e `bg-*` dos tabs

### 4. Botões de ação (linha com `+`, `Solicitar Cotação`, ícone)

**Antes:** botão "+" com borda cinza genérica; ícone com borda cinza  
**Depois:**
- Botão "+": `border-[1.5px] border-[#8A05BE] text-[#8A05BE] font-bold rounded-[10px]`
- Botão "Solicitar Cotação": `bg-[#8A05BE] rounded-[10px]` (manter funcionalidade, afinar border-radius)
- Botão ícone: `border-[1.5px] border-gray-200 rounded-[10px] bg-white`

### 5. `ProgramCard`

**Antes:** sombra `shadow-nubank`, avatar circular colorido por programa, variação inline com o número  
**Depois:**
- Container: `border border-[#EBEBEB] rounded-xl` — remover sombra ou trocar por `shadow-none`
- Avatar: `w-[22px] h-[22px] rounded-md bg-gray-100 text-gray-500` (quadrado, cinza neutro para todos)
- Layout interno: número em linha própria com `text-[15px] font-extrabold tracking-tight text-gray-900`
- Badge de variação: mini pill no canto superior direito do card
  - `↑` positivo: `text-green-700 bg-green-50 px-1.5 py-0.5 rounded text-[8px] font-bold`
  - `↓` negativo: `text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[8px] font-bold`
  - neutro/zero: `text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded text-[8px] font-bold`
- Valor R$ e CPM: mesma linha, `text-[9px] text-gray-400`

### 6. Seção "Meus programas" — título

**Antes:** só o título  
**Depois:**
- `flex justify-between items-center`
- Título: `text-[15px] font-bold text-gray-900`
- Link "Ver todos →": `text-[11px] text-[#8A05BE] font-semibold` — puramente visual, sem `onClick` novo; se o código já tiver um handler existente para exibir todos os programas, mantê-lo intacto

---

## O que NÃO muda

- Nenhuma prop dos componentes
- Nenhum estado ou handler
- Nenhuma rota
- Nenhuma seção removida ou adicionada
- Lógica de exibição condicional (Insights, Timeline para gestores) permanece igual
- `BottomNav`, `DestinationCarousel`, `BonusPromotionsSection`, `SmartRedemptionSuggestions` — fora do escopo

---

## Tokens de referência

| Token | Valor |
|-------|-------|
| Primary | `#8A05BE` |
| Background page | `#F8F8FA` |
| Card border | `#EBEBEB` |
| Tab active underline | `#8A05BE` |
| Tab inactive text | `#9CA3AF` (gray-400) |
| Banner bg | `#FFFBEB` (amber-50) |
| Banner border | `#FDE68A` (amber-200) |
| Number weight | `800` (font-extrabold) |
| Number tracking | `-0.5px` (tracking-tight) |
| Avatar bg | `#F3F4F6` (gray-100) |
| Avatar text | `#6B7280` (gray-500) |
| Avatar border-radius | `6px` (rounded-md) |
