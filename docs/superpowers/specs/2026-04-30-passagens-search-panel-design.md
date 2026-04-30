# Design Spec: Painel de Busca de Passagens

**Data:** 2026-04-30  
**Status:** Aprovado pelo usuário

---

## Visão Geral

Reformular completamente o `SearchFlightsScreen.tsx` para um painel de busca de passagens de alta qualidade, inspirado no Oktoplus porém com design melhorado usando o tema roxo Gest Miles. Também integrar a busca funcional nos cards de destino do `DestinationCarousel.tsx`.

---

## Arquitetura

### Arquivos modificados
- `src/pages/SearchFlightsScreen.tsx` — refatoração completa da UI (lógica principal mantida)
- `src/components/DestinationCarousel.tsx` — adicionar feedback visual no clique do card (destino pré-preenchido ao navegar)

### Arquivos não modificados
- `src/contexts/SearchFlightsContext.tsx` — contexto existente é suficiente
- `src/lib/airports.ts` — sem alteração
- `src/components/BottomNav.tsx` — sem alteração
- `src/hooks/useDestinationBestPrices.ts` — sem alteração

### Dependências existentes utilizadas
- `react-day-picker` (já instalado) — para os date pickers de ida e volta
- `shadcn/ui Drawer` — mantido para airport picker e passageiros
- `shadcn/ui Button, Input` — mantidos
- `lucide-react` — ícones

---

## Componentes e Features

### 1. Toggle de Tipo de Viagem
- Estado: `tripType: "roundtrip" | "oneway"` (local state)
- UI: dois botões pill no topo — "Ida e volta" e "Somente ida"
- Ao selecionar "Somente ida": o campo de data de volta é removido/ocultado
- Ao selecionar "Ida e volta": campo de volta reaparece

### 2. Seção Origem / Destino (redesenhado)
- Layout vertical: origem em cima, destino embaixo, separados por linha tracejada
- Cada campo tem ícone colorido (roxo para origem, verde para destino)
- Botão ⇅ no canto direito para trocar os dois campos
- Ao clicar em qualquer campo: abre o Drawer existente de busca de aeroporto
- Quando vindo de card de destino (`?destination=XYZ` na URL): campo destino pré-preenchido com animação de highlight

### 3. Seletor de Datas
- Dois cards lado a lado: "Ida" e "Volta"
- Estado: `departureDate: Date | null` e `returnDate: Date | null` (local state)
- Ao clicar: abre um `Drawer` com `react-day-picker` (DayPicker) em modo single
- Data de volta tem botão × para limpar (transforma viagem em somente ida automaticamente)
- Formato exibido: "18 Jun 2026" + dia da semana por extenso
- Quando sem data: exibe placeholder "Selecionar data" em cor muted

### 4. Card de Passageiros + Classe
- Card único mostrando resumo: "1 Adulto · Econômica"
- Ao clicar: abre Drawer existente de passageiros
- Adicionado campo de classe (Econômica / Executiva) dentro desse mesmo Drawer

### 5. Toggle de Modo de Pagamento
- 3 opções: "Pts + R$" | "Pontos" | "Dinheiro"
- Mapeia para os valores existentes do contexto: `"both"`, `"points"`, `"money"`
- Estado local `paymentMode: "both" | "points" | "money"` em `SearchFlightsScreen` — **não altera o contexto** para evitar quebrar outros componentes
- Ao pesquisar, "both" mapeia para o modo "points" no contexto (comportamento default atual)
- Visualmente: pills com fundo roxo no ativo

### 6. Filtro de Companhias Aéreas
- Sempre visível (não mais em collapsible escondido)
- Header clicável mostra "N selecionadas" em badge roxo
- Chips das cias abaixo: GOL, LATAM, Azul, TAP, American Airlines
- Estado local: `selectedAirlines: string[]` (todas selecionadas por padrão)
- Passada como query param `airline` para `/price-calendar` (primeira cia selecionada, ou omitido se todas selecionadas)

### 7. Botão "Pesquisar passagens"
- Largura total, altura 52px, border-radius 16px
- Background: gradiente roxo (`linear-gradient(135deg, #8A05BE, #9E2FD4, #B56CFF)`)
- Ícone de lupa à esquerda
- Desabilitado quando origem ou destino não estão preenchidos
- Ao clicar: navega para `/price-calendar` com query params:
  - `airline` (primeira cia selecionada ou todas)
  - `departure` (data formatada)
  - `return` (data formatada, se roundtrip)

### 8. Seção "Destinos em destaque" (dentro do SearchFlightsScreen)
- Separador visual com label "Explorar destinos"
- Reutiliza o componente `DestinationCarousel` já existente
- Props: `origins` vindo do contexto, `onDestinationClick` preenche o campo destino
- Ao clicar num card: preenche o campo destino E faz scroll para o topo da tela

### 9. Filtros Avançados (período + feriados)
- Mantidos em collapsible, mas movidos para depois das cias aéreas
- Mesmo comportamento de drag-scroll existente

---

## Integração com Cards de Destino (Dashboard)

O fluxo já existe: `DestinationCarousel` → `onDestinationClick` → `navigate("/search-flights?destination=CWB")`.

Melhoria a implementar em `SearchFlightsScreen`:
- Ao ler `?destination=XYZ` da URL, preencher o campo e aplicar um highlight visual brevemente (border roxa pulsante por 1s) para indicar que foi pré-preenchido
- Scroll automático para o campo destino se vier de um card

---

## Paleta e Tokens

Usar exclusivamente variáveis e classes existentes no projeto:

| Elemento | Classe / Valor |
|---|---|
| Fundo da tela | `bg-nubank-bg` / `#F7F7F8` |
| Cards | `bg-white shadow-nubank rounded-[18px]` |
| Cor primária | `#8A05BE` / `text-nubank-primary` |
| Texto principal | `text-nubank-text` / `#1F1F1F` |
| Texto secundário | `text-nubank-text-secondary` / `#6B6B6B` |
| Botão CTA | `gradient-primary` + `shadow` roxo |
| Toggle ativo | `bg-nubank-primary text-white` |
| Toggle inativo | `bg-white text-nubank-text-secondary` |

---

## Estados e Fluxos

```
[Tela abre]
  → se ?destination=XYZ: preenche destino + highlight
  → se sem params: campos vazios, datas vazias

[Usuário preenche origem + destino]
  → botão "Pesquisar" fica habilitado

[Usuário clica "Pesquisar"]
  → navigate("/price-calendar?airline=GOL&departure=2026-06-18&return=2026-07-09")

[Usuário clica card de destino na seção inferior]
  → preenche campo destino
  → scroll para o topo
  → foco no campo de data de ida
```

---

## O que NÃO está no escopo

- Tela de resultados de voos (lista de voos com horários) — isso é o PriceCalendarScreen existente
- Integração real com API de voos — dados já vêm do demoFlightsService existente
- "Pesquisas recentes" — pode ser adicionado em iteração futura
- Histórico de preços 24h — Oktoplus feature, fora do escopo desta iteração
