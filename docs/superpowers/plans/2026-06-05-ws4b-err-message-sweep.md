# WS4b — Sweep de err.message nos 500 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (ou subagent-driven-development). Steps usam checkbox (`- [ ]`).

**Goal:** Parar de vazar `err.message` (texto interno/SQL) nas respostas **500** das rotas do **app do cliente**, sem mexer nas mensagens **4xx** (que são UX legítima).

**Architecture:** Helper único `serverError(res, publicMessage, err, tag)` que **loga o erro real no servidor** (única visibilidade até o Sentry do WS3) e **responde genérico**. Cada site de 500-leak vira uma chamada ao helper, usando como mensagem pública o fallback estático que já existia na linha. 4xx fica intocado.

**Tech Stack:** Express 4 (ESM), `node --test`.

**Branch:** `feat/backend-err-sweep` (1 PR). `git fetch` + branch do `main`.

**Heurística (decisão do owner 2026-06-05):** só **500** → genérico+log. **4xx** (validação, "e-mail já cadastrado", "credenciais inválidas") → mantém.

**Escopo — FORA (deferido, com razão):**
- `stripeBilling.js`, `stripeWebhook.js` → **Stripe congelado** (pivô IAP).
- `auditLogs.js`, `middleware/requireAdmin.js` → superfície **staff/admin** (app manager), não é o app do cliente. Vira sweep próprio se o owner quiser.

## File Structure

- **Create** `backend/src/lib/httpError.js` — `serverError()`.
- **Create** `backend/src/lib/httpError.test.js` — testes (`node:test`).
- **Modify** 10 rotas (tabela abaixo): import do helper + troca dos sites de 500.

## Sites a trocar (cliente-facing) — 29 no total

Para cada um: `return res.status(500).json({ error: <X>.message || "MSG" });` → `return serverError(res, "MSG", <X>, "<tag>");` (a `MSG` é o fallback que já estava na linha).

| Arquivo | tag | linhas → mensagem pública |
|---|---|---|
| `routes/auth.js` | `[auth]` | 76 "Erro ao cadastrar" · 96 "Erro ao fazer login" · 116 "Erro ao enviar link" · 130 "Erro ao obter sessão" · 144 "Erro ao obter usuário" · 349 "Erro ao redefinir senha" |
| `routes/perfis.js` | `[perfis]` | 27 "Erro ao obter perfil" · 50 "Erro ao obter role" · 70 "Erro ao obter perfil" · 95 "Erro ao salvar perfil" |
| `routes/demandas.js` | `[demandas]` | 31 "Erro ao listar demandas" · 58 "Erro ao criar demanda" · 80 "Erro ao atualizar demanda" |
| `routes/programasCliente.js` | `[programas-cliente]` | 27 "Erro ao listar programas" · 54 "Erro ao salvar programa" |
| `routes/bonusOffers.js` | `[bonus-offers]` | 17 "Erro ao listar ofertas" (var `error`) · 22 "Erro ao listar ofertas" (var `err`) |
| `routes/calendarPrices.js` | `[calendar-prices]` | 31 "Erro ao obter preços" (var `error`) · 58 "Erro ao obter preços" (var `err`) |
| `routes/demoFlights.js` | `[demo-flights]` | 26 "Erro ao listar voos demo" (var `error`) · 37 "Erro ao listar voos demo" (var `err`, padrão `instanceof`) |
| `routes/contact.js` | `[contact]` | 113 "Erro ao registrar mensagem." (var `insErr`) · 137 "Erro ao enviar mensagem." (var `err`) |
| `routes/referrals.js` | `[referrals]` | 113 "Erro ao registrar o convite." (var `insErr`) · 138 "Erro ao enviar convite." (var `err`) |
| `routes/invites.js` | `[invites]` | 180 "Erro ao criar convite." · 208 "Erro ao validar convite." · 272 "Erro ao aceitar convite." · 324 "Erro ao enviar boas-vindas." |

> Não confiar nos números de linha cegamente (mudam após cada edit): casar pela linha exata `res.status(500).json({ error: ... })`. Cada arquivo: adicionar `import { serverError } from "../lib/httpError.js";` no topo.

---

## Task 1: Helper `serverError` (TDD)

**Files:** Create `backend/src/lib/httpError.js`, `backend/src/lib/httpError.test.js`

- [ ] **Step 1: Teste que falha** — criar `backend/src/lib/httpError.test.js`:

