# Fix: lotes inflados (reconstrução ignora saídas)

**Data:** 2026-07-13 · **Repos:** `gest-miles-usuario-front` + `gest-miles-manager-front` · **Banco:** compartilhado (prod, sem staging)

## Problema

A tela de detalhe do programa (`LoyaltyProgramDetails.tsx`) reconstrói os "lotes" (milhas com validade) quando o `state` carregado não tem `lotes` persistidos. A reconstrução soma **todas as entradas com validade** e **nunca subtrai as saídas** (`:514-528` no usuario, `:938-948` no manager). O `saldo` reflete entradas − saídas; os lotes reconstruídos refletem só entradas. A diferença = tudo que já foi emitido.

**Efeito:** `sum(lotes) > saldo` → o cliente vê milhas **já gastas** como "a vencer" no card, na lista de lotes e na aba Alertas — justamente a feature cujo propósito é precisão de vencimento.

**Evidência (prod, verificada 2×, project `jntkpcjmmnaghmimdcam`):**
- 1341 programas, 342 com lotes; **59 (17% dos com lotes) têm `sum(lotes) > saldo`**.
- 50 têm o excesso batendo exatamente com Σ saídas (±1) → mecanismo confirmado.
- Pior excesso: 769.323 milhas. Recorrência: 47/59 mexidos em 30d, o mais recente 2026-07-12 → **vivo**, não resíduo.
- Código pré-junho (commit inicial), presente **idêntico** nos 2 repos. O manager é o app onde o gestor edita programas → provável principal escritor.

## Regra correta (a correção)

A regra viva do app (`handleSalvarSaida:924-947`) é: **saída debita FIFO dos lotes mais próximos de vencer primeiro**, floora em 0, remove zerados. A reconstrução tem que aplicar as saídas com a mesma regra.

**Escolha aprovada:** replay **cronológico** — reproduz os movimentos na ordem das datas; cada entrada com validade cria/soma seu lote; cada saída debita FIFO por validade. Resultado idêntico ao que o app produziria mantendo os lotes desde o início.

## Componentes

### 1. Função pura `reconstruirLotesDeMovimentos` (em `lib/program-state.ts`, nos 2 repos)

```
reconstruirLotesDeMovimentos(movimentos: Movimento[]): LoteMilhas[]
```
- Ordena os movimentos por data ascendente via `parseMovimentoDate` (saída usa `dataEmissao ?? data`; entrada usa `data`). Datas não-parseáveis vão pro fim, ordem estável.
- Acumula por `validadeLote` (um lote por validade distinta; `id = validadeLote`):
  - `entrada` com `validadeLote` e `milhas > 0` → soma no lote.
  - `saida` com `milhas > 0` → debita `milhas` dos lotes com `quantidade > 0` ordenados por validade ascendente (FIFO por vencimento), floorando cada lote em 0; sobra é descartada (consumiu saldo sem validade).
- Retorna só lotes com `quantidade > 0`.
- **Invariante garantido:** `sum(lotes) ≤ Σ entradas-com-validade − Σ saídas ≤ saldo` (quando há saldo suficiente).

**Testes (Vitest):** só-entrada; entrada+saída (debita); ordem FIFO (vence-antes primeiro, mesmo com entrada mais nova tendo validade mais curta); saída > entradas (floor em 0, sem negativo); movimento sem validade não vira lote; formato de data misto (YYYY-MM-DD e dd/mm/aaaa).

### 2. Call sites (nos 2 repos)

Trocar o `reduce` só-de-entradas no `useEffect` de load por `setLotes(reconstruirLotesDeMovimentos(movimentos))`. Nenhuma outra lógica do efeito muda. **Não tocar** na reconciliação local↔servidor (`_localRevisionMs`, já auditada) nem em `handleSalvarEntrada`/`handleSalvarSaida` (já corretos).

### 3. Correção de dados (59 linhas em prod)

- Processo: `SELECT` das 59 linhas afetadas (id, saldo, state.movimentos) → recomputa `lotes` **localmente** com a mesma função → gera `UPDATE ... set state = jsonb_set(state,'{lotes}', <novo>) where id = <id>` por linha.
- **Salvaguardas:** só as linhas onde `sum(lotes) > saldo`; idempotente (re-rodar dá o mesmo resultado); preview antes/depois por linha mostrado ao owner; **só aplica com OK explícito do owner no SQL/preview**; banco compartilhado → sem migration file, aplicação pontual coordenada.
- Não recomputar as 283 linhas já corretas (`sum(lotes) == saldo`) — deixa intactas.

## Verificação

- Gate nos 2 repos: `tsc -b` (usuario) / `tsc -p` (manager) + `npm test`/`vitest` + build.
- Pós-fix de dados: `SELECT` confirmando **0 linhas** com `sum(lotes) > saldo`.

## Fora de escopo

- Reconciliação `_localRevisionMs` (sync local↔servidor) — auditada, não é o bug.
- As 283 linhas corretas — não tocar.
- Formato misto de `mov.data` na exibição do extrato (cosmético, achado separado).
- Inconsistência `diasRestantes >= 0` vs `> 0` entre telas (cosmético, achado separado).
