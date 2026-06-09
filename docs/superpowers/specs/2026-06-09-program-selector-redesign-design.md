# Redesenho do seletor de programas (ProgramSelectionSheet)

**Data:** 2026-06-09
**Status:** Aprovado (design) — pendente plano de implementação
**Escopo:** Front-only. Sem backend, sem migration, sem mudança de contrato.

## Problema

O seletor de programas (botão "Novo" no `Index.tsx` → `ProgramSelectionSheet`) mostra **iniciais coloridas** no lugar das logos e lista os 22 programas numa pilha única, sem agrupamento. Visual fraco e difícil de escanear.

## Objetivo

1. **Logos reais** no lugar das iniciais (com fallback que nunca quebra).
2. **Agrupar por categoria** (companhias aéreas, pontos, bancos, hotéis, outros).
3. **Tema claro** alinhado ao app (hoje o sheet é dark `#16162a`, destoa do app nubank claro).
4. Navegação por **chips de filtro** + seções com header sticky.
5. **Remover** o programa "Avios (IAG)" do catálogo.

Mockup aprovado: `program-selector-mockup.html` (raiz, arquivo descartável de validação).

## Decisões de design (travadas com o owner)

| Tema | Decisão |
|------|---------|
| Tema visual | **Claro**, alinhado ao app (branco `#FFFFFF`/`#F7F7F8`, acento roxo `#8A05BE`, borda `#ECECEC`). Mantém o gesto de bottom-sheet (grab pill, slide-up, overlay, botão "Confirmar seleção" fixo). |
| Logos | **CDN por domínio** com fallback robusto. Ordem por programa: (1) logo custom de branding/localStorage se houver → (2) `logo.clearbit.com/{domínio}` → (3) **badge de marca** (cor oficial + monograma) via `<img onError>`. Nunca fica quebrado. Sem caminho de asset local no sheet (os PNGs de cia aérea têm fundo escuro e exigiriam o processamento de canvas do `AirlineLogo`; o Clearbit resolve latam/azul/gol/tap/american bem). |
| Categorias | **4 grupos + "Outros"**. |
| Navegação | Fileira de **chips** (`Todos · Aéreas · Pontos · Bancos · Hotéis · Outros`) que filtra + **seções com header sticky**. Busca por texto continua e cruza com o chip ativo. |
| Seleção | Mantém o padrão atual **adicionar/remover** (`onToggle`): ativo = ✓ (preenchido), inativo = + (contorno roxo). Sem trocar a lógica do `Index.tsx`. |

### Tradeoff aceito (logos via CDN)

O `logo.clearbit.com` é dependência externa e a requisição vaza pro Clearbit **quais** programas existem (sem PII — é logo por domínio de marca pública). Vários programas BR (Coopera, KMV, BRB Dux, Átomos C6, possivelmente Esfera) vão cair no badge (passo 3). Por isso o badge precisa ficar bom de qualquer jeito. Se o owner mandar os arquivos depois, viram asset local (passo 1) sem mexer na arquitetura.

## Mapa de categorias (21 programas, pós-remoção de Avios)

- **✈️ Companhias aéreas (10):** `latam-pass`, `smiles`, `tudo-azul`, `iberia`, `copa-airlines`, `finnair`, `qatar-airways`, `british-airways`, `tap`, `american-airlines`
- **⭐ Pontos & coalizão (2):** `livelo`, `esfera`
- **🏦 Bancos & cartões (6):** `itau`, `inter-loop`, `amex`, `atomos-c6`, `uau-caixa`, `brb-dux`
- **🏨 Hotéis (1):** `all-accor`
- **• Outros (2):** `coopera`, `kmv`

## Mapa de domínios para logo (CDN)

`latam-pass→latam.com` · `smiles→smiles.com.br` · `tudo-azul→voeazul.com.br` · `iberia→iberia.com` · `copa-airlines→copaair.com` · `finnair→finnair.com` · `qatar-airways→qatarairways.com` · `british-airways→britishairways.com` · `tap→flytap.com` · `american-airlines→aa.com` · `livelo→livelo.com.br` · `esfera→esfera.com.vc` · `itau→itau.com.br` · `inter-loop→bancointer.com.br` · `amex→americanexpress.com` · `atomos-c6→c6bank.com.br` · `uau-caixa→caixa.gov.br` · `brb-dux→brb.com.br` · `all-accor→all.accor.com` · `coopera→(sem domínio → badge)` · `kmv→(sem domínio → badge)`

## Componentes e arquivos

