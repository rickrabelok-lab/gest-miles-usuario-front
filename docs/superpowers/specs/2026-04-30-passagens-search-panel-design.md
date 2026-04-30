# Design Spec: Fluxo Completo de Passagens

**Data:** 2026-04-30  
**Status:** Aprovado pelo usuário (fluxo completo + feature flag Gest Miles)

---

## Visão Geral

Reformular completamente o fluxo de busca de passagens, substituindo o `/price-calendar` como destino principal por um fluxo de 4 novas telas estilo Oktoplus redesenhado com tema roxo Gest Miles premium. Também integrar a busca funcional nos cards de destino do `DestinationCarousel.tsx`.

---

## Fluxo Completo

```
SearchFlightsScreen (/search-flights)   ← redesenhada
        ↓ [Pesquisar passagens]
FlightResultsScreen (/flight-results)   ← nova
        ↓ [Clicar num voo → Drawer]
PaymentOptionsDrawer                    ← Drawer dentro do FlightResultsScreen
        ↓ [Confirmar seleção]
EmissionDetailsScreen (/emission-details) ← nova
        ↓ [Iniciar compra]
PurchaseOptionsScreen (/purchase-options) ← nova
```

A rota `/price-calendar` é **mantida** como rota alternativa acessível via menu, mas não é mais o destino do botão "Pesquisar passagens".

---

## Arquivos

### Novos
- `src/pages/FlightResultsScreen.tsx`
- `src/pages/EmissionDetailsScreen.tsx`
- `src/pages/PurchaseOptionsScreen.tsx`
- `src/config/features.ts` — feature flags

### Modificados
- `src/pages/SearchFlightsScreen.tsx` — redesign completo da UI
- `src/App.tsx` — adicionar 3 novas rotas

### Não modificados
- `src/contexts/SearchFlightsContext.tsx`
- `src/hooks/useDestinationBestPrices.ts`
- `src/services/demoFlightsService.ts`
- `src/components/BottomNav.tsx`
- `src/pages/PriceCalendarScreen.tsx`

---

## Feature Flag

```ts
// src/config/features.ts
export const GESTMILES_EMISSION_ENABLED = false
```

Controla se o card "Emitir com Gest Miles" aparece na `PurchaseOptionsScreen`. O componente já existe renderizado no JSX — mudar para `true` o ativa completamente, sem nenhuma outra alteração necessária.

---

## Tela 1 — SearchFlightsScreen (redesenhada)

### Estado local
- `tripType: "roundtrip" | "oneway"` — padrão `"roundtrip"`
- `departureDate: Date | null`
- `returnDate: Date | null`
- `paymentMode: "both" | "points" | "money"` — padrão `"both"` (não altera SearchFlightsContext)
- `selectedAirlines: string[]` — todas selecionadas por padrão

### Componentes
1. **Toggle Ida e volta / Somente ida** — pills no topo; "Somente ida" oculta o campo de volta
2. **Rota** — layout vertical com ícones coloridos (roxo origem, verde destino), botão ⇅ para trocar; abre Drawer existente de aeroporto ao clicar
3. **Datas** — dois cards lado a lado com `react-day-picker` (Drawer ao clicar); volta tem botão × para limpar
4. **Passageiros + Classe** — card compacto, abre Drawer existente
5. **Modo de pagamento** — toggle 3 opções: "Pts + R$" / "Pontos" / "Dinheiro"
6. **Cias Aéreas** — chips sempre visíveis (GOL, LATAM, Azul, TAP, American)
7. **Botão CTA** — "Pesquisar passagens" roxo gradiente, desabilitado sem origem/destino; navega para `/flight-results` com query params
8. **Destinos em destaque** — `DestinationCarousel` reutilizado na parte inferior; clique preenche o campo destino + scroll para o topo

### Integração com cards do Dashboard
- URL `?destination=CWB` pré-preenche o campo destino com highlight visual (border roxa pulsante 1s)

### Navegação para FlightResults
```
/flight-results?from=SAO&to=CWB&dep=2026-06-18&ret=2026-07-09&mode=both&airlines=GOL,LATAM
```

---

## Tela 2 — FlightResultsScreen (`/flight-results`)

### Header
- Hero roxo gradiente com rota (SAO → CWB), datas, nº de passageiros
- Botão "✏ Editar busca" abre Drawer de edição rápida (volta para SearchFlightsScreen preenchida)

### Navegador de datas
- Carrossel horizontal com 7 dias centrado na data selecionada
- Cada dia mostra: dia da semana abreviado, número, preço mais barato disponível naquele dia
- Dia mais barato tem indicador verde "★"
- Dia selecionado tem underline roxo

### Tabela resumo por cia aérea
- Colunas: Cia Aérea | Pontos | A partir de (R$)
- Logo pill colorido por cia (azul=Azul, laranja=GOL, vermelho=LATAM)
- Botão "+" para expandir detalhes por cia
- Menor preço em R$ destacado com cor verde + "★"

### Tabs Voo de Ida / Voo de Volta
- Primeira seleção é o voo de ida; após selecionar ida, aba de volta fica disponível
- Cada aba mostra a data correspondente

