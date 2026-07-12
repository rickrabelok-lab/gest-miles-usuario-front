# Sub-workflow compartilhado do downstream de promoções (`gm-promo-sink`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair o downstream duplicado (is-promo → upsert → only-new → tenant → message → notify) dos 2 produtores de card (`gm-promo-ingest` RSS e `gm-promo-esfera`) num único sub-workflow n8n `gm-promo-sink`, invocado por ambos via Execute Sub-workflow.

**Architecture:** `gm-promo-sink` recebe o item parseado via um input `payload` (string JSON), desembrulha com `JSON.parse`, e roda os 6 nós hoje duplicados (byte-idênticos, com um `queryReplacement` defensivo no upsert que serve RSS-cheio e Esfera-null). Cada produtor troca seus 6 nós por 1 nó `executeWorkflow` que passa `payload = JSON.stringify($json)`. Rollout em ordem estrita sobre pipelines VIVOS: sink inativo → smoke isolado → troca Esfera → troca RSS → commit.

**Tech Stack:** n8n (self-hosted, atrás de Cloudflare), Postgres (Supabase compartilhado), Evolution API (WhatsApp), BFF Express. Push via `scripts/n8n/push-workflow.mjs`.

## Global Constraints

- **Schema n8n desta instância (CORRIGIDO no smoke da Task 2):** o trigger do sink usa `executeWorkflowTrigger` **typeVersion 1.1** com `parameters.inputSource:"passthrough"` (o sub recebe o item parseado inteiro como `$json`). O caller usa `executeWorkflow` **typeVersion 1.1** com `source:"database"`, `workflowId.__rl` (mode `list` + `cachedResultName`), `options.waitForSubWorkflow:true`, **e SEM `workflowInputs`** (passthrough não mapeia campos). ⚠️ O resource-mapper `workflowInputs.mappingMode:"defineBelow"` entrega **null** nesta instância mesmo com ref simples (`$json.title`) — NÃO usar.
- **O sink DEVE ficar ATIVO (published):** esta instância recusa ativar um workflow que referencia um sub-workflow não publicado (`Cannot publish workflow: Node references workflow which is not published`). O sink só tem `executeWorkflowTrigger` (sem cron/webhook próprio) → ativo ≠ roda sozinho; só o torna chamável.
- **PUT (push de update) DESATIVA o workflow:** após CADA `push-workflow.mjs <arquivo> <id>`, o workflow volta a `active:false`. Nos produtores VIVOS (Task 3/4) isso derruba o pipeline até re-ativar → **re-ativar imediatamente** via `POST /api/v1/workflows/<id>/activate` (gap de ≤1 ciclo de cron, inofensivo). Sempre confirmar `active:true` no round-trip.
- **Credenciais SEMPRE por id, nunca plaintext no JSON:** `CRED_POSTGRES_AGENTE`=`Ucn1qbvcmYC4XHpa`, `CRED_RESUMO_APIKEY`=`8JJba9f768EANZ33`, `CRED_EVOLUTION_HEADER`=`qzR4JN04NUY3GPeQ`.
- **API do n8n exige User-Agent de browser** (Cloudflare 1010) — o `push-workflow.mjs` já embute; qualquer fetch manual idem.
- **API pública do n8n NÃO executa workflow** — testar via clone com trigger Webhook: push → `POST /api/v1/workflows/<id>/activate` → chamar `${N8N_URL}/webhook/<path>` → ler `GET /api/v1/executions?workflowId=<id>&includeData=true` → `DELETE /api/v1/workflows/<id>`.
- **Postgres node:** `queryReplacement` sempre como expressão-array única `={{ [ ... ] }}`; só valores simples (uuid/número/slug) como param.
- **Dedup (`*-unseen`) fica UPSTREAM, no produtor:** um sink quebrado marca item como `seen` sem inserir = **perda permanente**. Verificar antes/depois de cada troca; trocar **um produtor por vez**.
- **DB é produção compartilhada (sem staging)** — smoke usa item sintético `[TESTE INTERNO]` deletado ao fim.
- **`<SINK_ID>`** = o id retornado pelo push da Task 1. Deve ser embutido nos nós caller das Tasks 3 e 4. Onde este plano escreve `<SINK_ID>`, substituir pelo id real.
- **Ordem estrita de rollout:** Task 1 (sink inativo) → Task 2 (smoke) → Task 3 (Esfera) → Task 4 (RSS) → Task 5 (commit). Não pular, não paralelizar as trocas.

---

## Arquivos

