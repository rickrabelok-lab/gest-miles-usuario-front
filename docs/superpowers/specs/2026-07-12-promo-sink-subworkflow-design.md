# Design: sub-workflow compartilhado do downstream de promoções (`gm-promo-sink`)

**Data:** 2026-07-12
**Status:** Aprovado pelo owner (brainstorm); refactor DRY de pipelines n8n VIVOS

---

## Problema

Existem **2 produtores** de card de moderação de promoção — `gm-promo-ingest` (RSS, cron 15min) e `gm-promo-esfera` (Telegram Esfera, cron 30min). Cada um tem, no fim, o **mesmo downstream de 6 nós**, do filtro até o WhatsApp:

```
is-promo (IF: is_promo + confidence≥0.5 + não-vencida)
  → upsert promo_alerts (insert … on conflict canonical_key)
    → only-new (IF: is_new + status=pending)
      → tenant (select agent_tenants id=3)
        → message (GET BFF /api/agent/promo-message/:id)
          → notify (POST Evolution sendText → grupo interno)
```

São **12 nós, 6 duplicados**, que precisam ser mantidos em sincronia à mão. Mudança no formato do card, no tenant, no endpoint da Evolution ou no upsert = editar dois lugares. A fase 2 (IMAP/newsletters) adiciona uma 3ª fonte que multiplicaria a duplicação.

### Verificação do que é realmente idêntico (lendo os dois JSONs)

- O **SQL do upsert é byte-a-byte igual** nos dois workflows.
- Os nós `is-promo`, `only-new`, `tenant`, `message`, `notify` são **literalmente iguais**.
- A **única diferença** está no `queryReplacement` do upsert: o RSS preenche `tiers/valid_from/details/cta_url/milheiro_cost/milheiro_note`; o Esfera cola `null`/`''` (é teaser, não tem esses dados). Resolve com um array **defensivo** — o Esfera simplesmente não seta esses campos e eles caem em null naturalmente.
- O conteúdo do card é montado **server-side pelo BFF a partir da linha em `promo_alerts`** (o nó `message` só passa o `id`). Logo, se o upsert grava certo, o card sai certo pras duas fontes.

> Só existem esses 2 produtores. `gm-promo-digest-interno`, `gm-promo-personalizado`, `gm-grupo-onboarding` e `gm-promo-housekeeping` são downstream de `promo_alerts` (leem/expiram/mensageiam cliente), **não** produzem o card de moderação.

---

## Solução

Extrair o downstream comum num sub-workflow n8n **`gm-promo-sink`** (Execute Sub-workflow nativo). Os produtores trocam seus 6 nós por **um** nó *Execute Sub-workflow* que entrega o candidato parseado.

**Por que sub-workflow nativo (e não backend):** é idiomático n8n, blast radius mínimo (são os **mesmos nós**, só realocados), mantém a lógica onde já está e prova, e faz a 3ª fonte virar "parse → chama o sink". Mover pro BFF seria reescrita grande num pipeline vivo (tira o upsert SQL do n8n, re-testa todo o caminho de moderação, exige deploy) — reservado pra se um dia sairmos do n8n.

### Fronteira (decisão do owner): sink = `is-promo → notify`

O produtor faz só `fetch → dedup → [extract → parse]` e entrega o candidato. O sink decide "is_promo + confiança + não-vencida" + upsert + card. Assim a **regra de negócio** ("o que é promoção publicável") fica num lugar só.

---

## Escopo

### Novo workflow: `gm-promo-sink` (inativo — sem trigger próprio)

| Nó | Tipo | O que faz |
|----|------|-----------|
| `gps-in` | `executeWorkflowTrigger` | entrada; recebe o candidato do produtor |
| `gps-is-promo` | `if` | `is_promo=true` + `confidence≥0.5` + (`valid_until` null **ou** ≥ hoje) |
| `gps-upsert` | `postgres` | `insert … on conflict (canonical_key)` — SQL atual, `queryReplacement` defensivo |
| `gps-only-new` | `if` | `is_new=true` + `status='pending'` |
| `gps-tenant` | `postgres` | `select grupo_interno_jid, instance, $1::text as promo_id from agent_tenants where id=3` |
| `gps-message` | `httpRequest` GET | BFF `/api/agent/promo-message/{{ $json.promo_id }}` |
| `gps-notify` | `httpRequest` POST | Evolution `sendText` → `grupo_interno_jid` |

Credenciais **por id** (nunca no JSON): `CRED_POSTGRES_AGENTE` (`Ucn1qbvcmYC4XHpa`), `CRED_RESUMO_APIKEY` (`8JJba9f768EANZ33`), `CRED_EVOLUTION_HEADER` (`qzR4JN04NUY3GPeQ`).

