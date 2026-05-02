# Redesign: Milhas Vencendo

**Data:** 2026-05-02
**Status:** Aprovado

---

## Visão geral

Substituir os cards simples da página "Milhas Vencendo" por um layout com faixas de urgência agrupadas, cards com identidade visual por programa, e estado vazio amigável. Design clean, mobile-first, sem destaques pesados.

---

## Layout da página

### Header
- Título: "Milhas Vencendo"
- Badge no canto direito com o total de programas visíveis (ex: "5 programas")
- Fundo branco, borda inferior sutil

### Faixas de urgência

Três faixas possíveis, exibidas somente quando há pelo menos um programa naquela faixa:

| Faixa | Intervalo | Cor |
|---|---|---|
| Crítico | ≤ 30 dias | Vermelho (`#EF4444` / `#B91C1C`) |
| Atenção | 31 – 60 dias | Âmbar (`#F59E0B` / `#92400E`) |
| Tranquilo | > 60 dias | Verde (`#22C55E` / `#166534`) |

Cada cabeçalho de faixa contém:
- Ponto colorido (8px, cor da faixa)
- Label em uppercase e bold (cor escura da faixa)
- Pill com o intervalo de dias (fundo claro + texto escuro da faixa)

Separador `1px #EBEBEB` entre faixas.

### Cards

Cada programa dentro de uma faixa renderiza um card com:
- **Avatar**: quadrado 34×34px, border-radius 10px, iniciais do programa (máx. 2 letras), gradiente de cor fixo por programa
- **Nome do programa**: 12px bold, truncado com ellipsis se necessário
- **Linha secundária**: `{quantidade} pts · {data formatada}` — 10px, cinza claro
- **Dias restantes**: número grande (14px, 900 weight) na cor da faixa + label "dias" abaixo (9px, cinza)
- Fundo branco, border-radius 12px, sombra `0 1px 4px rgba(0,0,0,0.06)`

### Estado vazio

Exibido quando não há nenhum programa válido (sem programas cadastrados ou todos já vencidos):
- Ícone 🎉 opacidade baixa
- Título "Tudo em dia!" (bold)
- Subtítulo "Nenhuma milha vencendo nos próximos dias."

---

## Regras de exibição

| Regra | Comportamento |
|---|---|
| Programa vencido (data < hoje) | Oculto — não aparece em nenhuma faixa |
| Faixa sem programas | Não renderiza o cabeçalho nem o separador |
| Ordenação dentro de cada faixa | Por `diasRestantes` crescente (menor primeiro) |

---

## Design system

- **Fonte:** DM Sans
- **Border-radius cards:** 12px
- **Sombra cards:** `0 1px 4px rgba(0,0,0,0.06)`
- **Background da página:** `#F4F4F8` (igual ao restante do app)
- **Separador entre faixas:** `1px solid #EBEBEB`

---

## Componente

- **Arquivo:** `src/pages/VencimentosPage.tsx` (modificar in-place)
- Lógica de agrupamento por faixa feita via `useMemo` derivado do array `items`
- Tipo `VencimentoMeuItem` existente mantido sem alteração: `{ programName, data, diasRestantes, quantidade }`

---

## O que NÃO muda

- Fonte de dados (`useProgramasCliente`) — sem alteração
- Tipo `VencimentoMeuItem` — sem alteração
- Lógica de cálculo de `diasRestantes` — sem alteração