- **Criar:** `scripts/n8n/gm-promo-sink.workflow.json` — o sub-workflow (fonte versionada; o id vive no n8n).
- **Criar (temporário, deletado na Task 2):** `scripts/n8n/_tmp-sink-smoke.workflow.json` — harness de smoke.
- **Modificar:** `scripts/n8n/gm-promo-esfera.workflow.json` — remove 6 nós downstream, adiciona `gme-sink`.
- **Modificar:** `scripts/n8n/gm-promo-ingest.workflow.json` — remove 6 nós downstream, adiciona `gmpi-sink`.
- **Modificar:** `C:\Users\rick_\.claude\projects\...\memory\promocoes-automaticas-built.md` — registrar conclusão.

---

## Task 1: Construir e publicar `gm-promo-sink` (inativo)

**Files:**
- Create: `scripts/n8n/gm-promo-sink.workflow.json`

**Interfaces:**
- Consumes: item com um campo `payload` (string) = `JSON.stringify(<saída do nó parse do produtor>)`.
- Produces: o workflow id `<SINK_ID>` (impresso pelo push), consumido pelas Tasks 3 e 4.

- [ ] **Step 1: Criar o arquivo do sink**

Create `scripts/n8n/gm-promo-sink.workflow.json`:

```json
{
  "name": "gm-promo-sink",
  "nodes": [
    {
      "parameters": { "workflowInputs": { "values": [ { "name": "payload" } ] } },
      "id": "gps-in", "name": "gps-in", "type": "n8n-nodes-base.executeWorkflowTrigger", "typeVersion": 1.1, "position": [0, 300],
      "notes": "Entrada única: payload (string JSON = saída do nó parse do produtor). Passthrough não existe nesta instância; por isso 1 campo string + JSON.parse no gps-unwrap."
    },
    {
      "parameters": {
        "mode": "runOnceForEachItem",
        "jsCode": "// Desembrulha o item do produtor. Depois deste nó, os 6 nós seguintes são\n// byte-idênticos aos de hoje (leem $json.category, $json.tiers, etc.).\nreturn { json: JSON.parse($json.payload) }"
      },
      "id": "gps-unwrap", "name": "gps-unwrap", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [220, 300]
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose" },
          "conditions": [
            { "leftValue": "={{ $json.is_promo }}", "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } },
            { "leftValue": "={{ $json.confidence ?? 0 }}", "rightValue": 0.5, "operator": { "type": "number", "operation": "gte" } },
            { "leftValue": "={{ !$json.valid_until || $json.valid_until >= $now.toFormat('yyyy-MM-dd') }}", "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "gps-is-promo", "name": "gps-is-promo", "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": [440, 300]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "insert into public.promo_alerts\n  (category, source_program, target_program, title, bonus_value, bonus_numeric,\n   tiers, valid_from, valid_until, details, cta_url, milheiro_cost, milheiro_note,\n   source_links, canonical_key, confidence, raw)\nvalues\n  ($1, $2, $3, $4, $5, $6, $7::jsonb, nullif($8,'')::date, nullif($9,'')::date, $10, $11,\n   $12::numeric, $13,\n   jsonb_build_array(jsonb_build_object('name', $14::text, 'url', $15::text)), $16, $17, $18::jsonb)\non conflict (canonical_key) do update set\n  source_links = (\n    select jsonb_agg(distinct e) from jsonb_array_elements(\n      promo_alerts.source_links || excluded.source_links\n    ) as e\n  ),\n  updated_at = now()\nreturning id, status, (xmax = 0) as is_new;",
        "options": {
          "queryReplacement": "={{ [$json.category, $json.source_program, $json.target_program, $json.title, $json.bonus_value, $json.bonus_numeric, JSON.stringify($json.tiers ?? null), $json.valid_from || '', $json.valid_until || '', $json.details ?? null, $json.cta_url ?? null, $json.milheiro_cost ?? null, $json.milheiro_note ?? null, $json.source_name, $json.source_url, $json.canonical_key, $json.confidence, JSON.stringify($json)] }}"
        }
      },
      "id": "gps-upsert", "name": "gps-upsert", "type": "n8n-nodes-base.postgres", "typeVersion": 2.4, "position": [660, 220],
      "credentials": { "postgres": { "id": "Ucn1qbvcmYC4XHpa", "name": "CRED_POSTGRES_AGENTE" } },
      "notes": "queryReplacement defensivo: RSS preenche tiers/valid_from/details/cta_url/milheiro_*; Esfera omite -> null/''. SQL idêntico ao dos 2 produtores."
    },
    {
      "parameters": {
        "conditions": {
          "options": { "caseSensitive": true, "leftValue": "", "typeValidation": "loose" },
          "conditions": [
            { "leftValue": "={{ $json.is_new }}", "rightValue": "", "operator": { "type": "boolean", "operation": "true", "singleValue": true } },
            { "leftValue": "={{ $json.status }}", "rightValue": "pending", "operator": { "type": "string", "operation": "equals" } }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "gps-only-new", "name": "gps-only-new", "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": [880, 220]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "select grupo_interno_jid, instance, $1::text as promo_id from public.agent_tenants where id = 3;",
        "options": { "queryReplacement": "={{ [$json.id] }}" }
      },
      "id": "gps-tenant", "name": "gps-tenant", "type": "n8n-nodes-base.postgres", "typeVersion": 2.4, "position": [1100, 140],
      "credentials": { "postgres": { "id": "Ucn1qbvcmYC4XHpa", "name": "CRED_POSTGRES_AGENTE" } }
    },
    {
      "parameters": {
        "method": "GET",
        "url": "=https://gest-miles-usuario-front-slzj.vercel.app/api/agent/promo-message/{{ $json.promo_id }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "options": {}
      },
      "id": "gps-message", "name": "gps-message", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1320, 140],
      "credentials": { "httpHeaderAuth": { "id": "8JJba9f768EANZ33", "name": "CRED_RESUMO_APIKEY" } }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "=https://evolution.gestmiles.com.br/message/sendText/{{ $('gps-tenant').item.json.instance }}",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "number", "value": "={{ $('gps-tenant').item.json.grupo_interno_jid }}" },
            { "name": "text", "value": "={{ $json.message }}" }
          ]
        },
        "options": {}
      },
      "id": "gps-notify", "name": "gps-notify", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [1540, 140],
      "credentials": { "httpHeaderAuth": { "id": "qzR4JN04NUY3GPeQ", "name": "CRED_EVOLUTION_HEADER" } }
    }
  ],
  "connections": {
    "gps-in": { "main": [[{ "node": "gps-unwrap", "type": "main", "index": 0 }]] },
    "gps-unwrap": { "main": [[{ "node": "gps-is-promo", "type": "main", "index": 0 }]] },
    "gps-is-promo": { "main": [[{ "node": "gps-upsert", "type": "main", "index": 0 }], []] },
    "gps-upsert": { "main": [[{ "node": "gps-only-new", "type": "main", "index": 0 }]] },
    "gps-only-new": { "main": [[{ "node": "gps-tenant", "type": "main", "index": 0 }], []] },
    "gps-tenant": { "main": [[{ "node": "gps-message", "type": "main", "index": 0 }]] },
    "gps-message": { "main": [[{ "node": "gps-notify", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1", "timezone": "America/Sao_Paulo" }
}
```

