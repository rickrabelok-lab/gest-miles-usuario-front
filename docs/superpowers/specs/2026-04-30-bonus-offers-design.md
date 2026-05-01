# Design: Promoções Bonificadas

**Data:** 2026-04-30  
**Status:** Aprovado  
**Autor:** Rick Rabelok

---

## Visão Geral

Criação de um hub completo de promoções bonificadas no app Gest Miles, cobrindo 4 categorias:
1. **Transferências Bonificadas** — bônus % ao transferir pontos de bancos para programas
2. **Compras Bonificadas** — ganhar pts/milhas em lojas parceiras (pts/R$)
3. **Promoções de Milhas** — compra de milhas com desconto ou bônus
4. **Promoções de Cartões** — ofertas especiais de cartões de crédito

Referência visual: app Oktoplus. Design melhora o conceito com identidade Gest Miles (roxo, DM Sans, Space Grotesk).

---

## Escopo

### O que será implementado
- **`BonusOfferSection`** na Home — substitui a `BonusOffersSection` atual
- **`/bonus-offers`** — página completa reescrita com scroll + filtros
- **`/bonus-offers/:id`** — tela de detalhe com tabs e tiers

### O que NÃO será tocado
- Seção de saldo total estimado (já existe)
- Seção "Seus Programas" (já existe)
- Demais seções da Home

---

## Arquitetura

### Estrutura de Arquivos

```
src/
├── lib/
│   └── bonusMockData.ts              ← dados mockados de todas as categorias
├── hooks/
│   └── useBonusOffers.ts             ← filtragem por categoria, highlight, ordenação
├── components/bonus/
│   ├── BonusOfferSection.tsx         ← preview na Home (hero + lista rápida)
│   ├── BonusOfferCard.tsx            ← card reutilizável (home + lista)
│   ├── TransferBonusSection.tsx      ← seção: transferências bonificadas
│   ├── ShoppingBonusSection.tsx      ← seção: compras / lojas parceiras
│   ├── MilesBonusSection.tsx         ← seção: promoções de milhas
│   └── CardBonusSection.tsx          ← seção: promoções de cartões
└── pages/
    ├── BonusOffersScreen.tsx         ← /bonus-offers (reescrita completa)
    └── BonusOfferDetailScreen.tsx    ← /bonus-offers/:id
```

### Modelo de Dados

```typescript
type BonusCategory = 'transfer' | 'shopping' | 'miles' | 'cards'

interface BonusPromotion {
  id: string
  category: BonusCategory
  targetProgram: string        // "TudoAzul", "LATAM Pass", "Smiles"
  bonusValue: string           // "120%", "85pts/R$", "-30%", "2× pts"
  bonusLabel: string           // "de bônus", "por real gasto", "na compra"
  participatingBanks?: string[]
  tiers?: BonusTier[]
  partnerStores?: number       // quantidade de lojas parceiras
  maxBonus?: number            // ex: 300000 (pts máximos da promo)
  expiresAt?: string           // ISO date string
  isActive: boolean
  isHighlight: boolean         // true = aparece no hero da Home
  ctaUrl?: string              // URL externa do "Cadastrar-se" (abre em nova aba)
  rules?: string               // texto livre de regras
}

interface BonusTier {
  label: string                // "Clube Azul 5+ anos"
  value: string                // "120%"
  isBest?: boolean             // destaque visual no tier
}
```

### Hook `useBonusOffers`

```typescript
function useBonusOffers(category?: BonusCategory) {
  // retorna: { promotions, highlight, activeCount, expiringToday }
}
```

---

## Telas

### 1. Seção na Home (`BonusOfferSection`)

**Posição:** Substitui a `BonusOffersSection` atual no `Index.tsx`

**Layout:**
- Header: título "Promoções Bonificadas" + subtítulo "N ativas · N encerram hoje" + botão "Ver tudo →"
- **Hero banner:** card gradiente roxo com `isHighlight: true`. Exibe programa, valor do bônus em destaque (fonte grande), bancos participantes resumidos e badge "⏰ Encerra hoje" se vencer no dia
- **Lista rápida:** 2–3 items abaixo do hero, um por categoria (exceto a do hero), layout horizontal compacto: ícone de emoji + nome + valor colorido por categoria

