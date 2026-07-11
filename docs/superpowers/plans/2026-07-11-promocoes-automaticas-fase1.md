# Promoções Automáticas — Fase 1 (MVP feed real) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o mock do hub `/bonus-offers` por promoções reais ingeridas automaticamente de 3 feeds RSS, com extração via LLM, dedup, curadoria de 1 toque pelo grupo WhatsApp interno e expiração automática.

**Architecture:** n8n (cron 15min) lê os feeds → filtra itens novos via `promo_ingest_seen` → Claude Haiku extrai JSON estruturado → upsert em `promo_alerts` por `canonical_key` → item novo vira card no grupo interno com links de moderação (página de confirmação servida pelo BFF, que é quem guarda o segredo HMAC). O front lê só `status='approved'` vigente via RLS (padrão `bonus_offers`), com TanStack Query como cache.

**Tech Stack:** Supabase (Postgres + RLS), Express (BFF), n8n + Evolution API (infra Fase C existente), API Anthropic (`claude-haiku-4-5`), React + TanStack Query + Vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-promocoes-automaticas-design.md`

## Global Constraints

- Banco Supabase é **compartilhado com manager/admin, sem staging** — migration só se aplica com OK explícito do owner no checkpoint (OK em princípio já dado em 2026-07-11).
- Segredo **nunca** em `VITE_`/front: `PROMO_MODERATION_SECRET` e `ANTHROPIC_API_KEY` vivem só em env do backend / credencial n8n.
- Evolution apikey **nunca sai do n8n**; segredo HMAC **nunca entra no n8n** (o BFF monta a mensagem com os links prontos).
- Copy das promoções é **própria** (fatos extraídos), sempre com crédito/link da fonte. Passageiro de Primeira **fora** (decisão do owner).
- Gates antes de "pronto": `npx tsc -b` limpo + `npm test` verde + `npm run build` ok (build NÃO type-checka).
- Testes: Vitest no front (descrições PT-BR), `node --test` no backend.
- Commits PT-BR com escopo (`feat(usuario):`, `feat(backend):`), branch `feat/promocoes-automaticas`, PR no final (sem push direto no main).
- Categorias do produto: `transfer | shopping | miles | cards` (mesmo enum do hub existente).
- Modelo LLM: `claude-haiku-4-5`, `max_tokens: 1024`.
- Arquivos de workflow n8n em disco: ASCII-safe (sem char de controle literal em regex — lição da Fase C).

## File Structure

```
supabase/migrations/20260711120000_promo_alerts.sql   ← CRIAR: promo_alerts + promo_ingest_seen + RLS
backend/src/lib/promoModeration.js                    ← CRIAR: HMAC de moderação (gen + verify)
backend/src/lib/promoModeration.test.js               ← CRIAR
backend/src/lib/promoMessage.js                       ← CRIAR: monta msg WhatsApp de curadoria (com links)
backend/src/lib/promoMessage.test.js                  ← CRIAR
backend/src/routes/promoAlerts.js                     ← CRIAR: GET / (lista pública) + GET/POST /moderate/:id
backend/src/routes/agentPromo.js                      ← CRIAR: GET /api/agent/promo-message/:id (x-api-key)
backend/src/index.js                                  ← MODIFICAR: montar as 2 rotas novas
backend/.env.example                                  ← MODIFICAR: PROMO_MODERATION_SECRET + PUBLIC_API_URL
src/lib/bonusTypes.ts                                 ← CRIAR: tipos movidos do mock + notice novo + sourceLinks
src/lib/promo-alerts/service.ts                       ← CRIAR: fetch (BFF ou Supabase RLS) + mapPromoAlertRow
src/lib/promo-alerts/service.test.ts                  ← CRIAR
src/hooks/useBonusPromotions.ts                       ← REESCREVER: TanStack Query, mesma interface + loading
src/hooks/useBonusPromotions.test.tsx                 ← CRIAR
src/lib/bonusMockData.ts                              ← DELETAR (imports migram pra bonusTypes)
src/lib/bonusUtils.ts                                 ← MODIFICAR: import de bonusTypes
src/components/bonus/BonusPromotionsSection.tsx       ← MODIFICAR: import + estado loading/vazio
src/pages/BonusOffersScreen.tsx                       ← MODIFICAR: import + estado loading
src/pages/BonusOfferDetailScreen.tsx                  ← MODIFICAR: busca via hook + fontes no tab Regras
scripts/n8n/push-workflow.mjs                         ← CRIAR: cria/atualiza workflow via API do n8n
scripts/n8n/gm-promo-ingest.workflow.json             ← CRIAR: workflow de ingestão
scripts/n8n/gm-promo-housekeeping.workflow.json       ← CRIAR: expiração + monitor de silêncio
```

Fora do escopo desta fase: `bonus_offers` (tabela, rota, `BonusOffersSection.tsx` — componente morto, ninguém importa), Telegram/e-mail (fase 2), personalização (fase 3). As linhas-demo de `bonus_offers` ficam como estão (o manager pode renderizá-las; tratar no follow-up de sync).

---

### Task 1: Migration `promo_alerts` + `promo_ingest_seen`

**Files:**
- Create: `supabase/migrations/20260711120000_promo_alerts.sql`

**Interfaces:**
- Produces: tabelas `public.promo_alerts` (colunas conforme SQL abaixo) e `public.promo_ingest_seen`; RLS de leitura pública só `status='approved'` vigente. Tasks 4–8 dependem desses nomes exatos.

- [ ] **Step 1: Escrever a migration**

```sql
-- Promoções automáticas (fase 1): tabela canônica + staging de dedup do pipeline n8n.
-- Escrita: só pipeline (conexão postgres do n8n, bypassa RLS) e service role (moderação via BFF).
-- Leitura pública (anon/authenticated): apenas aprovadas e vigentes — padrão bonus_offers.
-- Spec: docs/superpowers/specs/2026-07-11-promocoes-automaticas-design.md

create table if not exists public.promo_alerts (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('transfer', 'shopping', 'miles', 'cards')),
  source_program text,
  target_program text,
  title text not null,
  bonus_value text,
  bonus_numeric numeric,
  tiers jsonb,
  valid_from date,
  valid_until date,
  details text,
  cta_url text,
  source_links jsonb not null default '[]'::jsonb,
  canonical_key text not null unique,
  confidence numeric,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  moderated_at timestamptz
);

create index if not exists promo_alerts_status_valid_idx
  on public.promo_alerts (status, valid_until);

create table if not exists public.promo_ingest_seen (
  source text not null,
  external_id text not null,
  seen_at timestamptz not null default now(),
  primary key (source, external_id)
);

alter table public.promo_alerts enable row level security;
alter table public.promo_ingest_seen enable row level security;

drop policy if exists "promo_alerts_select_public" on public.promo_alerts;
create policy "promo_alerts_select_public"
  on public.promo_alerts for select
  using (status = 'approved' and (valid_until is null or valid_until >= current_date));

-- Staging é interna do pipeline: RLS sem policy (deny) + revoke explícito de cinto e suspensório.
revoke all on public.promo_ingest_seen from anon, authenticated;
```

- [ ] **Step 2: CHECKPOINT — mostrar o SQL ao owner e obter OK pra aplicar**

Owner deu OK em princípio (decisão 3 do spec). Mostrar este SQL e confirmar aplicação AGORA no banco compartilhado.

- [ ] **Step 3: Aplicar via MCP Supabase**

Usar `mcp__plugin_supabase_supabase__apply_migration` com `name: promo_alerts` e o SQL acima (project `jntkpcjmmnaghmimdcam`).

- [ ] **Step 4: Verificar**

Via `mcp__plugin_supabase_supabase__execute_sql`:
```sql
select count(*) from public.promo_alerts;                       -- 0
insert into public.promo_alerts (category, title, canonical_key)
  values ('transfer', 'smoke', 'smoke:1') returning id;          -- funciona (postgres owner)
