# Onboarding de grupos WhatsApp (Fase follow-up 3-B) — Implementation Plan

> **For agentic workers:** Tasks 1-2 são backend testável (node:test, TDD). Task 3 é CONTROLLER (n8n vivo + deploy + coordena o piloto operacional). Steps em checkbox.

**Goal:** Descobrir os grupos de WhatsApp que o bot está (Evolution) e auto-mapear cada grupo ao cliente pelo nome (match único), populando `agent_grupos`/`agent_vinculos` pra o alerta direto da 3-B alcançar os clientes; reportar os incertos no grupo interno.

**Architecture:** n8n (`fetchAllGroups` + envio) → rota BFF testável `/api/agent/group-onboarding` (match + upsert via service role). Lógica de match numa lib pura (`groupClientMatch.js`) com Vitest/node:test.

**Tech Stack:** Express (backend), `node:test` (backend tests), n8n, Evolution API, Supabase service role.

## Global Constraints

- **Match:** nome do cliente (normalizado) contido, com **borda de palavra**, no nome do grupo (normalizado). Auto-mapeia só com **1** candidato; 0 ou >1 → revisão. Nomes da equipe piloto são únicos (444/444).
- **Normalização:** minúsculo, sem acento (NFD + strip diacrítico), `[^a-z0-9 ]`→espaço, colapsa espaços, trim.
- **Idempotente:** grupo por `grupo_jid` (select-then-insert, sem depender de unique); vínculo só se ainda não há vínculo de cliente no grupo.
- **`participante_jid`:** jid derivado de `numero_telefone` (`55`+dígitos+`@s.whatsapp.net`) quando conhecido, senão sentinela `onboarding-pending`. Constraint `UNIQUE(grupo_id, participante_jid)` acomoda (1 cliente/grupo).
- **Auth da rota:** `x-api-key === AGENT_API_KEY` (`agentKeyStatus`), padrão das rotas de agente.
- **Tenant piloto:** `agent_tenants` id 3, equipe `fd6f3039`, instance `gestmiles_qr`, `grupo_interno_jid` = Grupo Teste. Evolution credencial `CRED_EVOLUTION_HEADER` (id `qzR4JN04NUY3GPeQ`).
- **Backend tests:** `node:test` (`import { test } from "node:test"; import assert from "node:assert/strict"`), rodar `cd backend && node --test`.
- **Gates:** `npx tsc -b` (raiz) + `npm test` (raiz) + `cd backend && node --test` + `npm run build`.
- **Não commitar** `CLAUDE.md`/`.claude/settings.local.json`/`backend/.gitignore`.

---

### Task 1: lib `groupClientMatch` (normalização + match + plano)

**Files:**
- Create: `backend/src/lib/groupClientMatch.js`
- Test: `backend/src/lib/groupClientMatch.test.js`

**Interfaces:**
- Produces:
  - `normalizeNome(text): string`
  - `matchGroupsToClients(groups, clients): Array<{jid, nome, candidatos: Array<{cliente_id, nome}>}>` — `groups:[{jid,nome}]`, `clients:[{cliente_id,nome}]`.
  - `planOnboarding(groups, clients, alreadyMappedJids=[]): { autoMap:[{jid,nome,cliente_id,cliente_nome}], revisar:[{jid,nome,candidatos:string[]}], jaMapeados:number, descobertos:number }`

- [ ] **Step 1: Write the failing test**

`backend/src/lib/groupClientMatch.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeNome, matchGroupsToClients, planOnboarding } from "./groupClientMatch.js";

test("normalizeNome: acento, pontuação, espaços", () => {
  assert.equal(normalizeNome("Fulano Silva - Gestão!"), "fulano silva gestao");
  assert.equal(normalizeNome("  ÁÉÍ  óç  "), "aei oc");
  assert.equal(normalizeNome(null), "");
});

test("match: nome contido com borda de palavra", () => {
  const clients = [
    { cliente_id: "a", nome: "Fulano Silva" },
    { cliente_id: "b", nome: "Ana" },
  ];
  const r = matchGroupsToClients(
    [
      { jid: "g1", nome: "Fulano Silva - GestMiles" },
      { jid: "g2", nome: "Analeide Souza" }, // NÃO casa "Ana" (borda de palavra)
    ],
    clients,
  );
  assert.deepEqual(r[0].candidatos.map((c) => c.cliente_id), ["a"]);
  assert.deepEqual(r[1].candidatos, []);
});

test("planOnboarding: único auto-mapeia, 0/>1 vai pra revisar, jaMapeados", () => {
  const clients = [
    { cliente_id: "a", nome: "Fulano Silva" },
    { cliente_id: "b", nome: "Fulano" }, // contido em "Fulano Silva ..." => ambiguidade
  ];
  const groups = [
    { jid: "g1", nome: "Fulano Silva - GestMiles" }, // casa a e b => revisar
    { jid: "g2", nome: "Beltrano Souza" }, // 0 => revisar
    { jid: "g3", nome: "Fulano Silva já mapeado" },
  ];
  const plan = planOnboarding(groups, clients, ["g3"]);
  assert.equal(plan.descobertos, 3);
  assert.equal(plan.jaMapeados, 1);
  assert.equal(plan.autoMap.length, 0);
  assert.equal(plan.revisar.length, 2);
});

test("planOnboarding: match único auto-mapeia", () => {
  const plan = planOnboarding(
    [{ jid: "g1", nome: "Fulano Silva - GestMiles" }],
    [{ cliente_id: "a", nome: "Fulano Silva" }],
  );
  assert.equal(plan.autoMap.length, 1);
  assert.equal(plan.autoMap[0].cliente_id, "a");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/lib/groupClientMatch.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Write minimal implementation**

`backend/src/lib/groupClientMatch.js`:

```js
// Matching de grupo WhatsApp -> cliente por nome contido (borda de palavra).
// Puro e testável; a rota /api/agent/group-onboarding consome.