- [ ] **Step 2: Publicar (create) e capturar o id**

Run: `node scripts/n8n/push-workflow.mjs scripts/n8n/gm-promo-sink.workflow.json`
Expected: `ok: workflow <SINK_ID> (gm-promo-sink)`. Anotar `<SINK_ID>`.

- [ ] **Step 3: Round-trip — confirmar que os 8 nós importaram sem nó desconhecido**

Run:
```bash
node -e "
const { readFileSync } = require('node:fs');
const { N8N_API_KEY, N8N_URL } = JSON.parse(readFileSync('C:/Users/rick_/Downloads/rickrabelo-viagens-ig/tools/secrets.local.json','utf8'));
const H = { 'X-N8N-API-KEY': N8N_API_KEY, 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' };
fetch(N8N_URL.replace(/\/\$/,'')+'/api/v1/workflows/<SINK_ID>', { headers:H }).then(r=>r.json()).then(w=>{
  console.log('active:', w.active, '| nodes:', (w.nodes||[]).length);
  for (const n of (w.nodes||[])) console.log(' -', n.name, n.type, 'v'+n.typeVersion);
});
"
```
Expected: `active: false | nodes: 8`; a lista contém `gps-in (executeWorkflowTrigger v1.1)`, `gps-unwrap`, `gps-is-promo`, `gps-upsert`, `gps-only-new`, `gps-tenant`, `gps-message`, `gps-notify`. Nenhum tipo aparece como `n8n-nodes-base.noOp`/desconhecido.

- [ ] **Step 4: Confirmar que está inativo (não dispara sozinho)**

O Step 3 já mostra `active: false`. Sub-workflow com só `executeWorkflowTrigger` não tem trigger próprio — não roda até ser invocado. Nada mais a fazer.

- [ ] **Step 5: Commit**

```bash
git add scripts/n8n/gm-promo-sink.workflow.json
git commit -m "feat(usuario): sub-workflow gm-promo-sink (downstream compartilhado de promoções)"
```

---

## Task 2: Smoke isolado do sink (2 formas + idempotência) + cleanup

**Files:**
- Create (temporário): `scripts/n8n/_tmp-sink-smoke.workflow.json`