select count(*) from public.promo_alerts;                        -- 1
delete from public.promo_alerts where canonical_key = 'smoke:1';
```
Rodar `mcp__plugin_supabase_supabase__get_advisors` (security) — sem ERROR novo.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260711120000_promo_alerts.sql
git commit -m "feat(usuario): migration promo_alerts + promo_ingest_seen (promoções automáticas fase 1)"
```

---

### Task 2: Backend — lib `promoModeration` (HMAC)

**Files:**
- Create: `backend/src/lib/promoModeration.js`
- Test: `backend/src/lib/promoModeration.test.js`

**Interfaces:**
- Produces: `moderationToken(id, action, secret) => string (hex)` e `verifyModeration({ id, action, token, secret }) => "ok" | "missing_env" | "bad_action" | "mismatch"`. Consumido pelas Tasks 3 e 4.

- [ ] **Step 1: Escrever o teste que falha**

```js
// backend/src/lib/promoModeration.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { moderationToken, verifyModeration } from "./promoModeration.js";

const SECRET = "segredo-de-teste";
const ID = "5f0c6c1e-0000-4000-8000-000000000001";

test("token é determinístico e valida com os mesmos parâmetros", () => {
  const token = moderationToken(ID, "approve", SECRET);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(verifyModeration({ id: ID, action: "approve", token, secret: SECRET }), "ok");
});

test("token de approve não vale pra reject (ação entra no HMAC)", () => {
  const token = moderationToken(ID, "approve", SECRET);
  assert.equal(verifyModeration({ id: ID, action: "reject", token, secret: SECRET }), "mismatch");
});

test("token errado, ausente ou de outro id => mismatch", () => {
  const token = moderationToken(ID, "approve", SECRET);
  assert.equal(verifyModeration({ id: ID, action: "approve", token: "x", secret: SECRET }), "mismatch");
  assert.equal(verifyModeration({ id: ID, action: "approve", token: undefined, secret: SECRET }), "mismatch");
  assert.equal(verifyModeration({ id: "outro-id", action: "approve", token, secret: SECRET }), "mismatch");
});

test("ação desconhecida => bad_action; sem secret => missing_env", () => {
  assert.equal(verifyModeration({ id: ID, action: "delete", token: "x", secret: SECRET }), "bad_action");
  assert.equal(verifyModeration({ id: ID, action: "approve", token: "x", secret: "" }), "missing_env");
  assert.equal(verifyModeration({ id: ID, action: "approve", token: "x", secret: undefined }), "missing_env");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && node --test src/lib/promoModeration.test.js`
Expected: FAIL (`Cannot find module ... promoModeration.js`)

- [ ] **Step 3: Implementar**

```js
// backend/src/lib/promoModeration.js
import { createHmac, timingSafeEqual } from "node:crypto";

// Links de moderação clicados a partir do WhatsApp: o token amarra (id, ação) ao
// segredo do servidor. Segredo vive SÓ em env do backend — o n8n recebe a
// mensagem pronta (rota /api/agent/promo-message) e nunca vê o segredo.
const ACTIONS = new Set(["approve", "reject"]);

export function moderationToken(id, action, secret) {
  return createHmac("sha256", secret).update(`${id}:${action}`).digest("hex");
}

export function verifyModeration({ id, action, token, secret }) {
  if (!(secret ?? "").trim()) return "missing_env";
  if (!ACTIONS.has(action)) return "bad_action";
  const expected = Buffer.from(moderationToken(id, action, secret));
  const provided = Buffer.from(String(token ?? ""));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return "mismatch";
  }
  return "ok";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && node --test src/lib/promoModeration.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/promoModeration.js backend/src/lib/promoModeration.test.js
git commit -m "feat(backend): HMAC de moderação de promoções (token por id+ação)"
```

---

### Task 3: Backend — lib `promoMessage` (card de curadoria WhatsApp)

**Files:**
- Create: `backend/src/lib/promoMessage.js`
- Test: `backend/src/lib/promoMessage.test.js`

**Interfaces:**
- Consumes: `moderationToken` (Task 2).
- Produces: `buildPromoModerationMessage(promo, { apiBaseUrl, secret }) => string`. `promo` é a linha de `promo_alerts` (snake_case). Consumido pela Task 4 (rota agent).

- [ ] **Step 1: Escrever o teste que falha**

```js
// backend/src/lib/promoMessage.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { buildPromoModerationMessage } from "./promoMessage.js";
import { moderationToken } from "./promoModeration.js";

const SECRET = "segredo-de-teste";
const BASE = "https://api.exemplo.com.br";
const promo = {
  id: "5f0c6c1e-0000-4000-8000-000000000001",
  category: "transfer",
  source_program: "Livelo",
  target_program: "Smiles",
  title: "Livelo dá 100% de bônus pra Smiles",
  bonus_value: "100%",
  valid_until: "2026-07-20",
  confidence: 0.92,
  details: "Bônus para transferências até 20/07.",
  source_links: [{ name: "Melhores Cartões", url: "https://exemplo.com/post" }],
};

test("mensagem traz título, categoria, bônus, validade, fonte e os 2 links de moderação", () => {
  const msg = buildPromoModerationMessage(promo, { apiBaseUrl: BASE, secret: SECRET });
  assert.match(msg, /Livelo dá 100% de bônus pra Smiles/);
  assert.match(msg, /Transferência/);
  assert.match(msg, /Livelo → Smiles/);
  assert.match(msg, /100%/);
  assert.match(msg, /20\/07\/2026/);
  assert.match(msg, /Melhores Cartões/);
  const approve = moderationToken(promo.id, "approve", SECRET);
  const reject = moderationToken(promo.id, "reject", SECRET);
  assert.ok(msg.includes(`${BASE}/api/promo-alerts/moderate/${promo.id}?action=approve&token=${approve}`));
  assert.ok(msg.includes(`${BASE}/api/promo-alerts/moderate/${promo.id}?action=reject&token=${reject}`));
});

test("campos opcionais ausentes não quebram nem deixam 'undefined' no texto", () => {
  const msg = buildPromoModerationMessage(
    { id: "abc", category: "miles", title: "Compra de milhas com desconto", source_links: [] },
    { apiBaseUrl: BASE, secret: SECRET },
  );
  assert.match(msg, /Compra de milhas com desconto/);
  assert.doesNotMatch(msg, /undefined/);
  assert.doesNotMatch(msg, /null/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && node --test src/lib/promoMessage.test.js`
Expected: FAIL (`Cannot find module ... promoMessage.js`)

- [ ] **Step 3: Implementar**

```js
// backend/src/lib/promoMessage.js
import { moderationToken } from "./promoModeration.js";

const CATEGORY_LABEL = {
  transfer: "🔄 Transferência",
  shopping: "🛍 Compras",
  miles: "✈️ Milhas",
  cards: "💳 Cartão",
};

function formatDateBr(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
}

/** Card de curadoria enviado ao grupo interno. Formato aprovado na Fase C:
 *  negrito com *, uma informação por linha, links completos (WhatsApp não tem botão). */
export function buildPromoModerationMessage(promo, { apiBaseUrl, secret }) {
  const base = String(apiBaseUrl ?? "").replace(/\/$/, "");
  const lines = ["🔔 *Nova promoção detectada*", ""];
  lines.push(`*${promo.title}*`);

  const cat = CATEGORY_LABEL[promo.category] ?? promo.category;
  const route = [promo.source_program, promo.target_program].filter(Boolean).join(" → ");
  lines.push(route ? `${cat} · ${route}` : cat);

  if (promo.bonus_value) lines.push(`Bônus: ${promo.bonus_value}`);
  const until = formatDateBr(promo.valid_until);
  if (until) lines.push(`Válida até: ${until}`);
  if (typeof promo.confidence === "number") {
    lines.push(`Confiança: ${promo.confidence.toFixed(2)}`);
  }
  if (promo.details) lines.push(`Regras: ${promo.details}`);

  const sources = Array.isArray(promo.source_links) ? promo.source_links : [];
  if (sources.length > 0) {
    lines.push(`Fontes: ${sources.map((s) => s.name).filter(Boolean).join(", ")}`);
  }

  const link = (action) =>
    `${base}/api/promo-alerts/moderate/${promo.id}?action=${action}&token=${moderationToken(promo.id, action, secret)}`;
  lines.push("", `✅ Aprovar: ${link("approve")}`, `❌ Rejeitar: ${link("reject")}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && node --test src/lib/promoMessage.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/promoMessage.js backend/src/lib/promoMessage.test.js