**`queryReplacement` unificado do `gps-upsert`:**
```js
={{ [
  $json.category, $json.source_program, $json.target_program, $json.title,
  $json.bonus_value, $json.bonus_numeric,
  JSON.stringify($json.tiers ?? null), $json.valid_from || '', $json.valid_until || '',
  $json.details ?? null, $json.cta_url ?? null, $json.milheiro_cost ?? null, $json.milheiro_note ?? null,
  $json.source_name, $json.source_url, $json.canonical_key, $json.confidence, JSON.stringify($json)
] }}
```
RSS preenche tudo; Esfera omite os extras → null/''. `raw` = `JSON.stringify($json)` = o item recebido (= saída do parse) — **idêntico ao comportamento atual** dos dois.

### Contrato produtor → sink

A saída dos nós `*-parse` (RSS) / `*-parse-json` (Esfera) — que já existe hoje. Campos que o sink lê: `is_promo, category, source_program, target_program, title, bonus_value, bonus_numeric, valid_until, canonical_key, confidence, source_name, source_url` + (opcionais, RSS) `tiers, valid_from, details, cta_url, milheiro_cost, milheiro_note`.

### Mudança nos produtores

- **`gm-promo-esfera`:** apaga `gme-is-promo, gme-upsert, gme-only-new, gme-tenant, gme-message, gme-notify`; adiciona `gme-sink` (`executeWorkflow`, `source=database`, `workflowId=<id do sink>`, sem `mode` explícito — usa o default; **passthrough**, sem `workflowInputs`). Conexão: `gme-parse-json → gme-sink`.
- **`gm-promo-ingest`:** apaga `gmpi-is-promo … gmpi-notify`; adiciona `gmpi-sink`. Conexão: `gmpi-parse → gmpi-sink`.

---

## Riscos & mitigação

- **Perda permanente por dedup upstream:** o `*-unseen` (dedup) fica **no produtor**, antes do handoff. Item marcado `seen` que não chega ao upsert é perdido pra sempre. Isso já é verdade hoje; o risco NOVO é só durante a **troca** — um sink quebrado = todo item novo perdido. Mitiga com: sink construído inativo → smoke isolado → troca **um produtor por vez** com verificação de execução real → rollback via git.
- **Pairing através do executeWorkflow:** dentro do sink o grafo é o **mesmo de hoje** (`$('gps-tenant').item` atravessa só o `gps-message` httpRequest 1:1 — crossing seguro já provado). O trigger só semeia os itens. Sem regressão de pairing.
- **Superfície de falha do boundary:** se o sink estiver com id errado/ausente, o Execute node falha e perde os itens daquela run. Mitiga com verificação imediata pós-troca.

---

## Rollout (ordem ESTRITA — pipelines vivos)

1. **Push `gm-promo-sink`** (create, inativo) → captura o id. Inerte (sem trigger próprio, não dispara sozinho; sub-workflow não precisa estar "active").
2. **Smoke isolado:** workflow temp `webhook → set(2 itens sintéticos `[TESTE INTERNO]`: 1 RSS-cheio + 1 Esfera-null; `canonical_key` único; `valid_until` futura) → executeWorkflow(sink) → respond`. Dispara → lê a execução (`includeData`) → confirma: **2 linhas em `promo_alerts` (pending), 2 cards no Grupo Teste, `is_new=true`**. Dispara de novo → **idempotência** (on conflict → `is_new=false` → sem card). **Deleta** as 2 linhas + o workflow temp. Prod limpa.
3. **Troca Esfera** (menor volume/30min): push do `gm-promo-esfera` com `gme-sink`. Verifica um item Esfera real (próximo cron ou clone-webhook) chegando a card.
4. **Troca RSS:** push do `gm-promo-ingest` com `gmpi-sink`. Verifica execução real.
5. **Commit** dos 3 JSONs + atualiza a memória.

**Rollback:** re-push do JSON anterior do produtor (git tem) reverte na hora. O sink ficar lá é inofensivo.

## Critérios de sucesso

- Os 2 produtores apontam pro `gm-promo-sink`.
- Um item real de cada fonte gera **exatamente 1 card + 1 linha** em `promo_alerts`.
- Idempotência mantida (re-run não duplica card).
- Zero card duplicado; prod sem sintético ao fim.

---

## Fora de escopo

- Migrar a lógica pro backend (Approach 2, descartado).
- 3ª fonte IMAP (fase 2 — mas passa a ser trivial depois deste refactor).
- Credencial Haiku dedicada, opt-out UI, e demais follow-ups já registrados.

## Fatos duráveis n8n aplicados aqui

- API pública do n8n **não executa** workflow → testar via clone-webhook temporário + `GET /executions?includeData=true` + DELETE.
- API atrás de Cloudflare exige **User-Agent de browser** (o `push-workflow.mjs` já embute).
- Postgres node: `queryReplacement` sempre como **expressão-array única** `={{ [...] }}`; só valores simples como param (uuid/número); texto rico viaja por referência entre nós HTTP 1:1.
- Push: `node scripts/n8n/push-workflow.mjs <arquivo.json> [id]`.