**Interfaces:**
- Consumes: `<SINK_ID>` da Task 1.
- Produces: prova de que o sink faz upsert + card pras formas RSS-cheia e Esfera-null, e é idempotente. Nada persistente (tudo deletado).

- [ ] **Step 1: Baseline — confirmar que não há linha de teste em prod**

Run (via MCP supabase `execute_sql` ou psql):
```sql
select canonical_key, status from public.promo_alerts
where canonical_key in ('teste-sink-rss-20260712a','teste-sink-esfera-20260712a');
```
Expected: 0 linhas.

- [ ] **Step 2: Criar o harness de smoke**

Create `scripts/n8n/_tmp-sink-smoke.workflow.json`:

```json
{
  "name": "_tmp-sink-smoke",
  "nodes": [
    {
      "parameters": { "httpMethod": "GET", "path": "tmp-sink-smoke", "responseMode": "onReceived", "options": {} },
      "id": "t-webhook", "name": "t-webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [0, 300], "webhookId": "tmp-sink-smoke"
    },
    {
      "parameters": {
        "mode": "runOnceForAllItems",
        "jsCode": "// 2 itens sintéticos: 1 RSS-cheio, 1 Esfera-null. canonical_key FIXO (re-fire bate no conflito).\nreturn [\n  { json: { is_promo: true, category: 'transfer', source_program: 'Livelo', target_program: 'Smiles', title: '[TESTE INTERNO] sink RSS — pode ignorar', bonus_value: '100%', bonus_numeric: 100, tiers: null, valid_from: null, valid_until: '2099-12-31', details: 'linha de teste do sink, ignore', cta_url: 'https://example.com/teste-sink-rss', milheiro_cost: 15.58, milheiro_note: 'teste', source_name: 'TESTE SINK', source_url: 'https://example.com/rss', canonical_key: 'teste-sink-rss-20260712a', confidence: 0.99 } },\n  { json: { is_promo: true, category: 'shopping', source_program: 'Esfera', target_program: null, title: '[TESTE INTERNO] sink Esfera — pode ignorar', bonus_value: '6 pts/R$', bonus_numeric: 6, valid_until: '2099-12-31', source_name: 'Esfera (Telegram)', source_url: 'https://t.me/esferacomvoce/0', canonical_key: 'teste-sink-esfera-20260712a', confidence: 0.99 } }\n]"
      },
      "id": "t-items", "name": "t-items", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [220, 300]
    },
    {
      "parameters": {
        "source": "database",
        "workflowId": { "__rl": true, "value": "<SINK_ID>", "mode": "list", "cachedResultName": "gm-promo-sink" },
        "workflowInputs": { "mappingMode": "defineBelow", "value": { "payload": "={{ JSON.stringify($json) }}" }, "matchingColumns": [], "schema": [] },
        "options": { "waitForSubWorkflow": true }
      },
      "id": "t-sink", "name": "t-sink", "type": "n8n-nodes-base.executeWorkflow", "typeVersion": 1.1, "position": [440, 300]
    }
  ],
  "connections": {
    "t-webhook": { "main": [[{ "node": "t-items", "type": "main", "index": 0 }]] },
    "t-items": { "main": [[{ "node": "t-sink", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1", "timezone": "America/Sao_Paulo" }
}
```

- [ ] **Step 3: Publicar o harness e ativar**

Run: `node scripts/n8n/push-workflow.mjs scripts/n8n/_tmp-sink-smoke.workflow.json`
Expected: `ok: workflow <TMP_ID> (_tmp-sink-smoke)`. Anotar `<TMP_ID>`.

Run (ativar):
```bash
node -e "
const { readFileSync } = require('node:fs');
const { N8N_API_KEY, N8N_URL } = JSON.parse(readFileSync('C:/Users/rick_/Downloads/rickrabelo-viagens-ig/tools/secrets.local.json','utf8'));
const H = { 'X-N8N-API-KEY': N8N_API_KEY, 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' };
fetch(N8N_URL.replace(/\/\$/,'')+'/api/v1/workflows/<TMP_ID>/activate', { method:'POST', headers:H }).then(r=>r.json()).then(w=>console.log('active:', w.active));
"
```
Expected: `active: true`.

- [ ] **Step 4: Disparar o webhook (1ª vez)**

Run:
```bash
node -e "
const { readFileSync } = require('node:fs');
const { N8N_URL } = JSON.parse(readFileSync('C:/Users/rick_/Downloads/rickrabelo-viagens-ig/tools/secrets.local.json','utf8'));
fetch(N8N_URL.replace(/\/\$/,'').replace(/\/api\/v1.*$/,'')+'/webhook/tmp-sink-smoke', { headers:{ 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' } }).then(r=>console.log('webhook status', r.status));
"
```
Expected: `webhook status 200`.