git commit -m "feat(backend): card de curadoria de promoção (mensagem WhatsApp com links de moderação)"
```

---

### Task 4: Backend — rotas `/api/promo-alerts` e `/api/agent/promo-message/:id`

**Files:**
- Create: `backend/src/routes/promoAlerts.js`
- Create: `backend/src/routes/agentPromo.js`
- Modify: `backend/src/index.js` (imports + 2 `routes.use`)
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: `verifyModeration` (Task 2), `buildPromoModerationMessage` (Task 3), `agentKeyStatus` (`backend/src/lib/agentAuth.js`, existente), `supabase` (anon, `backend/src/lib/supabase.js`), `assertSupabaseService` (`backend/src/lib/supabaseService.js`), `serverError` (`backend/src/lib/httpError.js`).
- Produces:
  - `GET /api/promo-alerts` → array de linhas snake_case de `promo_alerts` (RLS filtra: só aprovadas vigentes). Consumido pela Task 5 (front).
  - `GET /api/promo-alerts/moderate/:id?action=&token=` → página HTML de confirmação (GET **nunca** executa — o preview de link do WhatsApp faz prefetch e auto-moderaria).
  - `POST /api/promo-alerts/moderate/:id?action=&token=` → executa a moderação (service role) e responde HTML.
  - `GET /api/agent/promo-message/:id` (header `x-api-key` = `AGENT_API_KEY`) → `{ message }` pronto pro Evolution. Consumido pelo workflow n8n (Task 7).

- [ ] **Step 1: Criar `backend/src/routes/promoAlerts.js`**

```js
import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { serverError } from "../lib/httpError.js";
import { verifyModeration } from "../lib/promoModeration.js";

const router = Router();

/** GET /api/promo-alerts — client anon: a RLS entrega só approved + vigente. */
router.get("/", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("promo_alerts")
      .select(
        "id, category, source_program, target_program, title, bonus_value, bonus_numeric, tiers, valid_from, valid_until, details, cta_url, source_links",
      )
      .order("bonus_numeric", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) {
      return serverError(res, "Erro ao listar promoções", error, "[promo-alerts]");
    }
    return res.json(data ?? []);
  } catch (err) {
    return serverError(res, "Erro ao listar promoções", err, "[promo-alerts]");
  }
});

const ACTION_LABEL = { approve: "Aprovar", reject: "Rejeitar" };
const DONE_LABEL = { approve: "aprovada ✅", reject: "rejeitada ❌" };

function page(title, body) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#F7F7F8;color:#1F1F1F;margin:0;padding:24px;text-align:center}button{background:#8A05BE;color:#fff;border:0;border-radius:14px;padding:14px 32px;font-size:16px;font-weight:600;cursor:pointer}</style></head><body><div>${body}</div></body></html>`;
}

/** Valida o link e devolve 401/503 prontos; retorna null quando ok. */
function moderationGate(req, res) {
  const { action, token } = req.query;
  const status = verifyModeration({
    id: req.params.id,
    action,
    token,
    secret: process.env.PROMO_MODERATION_SECRET,
  });
  if (status === "missing_env") {
    res.status(503).send(page("Indisponível", "<p>Moderação não configurada no servidor.</p>"));
    return "handled";
  }
  if (status !== "ok") {
    res.status(401).send(page("Link inválido", "<p>Link de moderação inválido.</p>"));
    return "handled";
  }
  return null;
}

/** GET — só renderiza a confirmação. NUNCA executar aqui (prefetch do WhatsApp). */
router.get("/moderate/:id", (req, res) => {
  if (moderationGate(req, res)) return;
  const { action, token } = req.query;
  const verb = ACTION_LABEL[action];
  // action/token só são ecoados APÓS o verify (action ∈ allowlist, token hex conferido) — sem XSS.
  return res.send(
    page(
      `${verb} promoção`,
      `<h2>${verb} esta promoção?</h2><form method="POST" action="/api/promo-alerts/moderate/${req.params.id}?action=${action}&token=${token}"><button type="submit">${verb}</button></form>`,
    ),
  );
});