```js
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { serverError } from "./httpError.js";

const ORIGINAL_ERROR = console.error;
let logged;

beforeEach(() => { logged = []; console.error = (...a) => logged.push(a); });
afterEach(() => { console.error = ORIGINAL_ERROR; });

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test("serverError: responde 500 com a mensagem pública (não vaza err.message)", () => {
  const res = fakeRes();
  serverError(res, "Erro ao salvar.", new Error("coluna secreta xpto"), "[t]");
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Erro ao salvar." });
});

test("serverError: loga o erro real no servidor", () => {
  const res = fakeRes();
  serverError(res, "Erro ao salvar.", new Error("detalhe interno"), "[t]");
  assert.equal(logged.length, 1);
  assert.ok(String(logged[0].join(" ")).includes("detalhe interno"));
});

test("serverError: aceita não-Error sem quebrar", () => {
  const res = fakeRes();
  serverError(res, "Erro.", "string solta", "[t]");
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Erro." });
});
```

- [ ] **Step 2: Rodar — falha** (`npm test` em `backend/`): FAIL `Cannot find module './httpError.js'`.

- [ ] **Step 3: Implementar** — criar `backend/src/lib/httpError.js`:

```js
// Resposta de erro 500 que NÃO vaza detalhe interno: loga o erro real no servidor
// (única visibilidade até o Sentry entrar — WS3) e responde mensagem pública genérica.
// Usar em catch/guards de 500. Respostas 4xx (validação) seguem com mensagem própria.
export function serverError(res, publicMessage, err, tag = "[backend]") {
  console.error(`${tag} ${publicMessage}:`, err?.message ?? err);
  return res.status(500).json({ error: publicMessage });
}
```

- [ ] **Step 4: Rodar — passa** (`npm test`): os 3 testes novos + os 6 do mailer.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/httpError.js backend/src/lib/httpError.test.js
git commit -m "feat(backend): helper serverError (500 generico + log, anti err.message leak)"
```

---

## Task 2: Aplicar o helper nos 10 arquivos

Para **cada** arquivo da tabela: (a) adicionar o import; (b) trocar cada site de 500 pela chamada `serverError(...)` com a mensagem/tag da tabela. Trabalhar arquivo por arquivo; `node --check <arquivo>` após cada um.

- [ ] **Step 1:** `auth.js` (6 sites, tag `[auth]`) — `node --check src/routes/auth.js`.
- [ ] **Step 2:** `perfis.js` (4, `[perfis]`).
- [ ] **Step 3:** `demandas.js` (3, `[demandas]`).
- [ ] **Step 4:** `programasCliente.js` (2, `[programas-cliente]`).
- [ ] **Step 5:** `bonusOffers.js` (2, `[bonus-offers]`).
- [ ] **Step 6:** `calendarPrices.js` (2, `[calendar-prices]`).
- [ ] **Step 7:** `demoFlights.js` (2, `[demo-flights]`).
- [ ] **Step 8:** `contact.js` (2, `[contact]`).
- [ ] **Step 9:** `referrals.js` (2, `[referrals]`).
- [ ] **Step 10:** `invites.js` (4, `[invites]`).

- [ ] **Step 11: Commit**

```bash
git add backend/src/routes/
git commit -m "fix(backend): rotas do cliente nao vazam err.message nos 500 (usa serverError)"
```

---

## Task 3: Verificação + PR

- [ ] **Step 1: Não sobrou leak de 500 nos 10 arquivos**

Run (em `backend/`): `git grep -nE "status\(500\).*\.(message)" -- src/routes/auth.js src/routes/perfis.js src/routes/demandas.js src/routes/programasCliente.js src/routes/bonusOffers.js src/routes/calendarPrices.js src/routes/demoFlights.js src/routes/contact.js src/routes/referrals.js src/routes/invites.js`
Expected: nenhuma linha.

- [ ] **Step 2: 4xx intocados** — conferir que `status(400|401|403|404)` ainda usam `error.message` onde faziam (ex.: `auth.js` login `signInWithPassword` error). `git grep -nE "status\(4[0-9][0-9]\).*message" -- src/routes/` deve continuar mostrando os mesmos de antes.

- [ ] **Step 3: Testes + boot** — `npm test` (backend): 9 testes (6 mailer + 3 httpError). `node src/index.js` sobe sem stack.

- [ ] **Step 4: Gate do front** — na raiz: `npx tsc -b` (0), `npm test` (verde), `npm run build` (ok).

- [ ] **Step 5: PR**

```bash
git push -u origin feat/backend-err-sweep
gh pr create --base main --title "fix(backend): rotas do cliente nao vazam err.message nos 500 (WS4b)" \
  --body "Sweep do P2-1 na superficie do cliente: helper serverError (loga real + responde generico) em ~29 sites de 500. 4xx intocados. Stripe (congelado) e auditLogs/requireAdmin (staff) ficam de fora, deferidos."
```

## Self-Review

**Cobertura:** todos os 500-leak da superfície cliente (10 arquivos) na tabela. Stripe + staff explicitamente deferidos. **Placeholders:** nenhum — helper completo, tabela com mensagem/tag por site. **Consistência:** `serverError(res, msg, err, tag)` idêntico em todos; mensagem pública = fallback pré-existente; 4xx fora de escopo. **Risco:** baixo (só troca o conteúdo do 500 + adiciona log); helper testado.