- [ ] **Step 5: Verificar 1ª execução — 2 promos inseridas (is_new) + card enviado**

Run (SQL): repetir o `select` do Step 1.
Expected: **2 linhas**, ambas `status = pending`.

Run (execução n8n): ler a última execução do `<TMP_ID>` com `includeData=true` e conferir que:
- o sub-workflow rodou (há execução do `<SINK_ID>` correspondente);
- `gps-upsert` retornou `is_new = true` pros 2 itens;
- `gps-notify` retornou 2xx da Evolution pros 2 itens (2 cards no Grupo Teste).
```bash
node -e "
const { readFileSync } = require('node:fs');
const { N8N_API_KEY, N8N_URL } = JSON.parse(readFileSync('C:/Users/rick_/Downloads/rickrabelo-viagens-ig/tools/secrets.local.json','utf8'));
const H = { 'X-N8N-API-KEY': N8N_API_KEY, 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' };
fetch(N8N_URL.replace(/\/\$/,'')+'/api/v1/executions?workflowId=<SINK_ID>&includeData=true&limit=5', { headers:H }).then(r=>r.json()).then(j=>{
  for (const e of (j.data||[])) {
    const nodes = e.data?.resultData?.runData || {};
    const up = (nodes['gps-upsert']||[]).flatMap(r=>(r.data?.main?.[0]||[]).map(i=>i.json));
    const nf = (nodes['gps-notify']||[]).length;
    console.log('exec', e.id, e.status, '| upsert is_new:', up.map(u=>u.is_new), '| notify runs:', nf);
  }
});
"
```
Expected: pelo menos uma linha com `is_new: [true]` (ou `[true,true]`) e `notify runs` ≥ 1. (Se o caller rodar 1x-por-item, aparecem 2 execuções do sink, cada uma com 1 `is_new:true` e 1 notify — também OK. Anotar qual modo é o real.)

- [ ] **Step 6: Disparar o webhook (2ª vez) — idempotência**

Repetir o Step 4 (mesma chamada). Expected: `webhook status 200`.

- [ ] **Step 7: Verificar idempotência — sem card novo, sem linha nova**

Run (SQL): repetir o `select` do Step 1.
Expected: **ainda 2 linhas** (on conflict do update; nenhuma inserção nova).

Run (execução): ler a nova execução do `<SINK_ID>` como no Step 5.
Expected: `gps-upsert` retorna `is_new = false` → `gps-only-new` filtra → **`gps-notify` NÃO roda** (0 cards novos no Grupo Teste).

- [ ] **Step 8: Cleanup — deletar linhas sintéticas e o harness**

Run (SQL):
```sql
delete from public.promo_alerts
where canonical_key in ('teste-sink-rss-20260712a','teste-sink-esfera-20260712a');
```
Expected: `DELETE 2`.

Run (deletar o harness temp):
```bash
node -e "
const { readFileSync } = require('node:fs');
const { N8N_API_KEY, N8N_URL } = JSON.parse(readFileSync('C:/Users/rick_/Downloads/rickrabelo-viagens-ig/tools/secrets.local.json','utf8'));
const H = { 'X-N8N-API-KEY': N8N_API_KEY, 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' };
fetch(N8N_URL.replace(/\/\$/,'')+'/api/v1/workflows/<TMP_ID>', { method:'DELETE', headers:H }).then(r=>console.log('delete status', r.status));
"
```
Expected: `delete status 200`.

- [ ] **Step 9: Verificar prod limpa + deletar o arquivo temp**

Run (SQL): repetir o `select` do Step 1. Expected: **0 linhas**.

```bash
rm scripts/n8n/_tmp-sink-smoke.workflow.json
```
(sem commit — arquivo era só andaime; nunca foi versionado)

---

## Task 3: Trocar `gm-promo-esfera` pra usar o sink

**Files:**
- Modify: `scripts/n8n/gm-promo-esfera.workflow.json`

**Interfaces:**
- Consumes: `<SINK_ID>` da Task 1; o sink já provado na Task 2.
- Produces: `gm-promo-esfera` sem os 6 nós downstream, com 1 nó `gme-sink` ligado a `gme-parse-json`.

- [ ] **Step 1: Editar o JSON — remover os 6 nós downstream e adicionar `gme-sink`**

Em `scripts/n8n/gm-promo-esfera.workflow.json`:

