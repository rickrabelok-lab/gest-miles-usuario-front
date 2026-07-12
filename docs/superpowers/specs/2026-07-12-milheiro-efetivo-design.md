# Milheiro efetivo nas promoções (fase 1.1) — Design

**Data:** 2026-07-12 · **Status:** aprovado pelo owner (escopo, exibição e abordagem decididos em brainstorming)

## Contexto

Quando sai bônus de transferência Livelo/Esfera→cia aérea, geralmente dá pra comprar pontos
no carrinho do banco de pontos e o custo final do milheiro fica interessante. Os blogs que o
pipeline já lê **publicam esse custo no corpo do artigo** — exemplos reais já no banco:

- Esfera→Smiles 70%: "comprar 1.000 milhas a partir de R$ 15,58"
- Inter Loop→Azul 115%: "fabricar pontos a partir de R$ 13,44 por milha"

Hoje esse número, quando capturado, fica solto no texto de `details`. A fase 1.1 o torna
**estruturado e protagonista**: extraído pelo pipeline, validado deterministicamente e exibido
como badge no app.

## Decisões de escopo (owner, 2026-07-12)

1. **Só extrair do blog** — nunca calcular internamente nesta leva. Cálculo próprio
   (cruzar promo de compra × promo de transferência) fica pra fase futura.
2. **Milheiro vira o badge** da linha do hub quando existir (o % já vive na manchete curada;
   o badge passa a dar informação nova). Sem milheiro, tudo como hoje.
3. **Mesmo call LLM + guarda anti-alucinação** — sem segundo call, sem regex-only.

## Design

### 1. Dados — migration aditiva em `promo_alerts`

```sql
alter table public.promo_alerts
  add column if not exists milheiro_cost numeric,
  add column if not exists milheiro_note text;
```

- `milheiro_cost` — custo em **R$ por 1.000 pontos/milhas no programa de destino**, melhor
  caso publicado pelo artigo (ex. `15.58`). Faixas ("a partir de") guardam o melhor caso.
- `milheiro_note` — frase curta em pt-BR explicando como chegar no custo
  (ex. "Comprando pontos no carrinho da Esfera e transferindo com 70% de bônus").
- Campo **genérico por categoria**: vale pra transfer (combo) e pra compra direta de pontos
  (miles/shopping) quando o artigo publicar o custo.
- RLS: nada muda — a policy de select existente cobre colunas novas.
- ⚠️ Banco compartilhado (sem staging): aplicar só com OK explícito do owner.

### 2. Pipeline — n8n `gm-promo-ingest`

**Prompt (`gmpi-extract`)**, 2 chaves novas no JSON:

- `milheiro_cost`: número em reais por 1.000 pontos/milhas no programa de destino, **somente
  se o artigo publicar esse custo explicitamente** (ex. "milheiro a R$ 15,58", "R$ 13,44 por
  milha" — valor por milha × 1000). **NUNCA calcule você mesmo**; se o artigo não publicar o
  número, `null`.
- `milheiro_note`: como o artigo diz que se chega nesse custo (carrinho, clube, Pix,
  transferência com bônus), máx 200 caracteres, texto próprio; `null` se não houver custo.

**Guarda anti-alucinação (`gmpi-parse`)**, determinística, no mesmo espírito da higiene do
`cta_url` (regex puro — o sandbox do Code node não expõe `URL`/globais):

1. Normaliza `milheiro_cost` pra número (aceita `15,58` e `15.58`).
2. O número (nas grafias `15,58` e `15.58`) precisa aparecer **literalmente** no
   `article_text`; senão, `milheiro_cost = null` e `milheiro_note = null`.
   - Unidade canônica: **R$ por 1.000 pontos/milhas**. Blogs às vezes escrevem "por milha"
     querendo dizer milheiro (ex. "R$ 13,44 por milha"); o prompt instrui a reportar sempre
     por 1.000 e a faixa de sanidade abaixo derruba leituras absurdas. A verificação literal
     usa o número como escrito no texto, independente da palavra de unidade ao lado.
3. Sanidade de faixa: `1 <= milheiro_cost <= 200`; fora disso, ambos `null`.
4. `milheiro_note` sem `milheiro_cost` válido → `null` (nota nunca anda sozinha).

**Upsert (`gmpi-upsert`)**: 2 params novos (numeric + text simples — seguro no node Postgres).

**Validação antes do push**: prompt lab (workflow temporário webhook→Anthropic→respond) com
3 casos: Esfera→Smiles (espera 15.58), Inter→Azul (espera 13.44) e um artigo sem custo
publicado (espera null). Golden fixture `scripts/n8n/fixtures/promo-extract-golden.json`
ganha pelo menos 1 caso com milheiro e 1 sem.

### 3. Backend

- `backend/src/lib/promoMessage.js`: card de curadoria WhatsApp ganha linha
  `💰 Milheiro: R$ 15,58 — <nota>` quando presente (moderador valida o número antes de
  aprovar). Teste em `promoMessage.test.js`.
- Rota `/api/promo-alerts` (`agentPromo.js` ou rota de leitura): incluir `milheiro_cost` e
  `milheiro_note` no select, se a lista de colunas for explícita.

### 4. Front

- `src/lib/bonusTypes.ts`: `BonusPromotion` ganha `milheiroCost?: number` e
  `milheiroNote?: string`.
- `src/lib/promo-alerts/service.ts`: mapeia as colunas novas (e as inclui no select do
  fallback Supabase).
- `src/lib/bonusUtils.ts`: `bonusBadge()` passa a decidir num lugar só — com `milheiroCost`,
  retorna `{ value: "R$ 15,58", label: "milheiro" }` (formato pt-BR, vírgula); sem, mantém a
  lógica atual sobre `bonusValue`. Os 3 call sites (PromoRow, hero em
  BonusPromotionsSection, BonusOfferDetailScreen) herdam automaticamente.
- Detalhe (`BonusOfferDetailScreen`): bloco "Custo do milheiro" com o valor + `milheiroNote`
  explicando o combo, na aba da promoção.
- `pickHighlightId` (ranking do hero) **inalterado** nesta leva.

### 5. Erros e edge cases

- Artigo sem número publicado → campos null, UI idêntica à atual (degrade limpo).
- Faixa "a partir de R$ X" → melhor caso no numeric; a nota carrega a condição
  ("assinante Clube", "via Pix").
- LLM alucinar número → guarda literal no parse derruba.
- Promos já no banco ficam sem milheiro; backfill manual opcional das vigentes via SQL
  (como feito com `cta_url`), com OK do owner.

### 6. Testes e verificação

- Front (Vitest): `mapPromoAlertRow` com/sem milheiro; `bonusBadge` com milheiro (formato
  vírgula, label) e precedência sobre `bonusValue`; render do bloco no detalhe.
- Backend: `promoMessage` com/sem linha de milheiro.
- Pipeline: prompt lab (3 casos acima) + golden fixture atualizado.
- Gates de sempre: `npx tsc -b` + `npm test` + `npm run build`.

## Fora de escopo (levas futuras)

- Cálculo interno do milheiro (carrinho × transferência) e monitoramento de preço de carrinho.
- Ranking/ordenação do hub ou do hero por milheiro.
- Histórico de milheiro por programa (fase 4 do spec original).