/** POST — executa. Idempotente: reclicar um link já executado só reafirma o estado. */
router.post("/moderate/:id", async (req, res) => {
  if (moderationGate(req, res)) return;
  try {
    const { action } = req.query;
    const status = action === "approve" ? "approved" : "rejected";
    const service = assertSupabaseService();
    const { data, error } = await service
      .from("promo_alerts")
      .update({ status, moderated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .in("status", ["pending", "approved", "rejected"])
      .select("id, title")
      .maybeSingle();
    if (error) {
      return serverError(res, "Erro ao moderar promoção", error, "[promo-alerts]");
    }
    if (!data) {
      return res.status(404).send(page("Não encontrada", "<p>Promoção não encontrada (ou já expirada).</p>"));
    }
    return res.send(page("Feito", `<h2>Promoção ${DONE_LABEL[action]}</h2><p>${data.title}</p>`));
  } catch (err) {
    return serverError(res, "Erro ao moderar promoção", err, "[promo-alerts]");
  }
});

export default router;
```

- [ ] **Step 2: Criar `backend/src/routes/agentPromo.js`**

```js
import { Router } from "express";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { serverError } from "../lib/httpError.js";
import { agentKeyStatus } from "../lib/agentAuth.js";
import { buildPromoModerationMessage } from "../lib/promoMessage.js";

const router = Router();

/**
 * GET /api/agent/promo-message/:id — server-to-server (workflow n8n gm-promo-ingest).
 * Auth: x-api-key === AGENT_API_KEY. Devolve a mensagem de curadoria PRONTA
 * (com links HMAC) — o segredo de moderação nunca entra no n8n.
 */
router.get("/promo-message/:id", async (req, res) => {
  try {
    const keyStatus = agentKeyStatus(req.get("x-api-key"), process.env.AGENT_API_KEY);
    if (keyStatus === "missing_env") {
      return res.status(503).json({ error: "AGENT_API_KEY não configurada no servidor." });
    }
    if (keyStatus === "mismatch") {
      return res.status(401).json({ error: "API key inválida." });
    }
    const secret = process.env.PROMO_MODERATION_SECRET;
    const apiBaseUrl = process.env.PUBLIC_API_URL;
    if (!(secret ?? "").trim() || !(apiBaseUrl ?? "").trim()) {
      return res.status(503).json({ error: "PROMO_MODERATION_SECRET/PUBLIC_API_URL não configuradas." });
    }

    const service = assertSupabaseService();
    const { data, error } = await service
      .from("promo_alerts")
      .select("id, category, source_program, target_program, title, bonus_value, valid_until, confidence, details, source_links")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) {
      return serverError(res, "Erro ao ler promoção", error, "[agent-promo]");
    }
    if (!data) {
      return res.status(404).json({ error: "Promoção não encontrada." });
    }
    return res.json({ message: buildPromoModerationMessage(data, { apiBaseUrl, secret }) });
  } catch (err) {
    return serverError(res, "Erro ao montar mensagem de promoção", err, "[agent-promo]");
  }
});

export default router;
```

- [ ] **Step 3: Montar as rotas em `backend/src/index.js`**

Adicionar aos imports (junto dos outros, após `agentResumoRoutes`):
```js
import promoAlertsRoutes from "./routes/promoAlerts.js";
import agentPromoRoutes from "./routes/agentPromo.js";
```
Adicionar após `routes.use("/api/agent", agentResumoRoutes);` (linha ~104):
```js
routes.use("/api/promo-alerts", promoAlertsRoutes);
routes.use("/api/agent", agentPromoRoutes);
```

- [ ] **Step 4: Atualizar `backend/.env.example`**

Adicionar ao final (ler o arquivo antes; manter o formato existente):
```bash
# Promoções automáticas (fase 1)
# Segredo HMAC dos links de moderação (gerar: openssl rand -hex 32). Nunca no front/n8n.
PROMO_MODERATION_SECRET=
# URL pública deste backend (base dos links de moderação enviados no WhatsApp)
PUBLIC_API_URL=https://gest-miles-usuario-front-slzj.vercel.app
```

- [ ] **Step 5: Verificar manualmente (backend local)**

```bash
cd backend && npm run dev
# noutro terminal:
curl -s http://localhost:3000/api/promo-alerts            # esperado: []
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/promo-alerts/moderate/abc?action=approve&token=x"   # esperado: 401 (ou 503 sem env)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/agent/promo-message/abc                              # esperado: 503 (sem env) ou 401
```
Rodar a suíte toda do backend: `cd backend && npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/promoAlerts.js backend/src/routes/agentPromo.js backend/src/index.js backend/.env.example
git commit -m "feat(backend): rotas de promoções automáticas (lista pública + moderação HMAC + msg de curadoria)"
```

---

### Task 5: Front — tipos + service `promo-alerts` (TDD)

**Files:**
- Create: `src/lib/bonusTypes.ts`
- Create: `src/lib/promo-alerts/service.ts`
- Test: `src/lib/promo-alerts/service.test.ts`

**Interfaces:**
- Consumes: `apiFetch`, `hasApiUrl` (`src/services/api.ts`), `supabase`, `isSupabaseConfigured` (`src/lib/supabase.ts`).
- Produces (Task 6 depende):
  - `src/lib/bonusTypes.ts`: `BonusCategory`, `BonusTier`, `BonusPromotion` (idênticos aos de `bonusMockData.ts`, MAIS o campo opcional `sourceLinks?: { name: string; url: string }[]`) e `BONUS_PROMOTIONS_SOURCE_NOTICE` (texto novo).
  - `src/lib/promo-alerts/service.ts`: `mapPromoAlertRow(row: Record<string, unknown>): BonusPromotion | null`, `isCurrentPromo(p: BonusPromotion, today?: string): boolean`, `pickHighlightId(promos: BonusPromotion[]): string | null`, `getActivePromoAlerts(options?: { signal?: AbortSignal }): Promise<BonusPromotion[]>`.

- [ ] **Step 1: Criar `src/lib/bonusTypes.ts`**

Copiar os tipos de `src/lib/bonusMockData.ts` (linhas 3–26) SEM o array mock, adicionando `sourceLinks` e o notice novo:

```ts
// src/lib/bonusTypes.ts — contrato de UI do hub de promoções (dados reais via promo_alerts)

export type BonusCategory = 'transfer' | 'shopping' | 'miles' | 'cards'

export interface BonusTier {
  label: string
  value: string
  isBest?: boolean
}

export interface BonusPromotion {
  id: string
  category: BonusCategory
  targetProgram: string
  bonusValue: string
  bonusLabel: string
  participatingBanks?: string[]
  tiers?: BonusTier[]
  partnerStores?: number
  maxBonus?: number
  expiresAt?: string
  isActive: boolean
  isHighlight: boolean
  ctaUrl?: string
  rules?: string
  sourceLinks?: { name: string; url: string }[]
}

export const BONUS_PROMOTIONS_SOURCE_NOTICE =
  'Promoções detectadas automaticamente e revisadas pela equipe. Confirme validade e regras no site do programa antes de agir.'
```

- [ ] **Step 2: Escrever o teste do service (falhando)**

```ts
// src/lib/promo-alerts/service.test.ts
import { describe, expect, it } from 'vitest'
import { mapPromoAlertRow, isCurrentPromo, pickHighlightId } from './service'

const row = {
  id: 'abc',
  category: 'transfer',
  source_program: 'Livelo',
  target_program: 'Smiles',
  title: 'Livelo dá 100% pra Smiles',
  bonus_value: '100%',
  bonus_numeric: 100,
  tiers: [{ label: 'Clube', value: '110%', isBest: true }],
  valid_until: '2099-07-20',
  details: 'Regras resumidas.',
  cta_url: 'https://livelo.com.br/promo',
  source_links: [{ name: 'Melhores Cartões', url: 'https://exemplo.com/post' }],
}

describe('mapPromoAlertRow', () => {
  it('mapeia linha de transferência com origem virando banco participante', () => {
    const promo = mapPromoAlertRow(row)!
    expect(promo.id).toBe('abc')
    expect(promo.category).toBe('transfer')
    expect(promo.targetProgram).toBe('Smiles')
    expect(promo.bonusValue).toBe('100%')
    expect(promo.bonusLabel).toBe('de bônus')
    expect(promo.participatingBanks).toEqual(['Livelo'])
    expect(promo.tiers).toEqual([{ label: 'Clube', value: '110%', isBest: true }])
    expect(promo.expiresAt).toBe('2099-07-20T23:59:00')
    expect(promo.rules).toBe('Regras resumidas.')
    expect(promo.ctaUrl).toBe('https://livelo.com.br/promo')
    expect(promo.sourceLinks).toEqual([{ name: 'Melhores Cartões', url: 'https://exemplo.com/post' }])
    expect(promo.isActive).toBe(true)
    expect(promo.isHighlight).toBe(false)
  })

  it('sem target_program usa source_program como programa exibido', () => {
    const promo = mapPromoAlertRow({ ...row, category: 'shopping', target_program: null })!
    expect(promo.targetProgram).toBe('Livelo')
    expect(promo.participatingBanks).toBeUndefined()
  })

  it('categoria desconhecida ou sem id => null', () => {
    expect(mapPromoAlertRow({ ...row, category: 'cupom' })).toBeNull()
    expect(mapPromoAlertRow({ ...row, id: null })).toBeNull()
  })

  it('sem valid_until não define expiresAt', () => {
    expect(mapPromoAlertRow({ ...row, valid_until: null })!.expiresAt).toBeUndefined()
  })
})

describe('isCurrentPromo', () => {
  it('mantém sem validade e futuras; corta vencidas', () => {
    const promo = mapPromoAlertRow(row)!
    expect(isCurrentPromo(promo, '2099-07-20')).toBe(true)
    expect(isCurrentPromo(promo, '2099-07-21')).toBe(false)
    expect(isCurrentPromo(mapPromoAlertRow({ ...row, valid_until: null })!, '2099-07-21')).toBe(true)
  })
})

describe('pickHighlightId', () => {
  it('escolhe a transferência de maior bônus; sem transfer cai na primeira promo; vazio => null', () => {
    // pickHighlightId compara parseFloat(bonusValue) — variar bonus_value, não bonus_numeric
    const a = mapPromoAlertRow({ ...row, id: 'a', bonus_value: '80%' })!
    const b = mapPromoAlertRow({ ...row, id: 'b', bonus_value: '120%' })!
    const c = mapPromoAlertRow({ ...row, id: 'c', category: 'miles', bonus_value: '-30%' })!
    expect(pickHighlightId([a, b, c])).toBe('b')
    expect(pickHighlightId([c])).toBe('c')
    expect(pickHighlightId([])).toBeNull()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test -- src/lib/promo-alerts/service.test.ts`
Expected: FAIL (módulo `./service` não existe)

- [ ] **Step 4: Implementar `src/lib/promo-alerts/service.ts`**

```ts
// src/lib/promo-alerts/service.ts — leitura de promo_alerts (BFF ou Supabase RLS) mapeada pro contrato de UI
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { apiFetch, hasApiUrl } from '@/services/api'
import type { BonusCategory, BonusPromotion, BonusTier } from '@/lib/bonusTypes'

const BONUS_LABEL: Record<BonusCategory, string> = {
  transfer: 'de bônus',
  shopping: 'pts/R$',
  miles: 'na compra',
  cards: 'na oferta',
}

function asDateOnly(value: unknown): string {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : ''
}

export function mapPromoAlertRow(row: Record<string, unknown>): BonusPromotion | null {
  if (!row || typeof row !== 'object') return null
  const category = row.category as BonusCategory
  if (!row.id || !(category in BONUS_LABEL)) return null

  const sourceProgram = typeof row.source_program === 'string' ? row.source_program : null
  const targetProgram = typeof row.target_program === 'string' ? row.target_program : null
  const validUntil = asDateOnly(row.valid_until)
  const tiers = Array.isArray(row.tiers) ? (row.tiers as BonusTier[]) : undefined
  const sourceLinks = Array.isArray(row.source_links)
    ? (row.source_links as { name: string; url: string }[])
    : undefined

  return {
    id: String(row.id),
    category,
    targetProgram: targetProgram ?? sourceProgram ?? 'Programa',
    bonusValue: typeof row.bonus_value === 'string' ? row.bonus_value : '',
    bonusLabel: BONUS_LABEL[category],
    participatingBanks: category === 'transfer' && sourceProgram ? [sourceProgram] : undefined,
    tiers: tiers && tiers.length > 0 ? tiers : undefined,
    expiresAt: validUntil ? `${validUntil}T23:59:00` : undefined,
    isActive: true,
    isHighlight: false,
    ctaUrl: typeof row.cta_url === 'string' && row.cta_url ? row.cta_url : undefined,
    rules: typeof row.details === 'string' && row.details ? row.details : undefined,
    sourceLinks: sourceLinks && sourceLinks.length > 0 ? sourceLinks : undefined,
  }
}

export function isCurrentPromo(promo: BonusPromotion, today = new Date().toISOString().slice(0, 10)): boolean {
  if (!promo.expiresAt) return true
  return promo.expiresAt.slice(0, 10) >= today
}

/** Destaque da Home: a transferência de maior bônus; sem transfer, a primeira promo. */
export function pickHighlightId(promos: BonusPromotion[]): string | null {
  const transfers = promos.filter((p) => p.category === 'transfer')
  if (transfers.length > 0) {
    const best = transfers.reduce((acc, p) =>
      parseFloat(p.bonusValue) > parseFloat(acc.bonusValue) ? p : acc,
    )
    return best.id
  }
  return promos[0]?.id ?? null
}

export async function getActivePromoAlerts(
  options: { signal?: AbortSignal } = {},
): Promise<BonusPromotion[]> {
  let rows: unknown[] = []
  if (hasApiUrl()) {
    rows = await apiFetch<unknown[]>('/api/promo-alerts', { signal: options.signal })
  } else if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('promo_alerts')
      .select(
        'id, category, source_program, target_program, title, bonus_value, bonus_numeric, tiers, valid_from, valid_until, details, cta_url, source_links',
      )
      .order('bonus_numeric', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .abortSignal(options.signal as AbortSignal)
    if (error) throw error
    rows = data ?? []
  }
  return rows
    .map((row) => mapPromoAlertRow(row as Record<string, unknown>))
    .filter((p): p is BonusPromotion => !!p && isCurrentPromo(p))
}
```

Nota: `pickHighlightId` usa `parseFloat(bonusValue)` (não `bonus_numeric`) porque o `BonusPromotion` mapeado não carrega o numérico — `parseFloat('100%')` → `100`. Se algum teste falhar por isso, é aceitável adicionar `bonusNumeric?: number` ao `BonusPromotion` e usar direto (ajustar o teste do Step 2 junto).

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -- src/lib/promo-alerts/service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/bonusTypes.ts src/lib/promo-alerts/service.ts src/lib/promo-alerts/service.test.ts
git commit -m "feat(usuario): service de promo_alerts mapeado pro contrato do hub de bônus"
```

---

### Task 6: Front — hook com TanStack Query + swap dos consumidores + deletar mock

**Files:**
- Rewrite: `src/hooks/useBonusPromotions.ts`
- Test: `src/hooks/useBonusPromotions.test.tsx`
- Modify: `src/lib/bonusUtils.ts`, `src/components/bonus/BonusPromotionsSection.tsx`, `src/pages/BonusOffersScreen.tsx`, `src/pages/BonusOfferDetailScreen.tsx`
- Delete: `src/lib/bonusMockData.ts`

**Interfaces:**
- Consumes: `getActivePromoAlerts`, `pickHighlightId` (Task 5), tipos de `bonusTypes` (Task 5).
- Produces: `useBonusPromotions(category?: BonusCategory)` retornando `{ promotions, highlight, activeCount, expiringToday, loading, error }` — mesma shape de antes + `loading: boolean` + `error: string | null`. As seções `TransferBonusSection`/`ShoppingBonusSection`/`MilesBonusSection`/`CardBonusSection` NÃO mudam (já retornam `null` com lista vazia e só usam `promotions`).

- [ ] **Step 1: Escrever o teste do hook (falhando)**

```tsx
// src/hooks/useBonusPromotions.test.tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useBonusPromotions } from './useBonusPromotions'
import type { BonusPromotion } from '@/lib/bonusTypes'

const mocks = vi.hoisted(() => ({ getActivePromoAlerts: vi.fn() }))

vi.mock('@/lib/promo-alerts/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/promo-alerts/service')>()
  return { ...actual, getActivePromoAlerts: mocks.getActivePromoAlerts }
})

function promo(overrides: Partial<BonusPromotion>): BonusPromotion {
  return {
    id: 'p1',
    category: 'transfer',
    targetProgram: 'Smiles',
    bonusValue: '100%',
    bonusLabel: 'de bônus',
    isActive: true,
    isHighlight: false,
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useBonusPromotions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sai de loading com as promoções e marca o destaque (maior bônus de transferência)', async () => {
    mocks.getActivePromoAlerts.mockResolvedValueOnce([
      promo({ id: 'a', bonusValue: '80%' }),
      promo({ id: 'b', bonusValue: '120%' }),
    ])
    const { result } = renderHook(() => useBonusPromotions(), { wrapper })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeCount).toBe(2)
    expect(result.current.highlight?.id).toBe('b')
    expect(result.current.promotions.find((p) => p.id === 'b')?.isHighlight).toBe(true)
  })

  it('filtra por categoria sem perder o destaque global', async () => {
    mocks.getActivePromoAlerts.mockResolvedValueOnce([
      promo({ id: 'a' }),
      promo({ id: 'c', category: 'miles', bonusValue: '-30%' }),
    ])
    const { result } = renderHook(() => useBonusPromotions('miles'), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.promotions.map((p) => p.id)).toEqual(['c'])
    expect(result.current.highlight?.id).toBe('a')
  })

  it('falha vira mensagem amigável e lista vazia', async () => {
    mocks.getActivePromoAlerts.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useBonusPromotions(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Não foi possível carregar as promoções no momento.')
    expect(result.current.promotions).toEqual([])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/hooks/useBonusPromotions.test.tsx`
Expected: FAIL (hook ainda importa `bonusMockData` e não tem `loading`)

- [ ] **Step 3: Reescrever `src/hooks/useBonusPromotions.ts`**

```ts
// src/hooks/useBonusPromotions.ts
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getActivePromoAlerts, pickHighlightId } from '@/lib/promo-alerts/service'
import type { BonusCategory, BonusPromotion } from '@/lib/bonusTypes'
import { isExpiringToday } from '@/lib/bonusUtils'

const LOAD_ERROR_MESSAGE = 'Não foi possível carregar as promoções no momento.'

export function useBonusPromotions(category?: BonusCategory): {
  promotions: BonusPromotion[]
  highlight: BonusPromotion | null
  activeCount: number
  expiringToday: number
  loading: boolean
  error: string | null
} {
  const { data, isPending, isError } = useQuery({
    queryKey: ['promo-alerts'],
    queryFn: ({ signal }) => getActivePromoAlerts({ signal }),
  })

  const withHighlight = useMemo(() => {
    const all = data ?? []
    const highlightId = pickHighlightId(all)
    return all.map((p) => (p.id === highlightId ? { ...p, isHighlight: true } : p))
  }, [data])

  const promotions = useMemo(
    () => (category ? withHighlight.filter((p) => p.category === category) : withHighlight),
    [withHighlight, category],
  )

  // highlight é global de propósito (ignora categoria) — só a Home consome sem argumento.
  const highlight = useMemo(() => withHighlight.find((p) => p.isHighlight) ?? null, [withHighlight])

  const expiringToday = useMemo(
    () => promotions.filter((p) => isExpiringToday(p.expiresAt)).length,
    [promotions],
  )

  return {
    promotions,
    highlight,
    activeCount: promotions.length,
    expiringToday,
    loading: isPending,
    error: isError ? LOAD_ERROR_MESSAGE : null,
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/hooks/useBonusPromotions.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Migrar os imports e deletar o mock**

1. `src/lib/bonusUtils.ts` linha 2: `import { BonusCategory } from '@/lib/bonusMockData'` → `from '@/lib/bonusTypes'`.
2. `src/components/bonus/BonusPromotionsSection.tsx` linha 5: importar `BONUS_PROMOTIONS_SOURCE_NOTICE, BonusPromotion` de `'@/lib/bonusTypes'`. No corpo, adicionar guarda de loading/vazio logo após o hook (linha ~46):
```tsx
const { promotions, highlight, activeCount, expiringToday, loading } = useBonusPromotions()
if (loading || promotions.length === 0) return null
```
3. `src/pages/BonusOffersScreen.tsx` linha 5: importar de `'@/lib/bonusTypes'`. Adicionar `loading` ao destructuring (linha 23) e, dentro do `<div className="px-5 pt-2 pb-24">`, antes do aviso, renderizar estado de carregamento/vazio:
```tsx
{loading && (
  <p className="py-10 text-center text-sm text-nubank-text-secondary">Carregando promoções…</p>
)}
{!loading && activeCount === 0 && (
  <p className="py-10 text-center text-sm text-nubank-text-secondary">
    Nenhuma promoção ativa no momento. Volte em breve!
  </p>
)}
```
(As 4 seções continuam renderizadas abaixo — cada uma já retorna `null` quando vazia.)
4. `src/pages/BonusOfferDetailScreen.tsx`: remover o import de `BONUS_PROMOTIONS` (linhas 5–10 → importar `BONUS_PROMOTIONS_SOURCE_NOTICE, BonusCategory, BonusPromotion` de `'@/lib/bonusTypes'`); trocar a busca (linha 48):
```tsx
const { promotions, loading } = useBonusPromotions()
const promo = promotions.find((p) => p.id === id)

if (loading) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-nubank-bg">
      <p className="text-sm text-nubank-text-secondary">Carregando…</p>
    </div>
  )
}
```
(adicionar `import { useBonusPromotions } from '@/hooks/useBonusPromotions'`; manter o bloco "não encontrada" existente). No tab Regras, após o parágrafo de `promo.rules`, listar as fontes quando existirem:
```tsx
{promo.sourceLinks && promo.sourceLinks.length > 0 && (
  <p className="mt-3 text-[12px] text-nubank-text-secondary">
    Fontes:{' '}
    {promo.sourceLinks.map((s, i) => (
      <Fragment key={s.url}>
        {i > 0 && ' · '}
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
          {s.name}
        </a>
      </Fragment>
    ))}
  </p>
)}
```
5. Deletar `src/lib/bonusMockData.ts`:
```bash
git rm src/lib/bonusMockData.ts
```
6. Conferir que nada mais importa o mock:
```bash
grep -rn "bonusMockData" src/   # esperado: nenhum resultado
```

- [ ] **Step 6: Gates completos**

```bash
npx tsc -b        # esperado: sem erros
npm test          # esperado: suíte toda verde
npm run build     # esperado: build ok
```

- [ ] **Step 7: Commit**

```bash
git add -A src/
git commit -m "feat(usuario): hub de bônus lê promo_alerts reais (fim do mock) com TanStack Query"
```

---

### Task 7: n8n — workflow `gm-promo-ingest` (RSS → LLM → upsert → curadoria)

**Files:**
- Create: `scripts/n8n/push-workflow.mjs`
- Create: `scripts/n8n/gm-promo-ingest.workflow.json`

**Interfaces:**
- Consumes: tabelas da Task 1; rota `GET /api/agent/promo-message/:id` (Task 4, JÁ DEPLOYADA — ver Task 9; em dev dá pra apontar pro deploy de preview); credenciais n8n existentes `CRED_POSTGRES_AGENTE` (Ucn1qbvcmYC4XHpa), `CRED_EVOLUTION_HEADER` (qzR4JN04NUY3GPeQ), `CRED_RESUMO_APIKEY` (8JJba9f768EANZ33, header x-api-key=AGENT_API_KEY); credencial NOVA `CRED_ANTHROPIC` (httpHeaderAuth, name `x-api-key`, value = ANTHROPIC_API_KEY do owner, `allowedDomains: api.anthropic.com`).
- Produces: workflow ativo que popula `promo_alerts` e envia cards de curadoria pro grupo interno (`agent_tenants.grupo_interno_jid`, tenant id 3).

**Pré-requisitos (owner):** criar `ANTHROPIC_API_KEY` no console Anthropic. `N8N_API_KEY`/`N8N_URL` vivem em `C:\Users\rick_\Downloads\rickrabelo-viagens-ig\tools\secrets.local.json` (nunca imprimir).

- [ ] **Step 1: Criar `scripts/n8n/push-workflow.mjs`**

```js
// scripts/n8n/push-workflow.mjs — cria/atualiza workflow no n8n da casa.
// Uso: node scripts/n8n/push-workflow.mjs <arquivo.workflow.json> [workflowId]
import { readFileSync } from 'node:fs'

const SECRETS = 'C:/Users/rick_/Downloads/rickrabelo-viagens-ig/tools/secrets.local.json'
const { N8N_API_KEY, N8N_URL } = JSON.parse(readFileSync(SECRETS, 'utf8'))
const [, , file, workflowId] = process.argv
if (!file) {
  console.error('uso: node scripts/n8n/push-workflow.mjs <arquivo.workflow.json> [workflowId]')
  process.exit(1)
}
const wf = JSON.parse(readFileSync(file, 'utf8'))
const base = `${N8N_URL.replace(/\/$/, '')}/api/v1/workflows`
const res = await fetch(workflowId ? `${base}/${workflowId}` : base, {
  method: workflowId ? 'PUT' : 'POST',
  headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings ?? {} }),
})
const body = await res.json()
if (!res.ok) {
  console.error('n8n respondeu', res.status, JSON.stringify(body).slice(0, 500))
  process.exit(1)
}
console.log(`ok: workflow ${body.id} (${body.name})`)
```

- [ ] **Step 2: Criar a credencial `CRED_ANTHROPIC` no n8n**

Via API do n8n (mesma receita da Fase C — httpHeaderAuth exige `allowedDomains`), com um script one-off ou workflow temporário:
```js
// POST {N8N_URL}/api/v1/credentials  (header X-N8N-API-KEY)
{
  "name": "CRED_ANTHROPIC",
  "type": "httpHeaderAuth",
  "data": { "name": "x-api-key", "value": "<ANTHROPIC_API_KEY do owner>", "allowedDomains": "api.anthropic.com" }
}
```
Anotar o id retornado e substituir `CRED_ANTHROPIC_ID` no JSON do workflow (Step 3).

- [ ] **Step 3: Montar `scripts/n8n/gm-promo-ingest.workflow.json`**

Workflow `gm-promo-ingest`, nodes e ligações (sequência linear salvo onde indicado). Conteúdo integral dos campos críticos abaixo — montar o JSON com `nodes[]`/`connections{}` padrão n8n (posições livres), `settings: { "executionOrder": "v1", "timezone": "America/Sao_Paulo" }`:

1. **`gmpi-cron`** — `n8n-nodes-base.scheduleTrigger`: intervalo a cada 15 minutos.
2. **`gmpi-feeds`** — `n8n-nodes-base.code`, mode `runOnceForAllItems`:
```js
// Fontes fase 1 (spec 2026-07-11). Passageiro de Primeira FORA por decisão do owner.
return [
  { json: { source: 'melhorescartoes', url: 'https://www.melhorescartoes.com.br/c/promocoes-milhas/feed/' } },
  { json: { source: 'pontospravoar', url: 'https://pontospravoar.com/category/promocoes/feed/' } },
  { json: { source: 'melhoresdestinos', url: 'https://www.melhoresdestinos.com.br/milhas/feed' } },
]
```
3. **`gmpi-rss`** — `n8n-nodes-base.rssFeedRead`: URL `={{ $json.url }}`. (`onError: continueRegularOutput` pra feed fora do ar não travar os demais.)
4. **`gmpi-normalize`** — `n8n-nodes-base.code`, mode `runOnceForEachItem`:
```js
// RSS item -> shape estável. source vem do node gmpi-feeds via pairedItem.
const src = $('gmpi-feeds').item.json.source
const j = $json
const externalId = (j.guid || j.link || '').toString().slice(0, 500)
if (!externalId) return null // item sem id rastreável: ignora
const content = (j['content:encoded'] || j.content || j.contentSnippet || '')
  .toString()
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .slice(0, 6000)
return {
  json: {
    source: src,
    external_id: externalId,
    title: (j.title || '').toString().slice(0, 300),
    link: (j.link || '').toString(),
    content,
    pub_date: (j.pubDate || j.isoDate || '').toString(),
  },
}
```
5. **`gmpi-unseen`** — `n8n-nodes-base.postgres` (credencial `CRED_POSTGRES_AGENTE`), operation `executeQuery`. O `on conflict do nothing returning` filtra sozinho: item já visto não devolve linha e morre aqui.
```sql
insert into public.promo_ingest_seen (source, external_id)
values ($1, $2)
on conflict do nothing
returning source, external_id;
```
Query params como **expressão-array única** (split por vírgula quebraria valores com vírgula): `={{ [$json.source, $json.external_id] }}`.
6. **`gmpi-extract`** — `n8n-nodes-base.httpRequest` (credencial `CRED_ANTHROPIC`, id `CRED_ANTHROPIC_ID`): POST `https://api.anthropic.com/v1/messages`, header extra `anthropic-version: 2023-06-01`, **`retryOnFail: true` com 2 tentativas** (cobre o "1 retry" do spec pra falha de API; JSON inválido do LLM cai no `parse_error` do `gmpi-parse` e fica visível no log de execução do n8n), body JSON:
```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 1024,
  "system": "<PROMPT ABAIXO>",
  "messages": [{ "role": "user", "content": "={{ 'TÍTULO: ' + $('gmpi-normalize').item.json.title + '\\nLINK: ' + $('gmpi-normalize').item.json.link + '\\nDATA: ' + $('gmpi-normalize').item.json.pub_date + '\\nCONTEÚDO: ' + $('gmpi-normalize').item.json.content }}" }]
}
```
Prompt de sistema (colar literal no campo `system`, com `{{HOJE}}` trocado por expressão `={{ $now.toFormat('yyyy-MM-dd') }}` concatenada):
```
Você extrai promoções de milhas/pontos de posts de blogs brasileiros. Hoje é {{HOJE}}. Responda APENAS com um objeto JSON válido, sem markdown, sem texto fora do JSON, com estas chaves:
is_promo (bool): true só se o post anuncia uma promoção acionável de programa de fidelidade (bônus de transferência, compra de pontos/milhas com desconto ou bônus, pontos por real em loja/portal, oferta de cartão). Passagem aérea promocional de rota específica, notícia, análise ou guia => false.
category: "transfer" | "shopping" | "miles" | "cards".
source_program: origem dos pontos (banco/programa, ex. "Livelo", "Esfera", "Itaú") ou null.
target_program: destino (ex. "Smiles", "LATAM Pass", "Azul Fidelidade") ou null.
title: manchete própria, factual, máx 70 caracteres, pt-BR. NUNCA copie frases do post.
bonus_value: ex. "100%", "10 pts/R$", "-30%".
bonus_numeric: número comparável (100, 10, 30) ou null.
tiers: [{"label","value","isBest"}] quando o bônus varia por perfil/clube, senão null.
valid_from, valid_until: "YYYY-MM-DD" ou null (não invente datas).
details: regras essenciais em texto próprio, máx 400 caracteres.
cta_url: URL da promoção NO SITE DO PROGRAMA se citada no post, senão null.
confidence: 0 a 1 (quão certo você está de que os campos refletem o post).
```
7. **`gmpi-parse`** — `n8n-nodes-base.code`, mode `runOnceForEachItem`:
```js
// Valida o JSON do LLM e calcula a chave canônica (determinística, fora do LLM).
const norm = $('gmpi-normalize').item.json
let out
try {
  const text = $json.content?.[0]?.text ?? ''
  out = JSON.parse(text.replace(/^[\s`]*json/i, '').replace(/`+/g, '').trim())
} catch (e) {
  return { json: { is_promo: false, parse_error: true, source: norm.source, link: norm.link } }
}
const CATS = ['transfer', 'shopping', 'miles', 'cards']
if (!out || out.is_promo !== true || !CATS.includes(out.category) || !out.title) {
  return { json: { is_promo: false, source: norm.source, link: norm.link } }
}
const slug = (s) => (s || 'x').toString().toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')
const canonicalKey = [
  out.category,
  slug(out.source_program) + '>' + slug(out.target_program),
  out.bonus_numeric ?? slug(out.bonus_value),
  out.valid_until || 'sem-data',
].join(':')
return {
  json: {
    is_promo: true,
    ...out,
    canonical_key: canonicalKey,
    source_name:
      { melhorescartoes: 'Melhores Cartões', pontospravoar: 'Pontos pra Voar', melhoresdestinos: 'Melhores Destinos' }[norm.source] || norm.source,
    source_url: norm.link,
    raw_title: norm.title,
  },
}
```
8. **`gmpi-is-promo`** — `n8n-nodes-base.if`: condição boolean `={{ $json.is_promo }}` é `true` E `={{ ($json.confidence ?? 0) >= 0.5 }}`. Branch false: termina.
9. **`gmpi-upsert`** — `n8n-nodes-base.postgres` (`CRED_POSTGRES_AGENTE`), `executeQuery`:
```sql
insert into public.promo_alerts
  (category, source_program, target_program, title, bonus_value, bonus_numeric,
   tiers, valid_from, valid_until, details, cta_url, source_links, canonical_key, confidence, raw)
values
  ($1, $2, $3, $4, $5, $6, $7::jsonb, nullif($8,'')::date, nullif($9,'')::date, $10, $11,
   jsonb_build_array(jsonb_build_object('name', $12::text, 'url', $13::text)), $14, $15, $16::jsonb)
on conflict (canonical_key) do update set
  source_links = (
    select jsonb_agg(distinct e) from jsonb_array_elements(
      promo_alerts.source_links || excluded.source_links
    ) as e
  ),
  updated_at = now()
returning id, status, (xmax = 0) as is_new;
```
Query params como **expressão-array única** (obrigatório: `JSON.stringify` gera vírgulas que quebrariam o split):
```
={{ [$json.category, $json.source_program, $json.target_program, $json.title, $json.bonus_value, $json.bonus_numeric, JSON.stringify($json.tiers ?? null), $json.valid_from || '', $json.valid_until || '', $json.details, $json.cta_url, $json.source_name, $json.source_url, $json.canonical_key, $json.confidence, JSON.stringify($json)] }}
```
10. **`gmpi-only-new`** — `n8n-nodes-base.if`: `={{ $json.is_new }}` é `true` E `={{ $json.status }}` igual a `pending` (repost de promo já moderada não repete card).
11. **`gmpi-message`** — `n8n-nodes-base.httpRequest` (credencial `CRED_RESUMO_APIKEY`): GET `https://gest-miles-usuario-front-slzj.vercel.app/api/agent/promo-message/{{ $json.id }}`. Devolve `{ message }`.
12. **`gmpi-tenant`** — `n8n-nodes-base.postgres` (`CRED_POSTGRES_AGENTE`), `executeQuery`:
```sql
select grupo_interno_jid, instance from public.agent_tenants where id = 3;
```
13. **`gmpi-notify`** — `n8n-nodes-base.httpRequest` (credencial `CRED_EVOLUTION_HEADER`): POST `https://evolution.gestmiles.com.br/message/sendText/{{ $json.instance }}`, body JSON:
```json
{ "number": "={{ $json.grupo_interno_jid }}", "text": "={{ $('gmpi-message').item.json.message }}" }
```

- [ ] **Step 4: Push e teste manual controlado**

```bash
node scripts/n8n/push-workflow.mjs scripts/n8n/gm-promo-ingest.workflow.json
```
Executar o workflow 1× manualmente (Execute Workflow na UI do n8n ou via API). Verificar:
1. `select source, count(*) from promo_ingest_seen group by source;` → linhas pros 3 feeds.
2. `select id, category, title, bonus_value, status, confidence from promo_alerts order by created_at desc limit 20;` → promoções `pending` com campos coerentes.
3. Cards chegaram no Grupo Teste (owner confere no WhatsApp).
4. Clicar "Aprovar" num card → página de confirmação → botão → `status='approved'` no banco.
5. Rodar o workflow de novo → nenhum item reprocessado (dedup funcionando), nenhum card repetido.
6. **Golden set do prompt (spec, seção Testes):** salvar 5–10 itens reais desta execução (título+conteúdo normalizado do `gmpi-normalize` + JSON extraído do `gmpi-parse`) em `scripts/n8n/fixtures/promo-extract-golden.json` — referência manual pra reavaliar o prompt quando for ajustado. Commitar junto no Step 5.

- [ ] **Step 5: Ativar o workflow (cron 15min) e commitar**

Ativar via UI/API. Depois:
```bash
git add scripts/n8n/push-workflow.mjs scripts/n8n/gm-promo-ingest.workflow.json
git commit -m "feat(usuario): workflow n8n gm-promo-ingest (RSS -> Haiku -> promo_alerts -> curadoria WhatsApp)"
```

---

### Task 8: n8n — workflow `gm-promo-housekeeping` (expiração + monitor de silêncio)

**Files:**
- Create: `scripts/n8n/gm-promo-housekeeping.workflow.json`

**Interfaces:**
- Consumes: tabelas da Task 1, credenciais `CRED_POSTGRES_AGENTE` e `CRED_EVOLUTION_HEADER`, `agent_tenants` id 3.
- Produces: workflow diário (09:00 América/São_Paulo) que expira promoções vencidas e alerta fontes silenciosas / fila de curadoria parada.

- [ ] **Step 1: Montar o workflow**

1. **`gmph-cron`** — scheduleTrigger: diário 09:00 (timezone America/Sao_Paulo nas settings).
2. **`gmph-expire`** — postgres executeQuery:
```sql
update public.promo_alerts
set status = 'expired', updated_at = now()
where status in ('pending', 'approved')
  and valid_until is not null
  and valid_until < current_date;
```
3. **`gmph-health`** — postgres executeQuery (sempre roda após o expire):
```sql
select
  coalesce((
    select string_agg(s.source || ' (último item ' || to_char(s.last_seen, 'DD/MM HH24:MI') || ')', ', ')
    from (
      select source, max(seen_at) as last_seen
      from public.promo_ingest_seen
      group by source
      having max(seen_at) < now() - interval '48 hours'
    ) s
  ), '') as silent_sources,
  (select count(*) from public.promo_alerts
    where status = 'pending' and created_at < now() - interval '24 hours') as stale_pending;
```
4. **`gmph-needs-alert`** — if: `={{ $json.silent_sources !== '' || Number($json.stale_pending) > 0 }}`.
5. **`gmph-msg`** — code (runOnceForEachItem):
```js
const lines = ['🩺 *Saúde do radar de promoções*']
if ($json.silent_sources) lines.push(`⚠️ Fontes silenciosas há 48h+: ${$json.silent_sources}`)
if (Number($json.stale_pending) > 0) lines.push(`⏳ ${$json.stale_pending} promoção(ões) aguardando curadoria há 24h+`)
return { json: { text: lines.join('\n') } }
```
6. **`gmph-tenant`** — postgres: `select grupo_interno_jid, instance from public.agent_tenants where id = 3;`
7. **`gmph-notify`** — httpRequest Evolution (mesmo shape do `gmpi-notify`), `text` = `={{ $('gmph-msg').item.json.text }}`.

- [ ] **Step 2: Push, teste manual, ativar**

```bash
node scripts/n8n/push-workflow.mjs scripts/n8n/gm-promo-housekeeping.workflow.json
```
Teste: inserir via MCP uma promo `approved` com `valid_until = current_date - 1` → executar o workflow → virou `expired`; com as fontes recém-ingeridas não deve haver alerta de silêncio (ou seja: branch do if não dispara). Ativar o cron. Apagar a promo de teste.

- [ ] **Step 3: Commit**

```bash
git add scripts/n8n/gm-promo-housekeeping.workflow.json
git commit -m "feat(usuario): workflow n8n gm-promo-housekeeping (expiração + monitor de fontes)"
```

---

### Task 9: Deploy do backend + envs de produção + smoke

**Files:** nenhum (operacional).

**Interfaces:**
- Consumes: rotas da Task 4.
- Produces: BFF de produção servindo `/api/promo-alerts` e moderação — pré-requisito real do fluxo de curadoria (Task 7 Step 4 já usa a URL pública).

> Ordem prática: executar esta task ANTES do teste E2E da Task 7 Step 4 (os links de moderação apontam pra URL pública). As Tasks 7–8 podem ser montadas antes; só o teste depende do deploy.

- [ ] **Step 1: Gerar e configurar segredos**

```bash
openssl rand -hex 32   # PROMO_MODERATION_SECRET
```
No projeto Vercel do backend (Root Directory `backend`): adicionar `PROMO_MODERATION_SECRET` e `PUBLIC_API_URL=https://gest-miles-usuario-front-slzj.vercel.app` (Production). Receita de deploy CLI por worktree: memória `usuario-status-next-steps`.

- [ ] **Step 2: Deploy e smoke de produção**

```bash
curl -s https://gest-miles-usuario-front-slzj.vercel.app/api/promo-alerts                                   # []
curl -s -o /dev/null -w "%{http_code}" "https://gest-miles-usuario-front-slzj.vercel.app/api/promo-alerts/moderate/abc?action=approve&token=x"   # 401
curl -s -o /dev/null -w "%{http_code}" https://gest-miles-usuario-front-slzj.vercel.app/api/agent/promo-message/abc                              # 401
```

---

### Task 10: E2E real, PR e follow-ups

- [ ] **Step 1: E2E completo com dado real**

Com os workflows ativos e o backend no ar: aguardar (ou forçar com Execute) uma ingestão real → card no Grupo Teste → owner (ou eu, com o link) aprova → promoção aparece no hub `/bonus-offers` do app (dev `npm run dev:all` e/ou produção após deploy do front). Conferir Home (destaque + lista), tela cheia e detalhe (fontes no tab Regras).

- [ ] **Step 2: Gates finais + PR**

```bash
npx tsc -b && npm test && npm run build
git push -u origin feat/promocoes-automaticas
gh pr create --title "feat(usuario): promoções automáticas fase 1 — RSS -> curadoria -> hub real" --body "<resumo + link do spec + evidência dos gates>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 3: Registrar follow-ups (não implementar)**

No PR e na memória: (a) **sync manager** — o Index do manager renderiza fork das telas de cliente; replicar o swap lá (regra do owner); (b) linhas-demo de `bonus_offers` (`example.com`) continuam na tabela — decidir desativação junto com o sync do manager; (c) fase 2 (Telegram Esfera/Livelo + IMAP) e fase 3 (personalização) conforme spec; (d) trocar Grupo Teste pelo grupo interno real quando o owner criar (1 UPDATE em `agent_tenants`, follow-up herdado da Fase C).