1. **Remover do array `nodes`** os objetos: `gme-is-promo`, `gme-upsert`, `gme-only-new`, `gme-tenant`, `gme-message`, `gme-notify`.
2. **Adicionar ao array `nodes`** (posição à direita do `gme-parse-json` [1100,300]) — PASSTHROUGH, sem `workflowInputs`:
```json
{
  "parameters": {
    "source": "database",
    "workflowId": { "__rl": true, "value": "PR1iXHITz9GcjsYN", "mode": "list", "cachedResultName": "gm-promo-sink" },
    "options": { "waitForSubWorkflow": true }
  },
  "id": "gme-sink", "name": "gme-sink", "type": "n8n-nodes-base.executeWorkflow", "typeVersion": 1.1, "position": [1320, 300],
  "notes": "Downstream (is-promo->notify) vive em gm-promo-sink (passthrough). Passa o item parseado inteiro; o sink lê $json.category etc. direto."
}
```
3. **Em `connections`**, substituir o bloco `"gme-parse-json": { "main": [[{ "node": "gme-is-promo", ... }]] }` por:
```json
"gme-parse-json": { "main": [[{ "node": "gme-sink", "type": "main", "index": 0 }]] }
```
4. **Remover de `connections`** as chaves: `gme-is-promo`, `gme-upsert`, `gme-only-new`, `gme-tenant`, `gme-message` (todas as arestas dos nós removidos). Deixar `gme-parse-json → gme-sink` como aresta terminal.

- [ ] **Step 2: Sanidade local do JSON**

Run:
```bash
node -e "const w=require('./scripts/n8n/gm-promo-esfera.workflow.json'); const n=w.nodes.map(x=>x.id); console.log('nodes:', n.join(',')); const gone=['gme-is-promo','gme-upsert','gme-only-new','gme-tenant','gme-message','gme-notify'].filter(x=>n.includes(x)); console.log('deviam-sumir presentes:', gone); console.log('tem gme-sink:', n.includes('gme-sink')); console.log('parse->', JSON.stringify(w.connections['gme-parse-json']));"
```
Expected: `deviam-sumir presentes: []`; `tem gme-sink: true`; `parse->` aponta pra `gme-sink`.

- [ ] **Step 3: Publicar (update) o `gm-promo-esfera` E RE-ATIVAR**

⚠️ O PUT desativa o workflow — re-ativar na sequência (o sink já está ativo).
Run: `node scripts/n8n/push-workflow.mjs scripts/n8n/gm-promo-esfera.workflow.json p2wC2fzENv1OpHau`
Expected: `ok: workflow p2wC2fzENv1OpHau (gm-promo-esfera)`.
Run (re-ativar): `POST /api/v1/workflows/p2wC2fzENv1OpHau/activate` (via node fetch com UA browser).
Expected: status 200.

- [ ] **Step 4: Round-trip — confirmar estrutura e que segue ativo**

Run:
```bash
node -e "
const { readFileSync } = require('node:fs');
const { N8N_API_KEY, N8N_URL } = JSON.parse(readFileSync('C:/Users/rick_/Downloads/rickrabelo-viagens-ig/tools/secrets.local.json','utf8'));
const H = { 'X-N8N-API-KEY': N8N_API_KEY, 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' };
fetch(N8N_URL.replace(/\/\$/,'')+'/api/v1/workflows/p2wC2fzENv1OpHau', { headers:H }).then(r=>r.json()).then(w=>{
  const ids=(w.nodes||[]).map(n=>n.id);
  console.log('active:', w.active, '| tem gme-sink:', ids.includes('gme-sink'), '| sumiram os 6:', !ids.some(i=>['gme-is-promo','gme-upsert','gme-only-new','gme-tenant','gme-message','gme-notify'].includes(i)));
});
"
```
Expected: `active: true | tem gme-sink: true | sumiram os 6: true`.

- [ ] **Step 5: Verificação ao vivo — forçar 1 item real pelo pipeline**

Objetivo: provar que `gme-parse-json → gme-sink → (sub) gps-*` roda de ponta a ponta com dado REAL. Força-se um reprocessamento deletando 1 linha `seen` recente; a re-execução re-insere o `seen` (prod volta ao estado anterior) e o item flui pelo sink. Se a promo já existir em `promo_alerts` (conflito), `is_new=false` → sem card (comportamento correto); o que importa é a cadeia ter rodado.

Run (SQL — escolher e remover 1 seen recente da Esfera):
```sql
-- guarde o external_id impresso; será re-inserido pela própria run
delete from public.promo_ingest_seen
where source = 'telegram-esfera'
  and external_id = (
    select external_id from public.promo_ingest_seen
    where source = 'telegram-esfera' order by created_at desc limit 1
  )
returning external_id;
```
Expected: 1 linha (o `external_id` reprocessável).

