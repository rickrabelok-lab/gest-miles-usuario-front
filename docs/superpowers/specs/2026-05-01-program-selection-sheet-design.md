# Design: Bottom Sheet de Seleção de Programas

**Data:** 2026-05-01  
**Status:** Aprovado pelo usuário

---

## Visão geral

Substituir o dropdown simples de checkboxes em `Index.tsx` por um bottom sheet full-screen elegante e mobile-first para gerenciar os programas visíveis no home.

---

## Comportamento

- Acionado pelo botão `+ Novo` na seção "Meus programas" do home
- Sheet sobe animado cobrindo quase toda a tela (top: ~48px, deixando a status bar visível)
- Fundo dimmed + blur atrás do sheet
- Grab pill no topo para fechar via swipe ou botão ✕
- Botão "Confirmar seleção" fixo no rodapé do sheet
- Persistência em localStorage (comportamento existente mantido)

---

## Layout interno do sheet

### Header fixo
- Grab pill centralizado
- Título "Meus Programas" + contador badge "X ativos"
- Botão ✕ para fechar
- Campo de busca com borda roxa ao focar

### Corpo scrollável (duas seções)

**Seção Ativos**
- Label `ATIVOS (n)` com linha separadora e badge roxo
- Cada item: dot verde + logo colorido (34×34, border-radius 9px) + nome + saldo + botão `−` vermelho
- Tap no `−` remove imediatamente (sem confirm)

**Seção Disponíveis**
- Label `DISPONÍVEIS (n)` com linha separadora e badge cinza
- Cada item: logo + nome + descrição curta + botão `+` roxo (opacidade reduzida)
- Tap no `+` move para Ativos imediatamente

### Busca em tempo real
- Filtra nome nas duas seções simultaneamente
- Match highlight: texto matching com fundo `rgba(124,58,237,0.3)` + border-radius 3px
- Campo focused: borda `#7c3aed`, link "limpar" à direita
- Empty state por seção: mensagem amigável quando não há resultado

---

## Componente

Criar `src/components/ProgramSelectionSheet.tsx` com as seguintes props:

```ts
interface ProgramSelectionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  programDefs: ProgramCardData[];
  onToggle: (option: ProgramCardData) => void;
  availableOptions: ProgramCardData[];   // AVAILABLE_PROGRAM_OPTIONS
}
```

O componente não gerencia estado de programas — delega para o pai (`Index.tsx`) via `onToggle`, exatamente como o dropdown atual funciona.

---

## Animação

- Sheet: `transform: translateY(100%)` → `translateY(0)` com `transition: 0.35s cubic-bezier(0.32, 0.72, 0, 1)`
- Dim overlay: `opacity: 0` → `opacity: 1` com `transition: 0.3s ease`
- Entrada de itens: sem animação extra (performance mobile)

---

## Visual / tokens

| Elemento | Valor |
|---|---|
| Sheet background | `#16162a` |
| Grab pill | `#3d3d5c`, 40×4px |
| Active dot | `#34d399`, 6px |
| Botão remover | `rgba(239,68,68,0.12)` + borda `rgba(239,68,68,0.25)` |
| Botão adicionar | `rgba(124,58,237,0.12)` + borda `rgba(124,58,237,0.25)` |
| Confirm button | `gradient(#7c3aed, #a855f7)`, shadow `rgba(124,58,237,0.35)` |
| Busca focused border | `#7c3aed` |
| Match highlight | `rgba(124,58,237,0.3)` |

---

## O que NÃO muda

- Lógica de `handleToggleProgramCard` em `Index.tsx` (reaproveitada via prop)
- Persistência em localStorage
- Estrutura de dados `ProgramCardData`
- `AVAILABLE_PROGRAM_OPTIONS`

---

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/components/ProgramSelectionSheet.tsx` | **Novo** — componente do sheet |
| `src/pages/Index.tsx` | Substituir dropdown inline pelo novo componente |