export function normalizeNome(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contidoComBorda(clienteNorm, grupoNorm) {
  if (!clienteNorm) return false;
  return (" " + grupoNorm + " ").includes(" " + clienteNorm + " ");
}

export function matchGroupsToClients(groups, clients) {
  const norm = clients
    .map((c) => ({ cliente_id: c.cliente_id, nome: c.nome, _n: normalizeNome(c.nome) }))
    .filter((c) => c._n);
  return groups.map((g) => {
    const gn = normalizeNome(g.nome);
    const candidatos = norm
      .filter((c) => contidoComBorda(c._n, gn))
      .map((c) => ({ cliente_id: c.cliente_id, nome: c.nome }));
    return { jid: g.jid, nome: g.nome, candidatos };
  });
}

export function planOnboarding(groups, clients, alreadyMappedJids = []) {
  const mapped = new Set(alreadyMappedJids);
  const matched = matchGroupsToClients(groups, clients);
  const autoMap = [];
  const revisar = [];
  let jaMapeados = 0;
  for (const g of matched) {
    if (mapped.has(g.jid)) {
      jaMapeados++;
      continue;
    }
    if (g.candidatos.length === 1) {
      autoMap.push({ jid: g.jid, nome: g.nome, cliente_id: g.candidatos[0].cliente_id, cliente_nome: g.candidatos[0].nome });
    } else {
      revisar.push({ jid: g.jid, nome: g.nome, candidatos: g.candidatos.map((c) => c.nome) });
    }
  }
  return { autoMap, revisar, jaMapeados, descobertos: groups.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test src/lib/groupClientMatch.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/groupClientMatch.js backend/src/lib/groupClientMatch.test.js
git commit -m "feat(backend): lib de match grupo WhatsApp -> cliente por nome (onboarding)"
```

---

### Task 2: rota `POST /api/agent/group-onboarding` + mount

**Files:**
- Create: `backend/src/routes/groupOnboarding.js`
- Modify: `backend/src/index.js` (mount, junto das outras rotas de agente ~linha 109-111)
- Test: `backend/src/routes/groupOnboarding.test.js`

**Interfaces:**
- Consumes: `planOnboarding`/`normalizeNome` (Task 1); `agentKeyStatus`, `assertSupabaseService`, `serverError`.
- Produces: rota que recebe `{ tenant_id, groups:[{jid,nome,size?}] }` → `{ descobertos, auto_mapeados, ja_mapeados, revisar:[{grupo,candidatos}] }`.

- [ ] **Step 1: Write the route** (não-TDD puro por depender de I/O; a lógica testável está na Task 1; aqui teste de auth + orquestração com mock)

`backend/src/routes/groupOnboarding.js`:

```js
import { Router } from "express";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { serverError } from "../lib/httpError.js";
import { agentKeyStatus } from "../lib/agentAuth.js";
import { planOnboarding } from "../lib/groupClientMatch.js";

const router = Router();

function jidFromTelefone(numeroTelefone) {
  const d = String(numeroTelefone ?? "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 13) return null;
  const withCc = d.startsWith("55") ? d : "55" + d;
  return withCc + "@s.whatsapp.net";
}

/**
 * POST /api/agent/group-onboarding — server-to-server (n8n gm-grupo-onboarding).
 * Auth: x-api-key === AGENT_API_KEY. Descobre/upserta grupos, auto-mapeia por nome.
 */
router.post("/group-onboarding", async (req, res) => {
  try {
    const keyStatus = agentKeyStatus(req.get("x-api-key"), process.env.AGENT_API_KEY);
    if (keyStatus === "missing_env") return res.status(503).json({ error: "AGENT_API_KEY não configurada no servidor." });
    if (keyStatus === "mismatch") return res.status(401).json({ error: "API key inválida." });

    const tenantId = Number(req.body?.tenant_id);
    const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
    if (!tenantId || groups.length === 0) return res.status(400).json({ error: "tenant_id e groups são obrigatórios." });

    const supabase = assertSupabaseService();

    const { data: tenant, error: tErr } = await supabase
      .from("agent_tenants").select("id, equipe_id").eq("id", tenantId).maybeSingle();
    if (tErr) return serverError(res, "Erro ao ler tenant", tErr, "[group-onboarding]");
    if (!tenant?.equipe_id) return res.status(404).json({ error: "tenant sem equipe." });

    // 1) upsert grupos (idempotente por grupo_jid): lê os existentes, insere os novos.
    const jids = groups.map((g) => g.jid);
    const { data: existentes, error: gErr } = await supabase
      .from("agent_grupos").select("id, grupo_jid").eq("tenant_id", tenantId).in("grupo_jid", jids);
    if (gErr) return serverError(res, "Erro ao ler grupos", gErr, "[group-onboarding]");
    const byJid = new Map((existentes ?? []).map((g) => [g.grupo_jid, g.id]));
    const novos = groups.filter((g) => !byJid.has(g.jid))
      .map((g) => ({ tenant_id: tenantId, grupo_jid: g.jid, descricao: g.nome, ativo: true }));
    if (novos.length > 0) {
      const { data: inseridos, error: insErr } = await supabase
        .from("agent_grupos").insert(novos).select("id, grupo_jid");
      if (insErr) return serverError(res, "Erro ao inserir grupos", insErr, "[group-onboarding]");
      for (const g of inseridos ?? []) byJid.set(g.grupo_jid, g.id);
    }

    // 2) clientes da equipe + telefones
    const { data: perfis, error: pErr } = await supabase
      .from("perfis").select("usuario_id, nome, nome_completo, numero_telefone").eq("equipe_id", tenant.equipe_id).limit(2000);
    if (pErr) return serverError(res, "Erro ao ler perfis", pErr, "[group-onboarding]");
    const clients = (perfis ?? []).map((p) => ({ cliente_id: p.usuario_id, nome: (p.nome ?? "").trim() || p.nome_completo || "" }));
    const telById = new Map((perfis ?? []).map((p) => [p.usuario_id, p.numero_telefone]));

    // 3) grupos que já têm vínculo de cliente (não remapeia)
    const grupoIds = groups.map((g) => byJid.get(g.jid)).filter(Boolean);
    const { data: vinc, error: vErr } = await supabase
      .from("agent_vinculos").select("grupo_id").eq("tipo", "cliente").not("cliente_id", "is", null).in("grupo_id", grupoIds);
    if (vErr) return serverError(res, "Erro ao ler vínculos", vErr, "[group-onboarding]");
    const mappedGrupoIds = new Set((vinc ?? []).map((v) => v.grupo_id));
    const alreadyMappedJids = groups.filter((g) => mappedGrupoIds.has(byJid.get(g.jid))).map((g) => g.jid);

    // 4) plano de match (puro)
    const plan = planOnboarding(groups, clients, alreadyMappedJids);

    // 5) insere os auto-mapeados
    const toInsert = plan.autoMap.map((m) => ({
      grupo_id: byJid.get(m.jid),
      cliente_id: m.cliente_id,
      tipo: "cliente",
      nome_exibicao: m.cliente_nome,
      participante_jid: jidFromTelefone(telById.get(m.cliente_id)) ?? "onboarding-pending",
      ativo: true,
    }));
    if (toInsert.length > 0) {
      const { error: aErr } = await supabase.from("agent_vinculos").insert(toInsert);
      if (aErr) return serverError(res, "Erro ao criar vínculos", aErr, "[group-onboarding]");
    }

    return res.json({
      descobertos: plan.descobertos,
      auto_mapeados: plan.autoMap.length,
      ja_mapeados: plan.jaMapeados,
      revisar: plan.revisar.map((r) => ({ grupo: r.nome, candidatos: r.candidatos })),
    });
  } catch (err) {
    return serverError(res, "Erro no onboarding de grupos", err, "[group-onboarding]");
  }
});

export default router;
```

- [ ] **Step 2: Mount no `index.js`**

Em `backend/src/index.js`, junto das rotas de agente (após `routes.use("/api/agent", agentPromoRoutes);`):

```js
import groupOnboardingRoutes from "./routes/groupOnboarding.js";
// ...
routes.use("/api/agent", groupOnboardingRoutes);
```

- [ ] **Step 3: Write the route test** (auth + validação de input — padrão app-listen-fetch da casa, `backend/src/index.cors.test.js`)

A orquestração de DB (upsert/insert) é coberta pela lib pura (Task 1, `planOnboarding`) + o E2E real (Task 3). O teste da rota cobre o que roda ANTES do DB: auth + 400. Sem `supertest` (não é dep do backend) — usa o padrão existente: importa o app, `listen(0)`, `fetch`.

`backend/src/routes/groupOnboarding.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";

// Evita o app.listen(3000) automático do index.js fora da Vercel + fecha o endpoint com key.
process.env.VERCEL = "1";
process.env.AGENT_API_KEY = "chave-de-teste";

const { default: app } = await import("../index.js");

function listen(a) {
  return new Promise((r) => {
    const s = a.listen(0, () => r(s));
  });
}

test("group-onboarding: 401 com x-api-key errada (antes de tocar o DB)", async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/agent/group-onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "errada" },
      body: JSON.stringify({ tenant_id: 3, groups: [{ jid: "g1", nome: "x" }] }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("group-onboarding: 400 sem groups (key correta, antes do DB)", async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/agent/group-onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "chave-de-teste" },
      body: JSON.stringify({ tenant_id: 3, groups: [] }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 4: Rodar os testes do backend**

Run: `cd backend && node --test`
Expected: PASS (lib + rota + suíte existente).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/groupOnboarding.js backend/src/index.js backend/src/routes/groupOnboarding.test.js
git commit -m "feat(backend): rota /api/agent/group-onboarding (descobre+auto-mapeia grupos)"
```

---

### Task 3 (CONTROLLER): deploy backend + n8n `gm-grupo-onboarding` + piloto

**Controller-only** (deploy Vercel + n8n vivo + coordena o piloto operacional com o owner).

**Files:**
- Create: `scripts/n8n/gm-grupo-onboarding.workflow.json`

**Design do workflow:**
1. **Webhook** (sob demanda) — sem auth forte (path legível ok; ou header como a 3-B). Opcional: Schedule diário.
2. **HTTP `gmgo-groups`** — Evolution `GET https://evolution.gestmiles.com.br/group/fetchAllGroups/gestmiles_qr?getParticipants=false` (credencial `CRED_EVOLUTION_HEADER`).
3. **Code `gmgo-prep`** — mapeia a resposta Evolution → `{ tenant_id: 3, groups: [{jid: g.id, nome: g.subject, size: g.size}] }` (confirmar os nomes de campo da resposta Evolution no build).
4. **HTTP `gmgo-bff`** — POST `{PUBLIC_API_URL}/api/agent/group-onboarding` com `x-api-key` (`CRED_RESUMO_APIKEY` id `8JJba9f768EANZ33`) e o body do prep.
5. **Code `gmgo-msg`** — compõe o relatório ("Descobri N: auto-mapeei X, já mapeados Y, revisar Z" + linhas dos incertos).
6. **HTTP `gmgo-send`** — Evolution send pro `grupo_interno_jid` do tenant 3.

**Passos do controller:**
- [ ] Deploy do backend na Vercel (rota nova) — receita em [[usuario-status-next-steps]] (Vercel CLI por worktree). Confirmar `/api/agent/group-onboarding` respondendo 401 sem key (curl).
- [ ] Construir + push do workflow (`node scripts/n8n/push-workflow.mjs ...`); confirmar a estrutura da resposta Evolution `fetchAllGroups` (campos `id`/`subject`) no primeiro run.
- [ ] **CHECKPOINT owner (operacional):** pedir pra adicionar o bot (`5527999819535`) a um **lote piloto (~10 grupos reais)**.
- [ ] E2E real: rodar o webhook → conferir `agent_grupos`/`agent_vinculos` populados + relatório no grupo interno; validar a QUALIDADE do match nos nomes reais (afinar a normalização se preciso). Conferir que a 3-B agora alcança um cliente-piloto (aprovar transfer sintética → msg no grupo do cliente).
- [ ] Ativar (cron diário opcional). Commit do JSON. Abrir PR.

---

## Self-Review

- **Cobertura:** match/normalização (Task 1) ✓; rota upsert+auto-map+report (Task 2) ✓; Evolution discovery + report (Task 3) ✓; participante_jid sentinela (Task 2) ✓; idempotência (Task 2 select-then-insert + não-remapeia) ✓; revisão dos incertos (report) ✓.
- **Placeholders:** o teste da rota (Task 2 Step 3) depende de conferir supertest/estilo existente — instrução explícita de fallback (handler direto), não um "TODO".
- **Sem staging → E2E com o piloto real** (padrão da casa).