Run (clonar o produtor com trigger webhook e disparar): cria um clone temporário de `gm-promo-esfera` trocando `gme-cron` por um webhook (path `tmp-esfera-run`), push (create), activate, chamar `${N8N_URL}/webhook/tmp-esfera-run`, ler `GET /executions?workflowId=<CLONE_ID>&includeData=true`, depois `DELETE` do clone. (Mesma receita clone-webhook do Global Constraints.)

Expected na execução do clone: o item desmarcado passa por `gme-unseen` (RETURNING) → `gme-extract` → `gme-parse-json` → **`gme-sink`** → o sink executa (`gps-upsert` roda). Confirma que `gme-sink` foi alcançado e o sub rodou.

Run (SQL — confirmar que o seen foi restaurado pela run):
```sql
select 1 from public.promo_ingest_seen where source='telegram-esfera' and external_id = '<external_id do delete>';
```
Expected: 1 linha (re-inserida pela run — prod restaurada).

> Se a run criar uma promo_alerts NOVA (item não existia antes), é uma promo real legítima; deixar pra moderação (comportamento normal do pipeline) ou deletar se quiser prod pristina.

- [ ] **Step 6: Commit**

```bash
git add scripts/n8n/gm-promo-esfera.workflow.json
git commit -m "refactor(usuario): gm-promo-esfera usa gm-promo-sink (remove downstream duplicado)"
```

---

## Task 4: Trocar `gm-promo-ingest` (RSS) pra usar o sink

**Files:**
- Modify: `scripts/n8n/gm-promo-ingest.workflow.json`

**Interfaces:**
- Consumes: `<SINK_ID>`; sink provado (Task 2) e já em uso pela Esfera (Task 3).
- Produces: `gm-promo-ingest` sem os 6 nós downstream, com 1 nó `gmpi-sink` ligado a `gmpi-parse`.

- [ ] **Step 1: Editar o JSON — remover os 6 nós downstream e adicionar `gmpi-sink`**

Em `scripts/n8n/gm-promo-ingest.workflow.json`:

1. **Remover do array `nodes`** os objetos: `gmpi-is-promo`, `gmpi-upsert`, `gmpi-only-new`, `gmpi-tenant`, `gmpi-message`, `gmpi-notify`.
2. **Adicionar ao array `nodes`** (à direita do `gmpi-parse` [1320,300]) — PASSTHROUGH, sem `workflowInputs`:
```json
{
  "parameters": {
    "source": "database",
    "workflowId": { "__rl": true, "value": "PR1iXHITz9GcjsYN", "mode": "list", "cachedResultName": "gm-promo-sink" },
    "options": { "waitForSubWorkflow": true }
  },
  "id": "gmpi-sink", "name": "gmpi-sink", "type": "n8n-nodes-base.executeWorkflow", "typeVersion": 1.1, "position": [1540, 300],
  "notes": "Downstream (is-promo->notify) vive em gm-promo-sink (passthrough). Passa o item parseado inteiro."
}
```
3. **Em `connections`**, substituir `"gmpi-parse": { "main": [[{ "node": "gmpi-is-promo", ... }]] }` por:
```json
"gmpi-parse": { "main": [[{ "node": "gmpi-sink", "type": "main", "index": 0 }]] }
```
4. **Remover de `connections`** as chaves: `gmpi-is-promo`, `gmpi-upsert`, `gmpi-only-new`, `gmpi-tenant`, `gmpi-message`.

- [ ] **Step 2: Sanidade local do JSON**

Run:
```bash
node -e "const w=require('./scripts/n8n/gm-promo-ingest.workflow.json'); const n=w.nodes.map(x=>x.id); console.log('nodes:', n.join(',')); const gone=['gmpi-is-promo','gmpi-upsert','gmpi-only-new','gmpi-tenant','gmpi-message','gmpi-notify'].filter(x=>n.includes(x)); console.log('deviam-sumir presentes:', gone); console.log('tem gmpi-sink:', n.includes('gmpi-sink')); console.log('parse->', JSON.stringify(w.connections['gmpi-parse']));"
```
Expected: `deviam-sumir presentes: []`; `tem gmpi-sink: true`; `parse->` aponta pra `gmpi-sink`.

- [ ] **Step 3: Publicar (update) o `gm-promo-ingest` E RE-ATIVAR**

⚠️ O PUT desativa o workflow — re-ativar na sequência (o sink já está ativo).
Run: `node scripts/n8n/push-workflow.mjs scripts/n8n/gm-promo-ingest.workflow.json kf33adWMPKMAEv4C`
Expected: `ok: workflow kf33adWMPKMAEv4C (gm-promo-ingest)`.
Run (re-ativar): `POST /api/v1/workflows/kf33adWMPKMAEv4C/activate` (via node fetch com UA browser).
Expected: status 200.