### Filtro e ordenação
- Linha com "Filtrar resultado" + contagem de voos + "✓ Dica Gest Miles"
- Header de colunas clicável para ordenar: Horário | Pontos | R$ (padrão: R$ crescente)

### Cards de voo
- Por linha: horário partida → chegada, cia logo + duração + badge Direto/Escala, pontos, R$
- Badge "★ Melhor custo" no voo com melhor relação pontos/R$ da lista
- Voo selecionado: border roxa + checkmark
- "+ info" expande detalhes do voo inline

### Bottom bar sticky
- Aparece após selecionar o voo de ida
- Mostra: "IDA · CGH 06:40 → CWB 07:45 · GOL" + preço
- Botão "Selecionar voo de volta →" ou "Ver opções de pagamento" (somente ida)
- Ao clicar em "Ver opções de pagamento": abre `PaymentOptionsDrawer`

### PaymentOptionsDrawer (dentro desta tela)
- Drawer bottom sheet com handle
- Título: "Como quer usar seus pontos?"
- Lista de opções radio: pontos cheios, pts + R$ em proporções crescentes
- Cada opção tem label descritivo e tag "Mais pts" / "Misto"
- Botão "Confirmar seleção →" navega para `/emission-details` com params

---

## Tela 3 — EmissionDetailsScreen (`/emission-details`)

### Estrutura
- Header com rota + datas, botão voltar
- Tabs: **Ida** / **Volta** / **Total** (tab Total ativa por padrão)
- Tag colorida por trecho: roxo para IDA, verde para VOLTA

### Card de voo por trecho
- Background levemente colorido (roxo para ida, verde para volta)
- Linha de rota com IATA + linha gradiente + ✈ + IATA destino
- Horários de partida e chegada + cidade
- Duração centralizada + "sem paradas" / "N escala(s)"

### Resumo de valores
- Lista: Tarifa adulto, Adulto(s) × N, Taxa de embarque
- Linha total em destaque (maior fonte, roxo)

### CTA
- Botão sticky "Iniciar compra →" navega para `/purchase-options`

---

## Tela 4 — PurchaseOptionsScreen (`/purchase-options`)

### Estrutura
- Hero roxo gradiente com "Como deseja adquirir?" + rota pill
- Dois cards empilhados

### Card 1 — Site da Cia Aérea (sempre visível)
- Logo da cia aérea
- Total estimado em destaque
- Breakdown: tarifa + taxa de embarque + total
- Botão "Ir para o site da [Cia] ↗" — abre URL da cia aérea em nova aba

### Card 2 — Emitir com Gest Miles (controlado por feature flag)
```tsx
{GESTMILES_EMISSION_ENABLED && (
  <GestMilesEmissionCard ... />
)}
```
- Enquanto `false`: exibe placeholder discreto (esmaecido, dashed border, badge "Em breve")
- Enquanto `true`: card completo com breakdown, benefícios listados, botão "Emitir agora →"

---

## Paleta e Tokens

| Elemento | Classe / Valor |
|---|---|
| Fundo telas | `bg-nubank-bg` / `#F7F7F8` |
| Cards | `bg-white shadow-nubank rounded-[18px]` |
| Hero headers | `gradient-primary` (`#8A05BE → #6A00A3`) |
| Cor primária | `#8A05BE` |
| Texto principal | `text-nubank-text` / `#1F1F1F` |
| Texto secundário | `text-nubank-text-secondary` / `#6B6B6B` |
| Botão CTA | `gradient-primary` + `shadow` roxo |
| Destaque positivo | `#16a34a` (verde) para menor preço |
| Badge direto | verde claro |
| Badge escala | laranja claro |

---

## Dados (demo / Supabase)

- `SearchFlightsScreen` — usa contexto existente + estado local de datas
- `FlightResultsScreen` — expande `demoFlightsService` para retornar voos por horário; tabela de cias usa `useDestinationBestPrices`
- `PaymentOptionsDrawer` — opções geradas localmente com proporções pts/R$ configuráveis
- `EmissionDetailsScreen` — recebe dados via query params + state do React Router
- `PurchaseOptionsScreen` — dados vindos do estado de navegação; URL da cia aérea hardcoded por cia

---

## Roteamento (App.tsx)

```tsx
<Route path="/flight-results"    element={<ClienteOnly><FlightResultsScreen /></ClienteOnly>} />
<Route path="/emission-details"  element={<ClienteOnly><EmissionDetailsScreen /></ClienteOnly>} />
<Route path="/purchase-options"  element={<ClienteOnly><PurchaseOptionsScreen /></ClienteOnly>} />
```

O botão "Passagens" no `BottomNav` continua apontando para `/search-flights` (sem alteração).

---

## Fora do escopo desta iteração

- Integração real com API de voos ao vivo
- "Pesquisas recentes" no topo do SearchFlightsScreen
- Histórico de preços 24h
- Filtros avançados na tela de resultados (por horário, paradas, duração)
- Implementação completa da emissão Gest Miles (só o card placeholder)