**Cores por categoria:**
- Transferências: roxo `#8A05BE`
- Compras: laranja `#e67e22`
- Milhas: verde `#27ae60`
- Cartões: azul `#3498db`

---

### 2. Página Completa (`BonusOffersScreen` — `/bonus-offers`)

**Layout:**
- Header roxo com back + título
- **Pills de filtro** fixas logo abaixo do header (sticky): "Tudo · 🔄 Transferências · 🛍 Compras · ✈️ Milhas · 💳 Cartões"
- Selecionando uma pill, a view faz **scroll até a seção correspondente** (comportamento scroll-to-section; não esconde as demais seções — facilita implementação com mock data e mantém contexto de descoberta)
- **Scroll contínuo** com 4 seções em ordem: Transferências → Compras → Milhas → Cartões
- Cada seção tem header com emoji + título colorido + contagem de ofertas ativas

**Seção Transferências:** Cards full-width com:
  - Programa destino (nome + cor)
  - Bancos participantes (chips pequenos)
  - Badge lateral com bônus % em gradiente cor do programa
  - "⏰ Encerra hoje" em vermelho quando aplicável

**Seção Compras:** Carrossel horizontal de cards quadrados por **programa** (Livelo, Esfera, TudoAzul etc.) mostrando o melhor pts/R$ de cada um. Não lista lojas individuais — isso fica para fase 2. Último item é "Ver tudo →" (desabilitado na fase 1, fase 2 abre lista de lojas do programa).

**Seção Milhas:** Cards full-width similares ao de Transferências, com badge "-30%" ou equivalente

**Seção Cartões:** Cards full-width com oferta do cartão

---

### 3. Tela de Detalhe (`BonusOfferDetailScreen` — `/bonus-offers/:id`)

**Layout:**
- Header roxo com back + nome do programa
- **Tabs:** "Promoção" (ativa) | "Regras"
- **Tab Promoção:**
  - Hero badge: gradiente cor do programa, valor grande centralizado, label e subtítulo
  - Se `tiers` existir: lista de tiers com destaque no melhor (borda + background diferente)
  - Se `maxBonus` existir: aviso amarelo "⚠️ Bônus máximo: X pts"
  - Se `participatingBanks` existir: seção "Bancos participantes" com pills
  - Expiry em vermelho centralizado
  - **CTA roxo:** "Cadastrar-se na promoção →" (abre link externo em nova aba)
- **Tab Regras:** texto de `rules` em formato legível

---

## Navegação

```
Home (Index.tsx)
  └── BonusOfferSection → "Ver tudo" → /bonus-offers
        └── tap em qualquer promo → /bonus-offers/:id
              └── CTA "Cadastrar-se" → link externo (nova aba)
```

Rotas a registrar:
```typescript
{ path: '/bonus-offers', element: <BonusOffersScreen /> }
{ path: '/bonus-offers/:id', element: <BonusOfferDetailScreen /> }
```

---

## Dados Mock Iniciais

Mínimo para validar o design:
- 2 promoções de transferência (TudoAzul 120% com tiers, LATAM Pass 25%)
- 3 programas de compras (Livelo 85pts/R$, Esfera 30pts/R$, TudoAzul 25pts/R$)
- 1 promoção de milhas (Smiles -30%)
- 1 promoção de cartão (Nubank 2× pts em viagens)

`isHighlight: true` no TudoAzul 120% (aparece no hero da Home).

---

## Decisões de Design

| Decisão | Escolha | Alternativas descartadas |
|---|---|---|
| Estrutura da home section | Hero + lista rápida | Carrossel colorido, grid 2×2 |
| Estrutura da página completa | Scroll + pills de filtro | Abas fixas, hub de categorias |
| Detalhe da promo | Tela dedicada | Bottom sheet |
| Dados | Mock estático | Supabase (fase 2) |
| Arquitetura | Folder por domínio + hook | Monolítica, lazy loading |

---

## Fora de Escopo (fase 2)

- Integração com Supabase (tabelas reais de promoções)
- Notificações push de novas promoções
- Favoritar promoções
- Histórico de promoções encerradas
- Busca/filtro por texto dentro da página completa