- [ ] **Step 4: Round-trip — confirmar estrutura e que segue ativo**

Run:
```bash
node -e "
const { readFileSync } = require('node:fs');
const { N8N_API_KEY, N8N_URL } = JSON.parse(readFileSync('C:/Users/rick_/Downloads/rickrabelo-viagens-ig/tools/secrets.local.json','utf8'));
const H = { 'X-N8N-API-KEY': N8N_API_KEY, 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' };
fetch(N8N_URL.replace(/\/\$/,'')+'/api/v1/workflows/kf33adWMPKMAEv4C', { headers:H }).then(r=>r.json()).then(w=>{
  const ids=(w.nodes||[]).map(n=>n.id);
  console.log('active:', w.active, '| tem gmpi-sink:', ids.includes('gmpi-sink'), '| sumiram os 6:', !ids.some(i=>['gmpi-is-promo','gmpi-upsert','gmpi-only-new','gmpi-tenant','gmpi-message','gmpi-notify'].includes(i)));
});
"
```
Expected: `active: true | tem gmpi-sink: true | sumiram os 6: true`.

- [ ] **Step 5: Verificação ao vivo — próxima execução real do cron (15min)**

O RSS roda a cada 15min. Após o push, observar a próxima execução agendada e confirmar que a cadeia `gmpi-parse → gmpi-sink → (sub) gps-*` rodou. (Se quiser forçar sem esperar, aplicar a mesma receita seen-delete + clone-webhook da Task 3 Step 5, com `source in ('melhorescartoes','pontospravoar','melhoresdestinos')`.)

Run:
```bash
node -e "
const { readFileSync } = require('node:fs');
const { N8N_API_KEY, N8N_URL } = JSON.parse(readFileSync('C:/Users/rick_/Downloads/rickrabelo-viagens-ig/tools/secrets.local.json','utf8'));
const H = { 'X-N8N-API-KEY': N8N_API_KEY, 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126' };
fetch(N8N_URL.replace(/\/\$/,'')+'/api/v1/executions?workflowId=kf33adWMPKMAEv4C&includeData=true&limit=3', { headers:H }).then(r=>r.json()).then(j=>{
  for (const e of (j.data||[])) {
    const rd = e.data?.resultData?.runData || {};
    console.log('exec', e.id, e.status, '| gmpi-sink rodou:', !!rd['gmpi-sink']);
  }
});
"
```
Expected: uma execução `success` recente com `gmpi-sink rodou: true` (nas runs com item novo). Runs sem item novo não alcançam `gmpi-sink` — normal.

- [ ] **Step 6: Commit**

```bash
git add scripts/n8n/gm-promo-ingest.workflow.json
git commit -m "refactor(usuario): gm-promo-ingest usa gm-promo-sink (remove downstream duplicado)"
```

---

## Task 5: Fechar — memória + PR

**Files:**
- Modify: memória `promocoes-automaticas-built.md`

- [ ] **Step 1: Atualizar a memória**

Registrar em `C:\Users\rick_\.claude\projects\C--Users-rick--OneDrive--rea-de-Trabalho-Gest-Miles-gest-miles-usuario-front\memory\promocoes-automaticas-built.md` que o sub-workflow compartilhado `gm-promo-sink` (`<SINK_ID>`) está no ar; RSS + Esfera usam-no; a 3ª fonte (IMAP) agora é só "parse → chama o sink". Remover o follow-up "sub-workflow compartilhado do downstream" da lista de pendências.

- [ ] **Step 2: Abrir PR**

```bash
git push -u origin feat/promo-sink-subworkflow
gh pr create --title "refactor(usuario): sub-workflow gm-promo-sink (DRY do downstream de promoções)" --body "Extrai o downstream duplicado (is-promo→notify) dos 2 produtores (RSS + Esfera) num sub-workflow único. Ver spec/plano em docs/superpowers. Smoke sintético + troca um produtor por vez, ambos verificados ao vivo."
```

---

## Self-Review (feito ao escrever)

- **Cobertura do spec:** sink inativo (T1), smoke 2-formas+idempotência (T2), troca Esfera (T3), troca RSS (T4), commit+memória (T5). Todos os itens do spec têm task.
- **Placeholders:** `<SINK_ID>`/`<TMP_ID>`/`<CLONE_ID>`/`<external_id>` são valores capturados em runtime (documentados no Global Constraints), não pendências. JSON completo inline.
- **Consistência de tipos:** o contrato produtor→sink é `payload` (string) nos 3 lugares (gps-in input, t-sink/gme-sink/gmpi-sink `value.payload`); `gps-unwrap` faz `JSON.parse`; campos lidos batem com o `queryReplacement` defensivo. IDs de credencial idênticos em todos os nós.
```
