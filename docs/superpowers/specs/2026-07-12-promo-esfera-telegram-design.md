# Design: Ingestão Esfera Telegram (Fase 2 — mais fontes)

**Data:** 2026-07-12
**Status:** Aprovado pelo owner; spec enxuto (1 workflow n8n)
**Spec-mãe:** `docs/superpowers/specs/2026-07-11-promocoes-automaticas-design.md` (Fase 2)

---

## Visão Geral

Adicionar o canal público da Esfera (`t.me/s/esferacomvoce`) como fonte do pipeline de promoções, via scrape do preview web do Telegram (sem login). Enriquece o feed com shopping da Esfera + transferência Esfera→aérea ocasional. **Não toca o pipeline RSS** (que está são e ativo).

**Realidade (verificada 2026-07-12):** canal público, ~25-30 mensagens/página; cada mensagem tem `data-post="esferacomvoce/<id>"` (dedup) + texto em `tgme_widget_message_text` + `datetime`. Conteúdo ~80% shopping (com detalhe real, ex.: "Extra - Até 03/07 - 4 pontos por real"), transferência ocasional. Os vagos ("Dia da Pizza") são filtrados pelo `is_promo` do extrator.

---

## Decisões

1. **Workflow separado** `gm-promo-esfera` (não refatora o RSS — zero risco pro feed ativo).
2. **Prompt de extração PRÓPRIO pra teaser** (não o do RSS): mensagem curta não tem artigo pra tirar milheiro nem âncora pra cta. Extrai só o essencial.
3. **Reusa:** `promo_ingest_seen` (dedup), `promo_alerts` (upsert por canonical_key), a rota BFF `/api/agent/promo-message/:id` (card de curadoria — já existe), credenciais n8n.
4. **Cai em `pending`** → moderação humana (mesma curadoria de 1 toque).

---

## Arquitetura (n8n — único artefato de repo = o JSON)

```
gm-promo-esfera (Schedule ~30min)
  1. HTTP GET t.me/s/esferacomvoce  (UA de browser; onError → segue)
  2. Code gme-parse: quebra por data-post="esferacomvoce/<id>", extrai
        { source:'telegram-esfera', external_id:'<id>', text:<strip HTML>, date }
  3. Postgres gme-unseen: dedup em promo_ingest_seen (RETURNING carrega text/date adiante)
  4. HTTP gme-extract: Haiku (prompt de teaser) → JSON
  5. Code gme-parse-json: valida + canonical_key (mesma higiene do RSS, sem milheiro/cta-de-artigo)
  6. IF gme-is-promo: is_promo && confidence>=0.5 && vigente
  7. Postgres gme-upsert: upsert promo_alerts por canonical_key (mesmo SQL do RSS)
  8. IF gme-only-new + Postgres gme-tenant + HTTP gme-message (BFF card) + HTTP gme-notify (Evolution)
```

Passos 3-8 **espelham** o RSS (`gm-promo-ingest`) — mesmas lições n8n (RETURNING carrega o payload; texto rico por referência entre HTTP 1:1; `queryReplacement` array único). O que muda: passos 1-2 (scrape Telegram em vez de RSS) e o prompt do passo 4.

### Prompt de teaser (passo 4)

Sistema: "Extrai promoção de milhas/pontos de uma mensagem CURTA do canal Telegram da Esfera. Responda só JSON: `is_promo` (bool — só se anuncia benefício acionável de pontos: pontos por real numa loja, bônus de transferência, compra de pontos com bônus; teaser vago sem benefício → false), `category` (transfer/shopping/miles/cards), `source_program` ('Esfera' quase sempre) / `target_program` (destino se transferência, senão null), `title` (manchete própria curta pt-BR, máx 70), `bonus_value` (token ≤12 chars: '4 pts/R$', '80%'), `bonus_numeric`, `valid_until` (YYYY-MM-DD se a mensagem trouxer 'até DD/MM', senão null), `confidence` (0-1)."
Usuário: o texto da mensagem.
- **Sem** `milheiro_cost`/`cta_url`-de-artigo/`tiers` (não há artigo). `source_links` = link do post (`t.me/esferacomvoce/<id>`) pro fallback.

### Parse do HTML (passo 2, Code node)

- Split por `data-post="esferacomvoce/(\d+)"`; por bloco, extrai o `tgme_widget_message_text` (regex), converte `<br/>`→espaço, remove tags/emoji-spans, colapsa espaços, corta ~800 chars. `external_id` = o id numérico. Ignora blocos sem texto.

---

## Erros e resiliência

- Telegram fora / HTML mudou → parse vazio, run sem itens (noop); `onError:continue` no fetch.
- Haiku JSON inválido → 1 retry, senão descarta (não publica).
- Dedup evita reprocessar mensagens antigas (o preview repete as últimas ~25).
- Datas: a Esfera usa "Até DD/MM" — o extrator monta `valid_until` com o ano corrente; guarda de vigência no `gme-is-promo`.

## Testes

- **E2E controlado** contra o canal ao vivo (padrão RSS): rodar via clone/webhook → conferir mensagens parseadas → 1-2 promos reais viram `pending` + card no grupo interno; os vagos filtrados. Sem unit test (n8n-only, como o RSS ingest). Limpar sintéticos.
- Prompt lab (webhook temp → Haiku → respond) pra afinar o prompt de teaser com mensagens reais antes de ativar.

## Custos

Haiku ~cheap (25-30 msgs/run, maioria filtrada). Sem novo custo de infra.

## Fora de escopo (follow-ups)

- Fetch do offer-page da Esfera pra mais detalhe (a mensagem linka o site).
- Livelo Telegram (canal por convite — MTProto, chip do owner).
- Refator do downstream num sub-workflow compartilhado (quando houver 3+ fontes).
- Multi-promo por mensagem.