### `src/components/programSelectionUtils.ts`
- Adicionar `ProgramCategory = "aereas" | "pontos" | "bancos" | "hoteis" | "outros"`.
- Estender `ProgramOption` com `category: ProgramCategory` (e `ActiveProgram` herda).
- Nova função `groupByCategory(list, order)` → retorna seções `{ category, label, emoji, items }` na ordem fixa, omitindo vazias.
- Manter `filterPrograms` e `highlightSegments` como estão.
- Metadados de categoria (label + emoji + ordem) ficam aqui como constante única (fonte da verdade compartilhada entre chips e seções).

### `src/components/ProgramSelectionSheet.tsx` (reescrita visual)
- Trocar paleta dark → clara (tokens acima).
- Adicionar estado `activeChip: ProgramCategory | "todos"` + fileira de chips com contagem por categoria.
- Render: para cada seção (na ordem fixa), header sticky (emoji + label + contador) e as linhas; cruza filtro de chip + busca.
- Novo `ProgramLogo` (subcomponente): tile branco com `<img src={cdn} onError→badge>`; badge = cor da marca + monograma (`logo`/`logoColor`). Prioriza `logoImageUrl` (asset local/branding/CDN resolvido) já passado via prop `logoImages`.
- `ProgramRow`: logo + nome (com highlight da busca) + sub (saldo se ativo) + botão +/✓.
- Manter props atuais (`isOpen`, `onClose`, `activePrograms`, `onToggle`, `availableOptions`, `logoImages`) — sem quebrar o caller.
- Empty state quando filtro+busca não casam.

### `src/pages/Index.tsx`
- Adicionar `category` e `domain` a cada item de `AVAILABLE_PROGRAM_OPTIONS` e `PROGRAM_META_MAP` (ou um mapa lateral `PROGRAM_CATEGORY`/`PROGRAM_LOGO_DOMAIN` para não inchar as duas estruturas).
- Resolver a URL de logo por programa (asset local > CDN por domínio) e mesclar no `programLogoImagesForSheet` já passado em `logoImages`. Fallback de badge é responsabilidade do componente (onError).
- **Remover o programa `avios`** de `AVAILABLE_PROGRAM_OPTIONS` (linhas ~521–526) e de `PROGRAM_META_MAP` (linha ~240). Só essas duas entradas.

### Asset — NÃO deletar
- `src/assets/program-avios.svg` **continua em uso** pelo plano de ação (`ACTION_PLAN_PROGRAM_ICON_BY_KEY.avios`, linha ~113), que é um "avios" diferente (chave do `useGestor`, não o programa do catálogo). Manter o arquivo, o import `programAviosLogo` e o par `["avios","Avios"]` em `ACTION_PLAN_PROGRAM_LABELS`.

### Fora de escopo (NÃO mexer)
- **Avios como moeda** em `LoyaltyProgramDetails.tsx` (Ibéria/British/Qatar/Finnair → `"avios"`): esses programas continuam existindo e acumulam Avios; mantém.
- **Avios do plano de ação** (`ACTION_PLAN_PROGRAM_LABELS`, `ACTION_PLAN_PROGRAM_ICON_BY_KEY`, `useGestor` plan keys): feature separada keyed pelo `useGestor`, não tocar.
- Flags de perfil em `ClientProfile.tsx` que citam `avios`: feature separada, não tocar.
- Fluxo de cotação, cards do `Index`, versão dark antiga.

## Testes (Vitest — rede de segurança principal)

Foco no que é puro/testável sem brigar com o `requestAnimationFrame`/portal do sheet:

`src/components/__tests__/ProgramSelectionSheet.test.tsx` (atualizar):
- `categoryOf`: mapeia cada programId pra categoria certa; id desconhecido → `"outros"`.
- `groupByCategory`: ordem fixa (aereas→pontos→bancos→hoteis→outros); seções vazias somem; bucketiza por programId.
- `filterPrograms`/`highlightSegments`: manter os testes atuais passando.
- `ProgramLogo` (exportado pra teste): renderiza `<img>` com `src` quando há URL; cai no badge (monograma + cor) no `onError` e quando não há URL.

Avios removido do catálogo: verificado por `tsc -b`/`build` + checagem manual (a const `AVAILABLE_PROGRAM_OPTIONS` não é exportada; sem teste unitário dedicado).

## Verificação antes de "pronto"
- `npx tsc -b` limpo
- `npm test` passando
- `npm run build` ok
- Conferir no app: abrir o sheet, ver logos reais carregando, badges nos que não resolvem, chips filtrando, busca, +/−.

## Riscos
- Clearbit pode mudar/descontinuar → degradação graciosa pro badge (já coberto pelo onError). Sem hard-fail.
- Domínios errados → badge (sem erro visível). Ajuste é trocar string.
