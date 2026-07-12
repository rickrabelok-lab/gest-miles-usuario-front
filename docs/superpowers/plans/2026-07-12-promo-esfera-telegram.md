# Ingestão Esfera Telegram (Fase 2) — Implementation Plan

> **CONTROLLER-only** (n8n vivo + Haiku + E2E contra o canal). Único artefato de repo = o JSON do workflow. Sem código testável (n8n-only, como o RSS ingest).

**Goal:** Workflow n8n que raspa `t.me/s/esferacomvoce`, extrai promoções com Haiku (prompt de teaser) e cai em `promo_alerts` pending + card no grupo interno. Não toca o RSS.

## Global Constraints

- **Não tocar** `gm-promo-ingest` (RSS ativo). Workflow NOVO `gm-promo-esfera`.
- **Reusa:** `promo_ingest_seen`, `promo_alerts`, rota BFF `/api/agent/promo-message/:id`, credenciais `CRED_POSTGRES_AGENTE` (`Ucn1qbvcmYC4XHpa`), Haiku `CRED_RRV_ANTHROPIC` (`kOWHaIShekMAauG4`), card `CRED_RESUMO_APIKEY` (`8JJba9f768EANZ33`), Evolution `CRED_EVOLUTION_HEADER` (`qzR4JN04NUY3GPeQ`).
- **Lições n8n:** RETURNING carrega payload através do Postgres; `queryReplacement` array único `={{ [...] }}`; texto rico por referência entre HTTP 1:1; UA de browser; `runOnceForEachItem` em Code com `.item`.
- **source='telegram-esfera'**, external_id = id numérico do post.
- **Cai em pending** (moderação humana). E2E limpa os sintéticos.

---

### Task 1 (controller): prompt lab do teaser

- [ ] Pegar 5-8 mensagens reais da Esfera (curl `t.me/s/esferacomvoce`, extrair textos).
- [ ] Workflow temp (webhook → Haiku → respond) com o prompt de teaser do spec.
- [ ] Rodar contra as mensagens reais; afinar até: shopping com detalhe ("4 pts/R$ na Extra") → is_promo true + campos certos; teaser vago ("Dia da Pizza") → is_promo false; transferência Esfera→Azul → category transfer. Deletar o temp.

### Task 2 (controller): construir + push do workflow

**File:** `scripts/n8n/gm-promo-esfera.workflow.json`

Nós (molde = `gm-promo-ingest.workflow.json`):
1. **Schedule** ~30min.
2. **HTTP `gme-fetch`**: GET `https://t.me/s/esferacomvoce`, UA de browser, `responseFormat:text`, timeout 15s, `onError:continueRegularOutput`.
3. **Code `gme-parse`** (`runOnceForAllItems`): regex split por `data-post="esferacomvoce/(\d+)"`; por bloco extrai `tgme_widget_message_text` (`/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/`), `<br/>`→espaço, strip tags, colapsa, ≤800 chars; retorna 1 item por mensagem `{source:'telegram-esfera', external_id, text, link:'https://t.me/esferacomvoce/'+id}`. Ignora sem texto.
4. **Postgres `gme-unseen`**: `insert into promo_ingest_seen(source,external_id) values($1,$2) on conflict do nothing returning source, external_id, $3::text as text, $4::text as link;` `queryReplacement: [source, external_id, text, link]`.
5. **HTTP `gme-extract`**: Haiku (prompt de teaser), `jsonBody` com `system` + `messages:[{role:'user', content: 'MENSAGEM: '+$json.text}]`, `retryOnFail`, `CRED_RRV_ANTHROPIC`.
6. **Code `gme-parse-json`** (`runOnceForEachItem`): parseia o JSON do LLM (mesma higiene do RSS: strip markdown); valida `is_promo/category/title`; monta `canonical_key` (`category:slug(source)>slug(target):bonus_numeric||slug(bonus_value):valid_until||'sem-data'`); `source_name='Esfera (Telegram)'`, `source_url=$('gme-unseen').item.json.link`. Sem milheiro/cta/tiers.
7. **IF `gme-is-promo`**: `is_promo===true && (confidence??0)>=0.5 && (!valid_until || valid_until>=hoje)`.
8. **Postgres `gme-upsert`**: mesmo upsert do RSS (`insert into promo_alerts(...) on conflict (canonical_key) do update set source_links=..., updated_at=now() returning id, status, (xmax=0) as is_new`) — SEM as colunas milheiro (ou passa null). `queryReplacement` array.
9. **IF `gme-only-new`**: `is_new && status='pending'`.
10. **Postgres `gme-tenant`**: `select grupo_interno_jid, instance, $1::text as promo_id from agent_tenants where id=3;` `[$json.id]`.
11. **HTTP `gme-message`**: GET `{PUBLIC_API_URL}/api/agent/promo-message/{{ $json.promo_id }}` (`CRED_RESUMO_APIKEY`).
12. **HTTP `gme-notify`**: Evolution send pro `grupo_interno_jid` (`CRED_EVOLUTION_HEADER`), `number={{ $('gme-tenant').item.json.grupo_interno_jid }}`, `text={{ $json.message }}`.

- [ ] Construir o JSON; `node scripts/n8n/push-workflow.mjs scripts/n8n/gm-promo-esfera.workflow.json`.

### Task 3 (controller): E2E + ativar

- [ ] E2E via clone temp (schedule→webhook): rodar → conferir mensagens parseadas (execução com includeData), promos reais viram pending + card no Grupo Teste, vagos filtrados, dedup na 2ª run. Limpar promos sintéticas de teste (as reais ficam pra moderação do owner).
- [ ] Ativar o workflow (`POST /api/v1/workflows/<id>/activate`). Commit do JSON. Abrir PR.

## Self-Review
- Cobre o spec: scrape (T2 n2-3), dedup (n4), teaser-extract (T1+n5-6), upsert+card (n8-12), não-toca-RSS (workflow novo). E2E controlado cobre a verificação (n8n-only).
