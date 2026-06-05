# WS4 — Hardening (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os vetores de abuso/vazamento mais expostos do backend e adicionar uma camada de defesa no front, sem migration.

**Architecture:** (1) Rate-limit por conta nos 2 endpoints **anônimos** de reset (contagem read-only em `password_reset_tokens.created_at`, sem schema novo, preservando a resposta genérica anti-enumeração). (2) Sanitiza os `500` das rotas de reset (loga server-side, responde genérico). (3) Error-handler Express global como safety net (já pronto pra receber Sentry no WS3). (4) CSP **Report-Only** no front (observa antes de enforce).

**Tech Stack:** Express 4 (ESM), Supabase service role (`assertSupabaseService`), Vercel headers.

**Branch:** `feat/backend-hardening` (1 PR). `git fetch origin` + branch a partir do `main` já com WS2.

**Spec:** `docs/superpowers/specs/2026-06-05-launch-readiness-cliente-design.md` (WS4).

**Fora deste WS (decisão do owner 2026-06-05):** o sweep dos ~78 `err.message` restantes (P2-1) vira **WS4b** (PR próprio, por rota, pra não matar mensagem útil). Aqui só os 500 das rotas de reset.

## File Structure

- **Modify** `backend/src/routes/auth.js` — consts + helper `resetThrottled()`; aplica o gate e sanitiza os 500 nas 2 rotas de reset.
- **Modify** `backend/src/index.js` — error-handler global após `app.use(routes)`.
- **Modify** `vercel.json` (raiz) — header `Content-Security-Policy-Report-Only`.

## Verificação (sem unit test novo)

A lógica testável (mailer) já tem cobertura. WS4 é rate-limit/headers/middleware: verificado por **smoke + boot + build**, não por `npm test` novo. (Backend não tem runner de rota; o `node --test` do mailer continua passando.)

---

## Task 1: Rate-limit por conta nos 2 resets

**Files:**
- Modify: `backend/src/routes/auth.js`

- [ ] **Step 1: Adicionar consts + helper de throttle**

Em `backend/src/routes/auth.js`, logo após a função `getPrimeiroNomeCliente` (antes de `/** POST /api/auth/signup ... */`), inserir:

```js
// Rate-limit dos pedidos de reset por conta (anti email-bomb). Conta os tokens já
// criados pro mesmo user na janela; read-only, sem schema novo. Fail-open em erro
// de DB (controle não-crítico; disponibilidade > rigidez).
const RESET_WINDOW_MIN = 15;
const RESET_MAX_PER_WINDOW = 3;

async function resetThrottled(sbAdmin, uid) {
  const sinceIso = new Date(Date.now() - RESET_WINDOW_MIN * 60 * 1000).toISOString();
  const { count, error } = await sbAdmin
    .from("password_reset_tokens")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid)
    .gte("created_at", sinceIso);
  if (error) return false;
  return (count ?? 0) >= RESET_MAX_PER_WINDOW;
}
```

- [ ] **Step 2: Aplicar o gate na rota cliente**

Em `request-password-reset`, logo após o bloco `if (!uid) { return res.json(... ) }` (a checagem de e-mail desconhecido) e **antes** de `const rawToken = ...`, inserir:

```js
    if (await resetThrottled(sbAdmin, uid)) {
      return res.json({ ok: true, message: "Se o email for cadastrado na Gest Miles, enviaremos instruções." });
    }
```

- [ ] **Step 3: Aplicar o gate na rota manager**

Em `request-password-reset-manager`, no mesmo ponto (após o `if (!uid) { return ... }`, antes de `const rawToken = ...`), inserir o **mesmo** bloco:

```js
    if (await resetThrottled(sbAdmin, uid)) {
      return res.json({ ok: true, message: "Se o email for cadastrado na Gest Miles, enviaremos instruções." });
    }
```

- [ ] **Step 4: Verificar sintaxe**

Run (em `backend/`): `node --check src/routes/auth.js`
Expected: sem saída.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/auth.js
git commit -m "feat(backend): rate-limit por conta nos endpoints de reset (anti email-bomb)"
```

---

## Task 2: Sanitizar os 500 das rotas de reset

**Files:**
- Modify: `backend/src/routes/auth.js`

- [ ] **Step 1: Rota cliente — catch genérico + log**

Em `request-password-reset`, substituir:

```js
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao enviar reset." });
  }
});
```

pela versão que loga e não vaza (cuidado: há 2 blocos iguais — este é o da rota **cliente**, que termina antes do comentário `/** POST /api/auth/request-password-reset-manager ... */`):

```js
  } catch (err) {
    console.error("[auth] request-password-reset falhou:", err?.message ?? err);
    return res.status(500).json({ error: "Não foi possível enviar o e-mail de redefinição agora." });
  }
});
```

- [ ] **Step 2: Rota manager — catch genérico + log**

Em `request-password-reset-manager`, substituir o `catch` análogo (o que termina antes de `/** POST /api/auth/complete-password-reset ... */`):

```js
  } catch (err) {
    console.error("[auth] request-password-reset-manager falhou:", err?.message ?? err);
    return res.status(500).json({ error: "Não foi possível enviar o e-mail de redefinição agora." });
  }
});
```

> Nota: como os dois `catch` originais são idênticos, aplicar um de cada vez com contexto suficiente (a linha de mensagem `console.error` distingue cliente vs manager). Os demais `catch` de `auth.js` ficam pro WS4b.

- [ ] **Step 3: Verificar sintaxe**

Run (em `backend/`): `node --check src/routes/auth.js`
Expected: sem saída.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/auth.js
git commit -m "fix(backend): rotas de reset nao vazam err.message no 500"
```

---

## Task 3: Error-handler global (safety net)

**Files:**
- Modify: `backend/src/index.js`

- [ ] **Step 1: Adicionar o handler após as rotas**

Em `backend/src/index.js`, logo após `app.use(routes);` e **antes** de `export default app;`, inserir:

```js
// Error-handler global: safety net pra erros não-tratados (4 args = middleware de erro).
// Loga o erro real e responde genérico (não vaza err.message). WS3 pluga Sentry aqui.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[backend] erro não-tratado:", err?.stack || err?.message || err);
  // TODO(WS3): Sentry.captureException(err)
  if (res.headersSent) return next(err);
  res.status(err?.status || 500).json({ error: "Erro interno. Tente novamente." });
});
```

- [ ] **Step 2: Verificar sintaxe + boot**

Run (em `backend/`): `node --check src/index.js`
Expected: sem saída.
Run: `node src/index.js` → aparece `Backend API rodando em http://localhost:<porta>` sem stack. Encerrar.

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.js
git commit -m "feat(backend): error-handler global (safety net, pronto pro Sentry)"
```

---

## Task 4: CSP Report-Only no front

**Files:**
- Modify: `vercel.json` (raiz)

- [ ] **Step 1: Adicionar o header CSP report-only**

No array `headers[0].headers` do `vercel.json` da raiz, após o header `Permissions-Policy`, adicionar a entrada:

```json
        { "key": "Content-Security-Policy-Report-Only", "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" }
```

> Report-Only **não bloqueia** nada — só reporta violação no console do browser. Serve pra observar antes de migrar pra `Content-Security-Policy` (enforce) num WS futuro, quando a origem do BFF (VITE_API_URL) e o ingest do Sentry estiverem confirmados.

- [ ] **Step 2: Validar JSON + build do front**

Run (na raiz): `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('JSON OK')"`
Expected: `JSON OK`.
Run: `npm run build`
Expected: build do Vite sem erro.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore(usuario): CSP Report-Only no vercel.json (observar antes de enforce)"
```

---

## Task 5: Verificação final + smoke + PR

- [ ] **Step 1: Gate do front (não tocado no backend, mas confirma o repo)**

Run (na raiz): `npx tsc -b` (exit 0), `npm test` (verde), `npm run build` (ok).

- [ ] **Step 2: Backend — testes do mailer seguem verdes + boot**

Run (em `backend/`): `npm test` → 6/6. `node src/index.js` sobe sem stack.

- [ ] **Step 3: Smoke do rate-limit (com `.env` real + um e-mail cadastrado)**

Com o backend rodando, disparar o reset 4× pro mesmo e-mail **cadastrado**:

```bash
for i in 1 2 3 4; do curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:3040/api/auth/request-password-reset -H "content-type: application/json" -d '{"email":"EMAIL_CADASTRADO@dominio.com"}'; done; echo
```
Expected: todas `200`. As 3 primeiras geram token/e-mail; da 4ª em diante o backend **não** cria novo token nem envia (mesma resposta genérica). Conferir em `password_reset_tokens` que ficaram só 3 linhas recentes pra esse user (via SQL Editor/MCP, read-only).

- [ ] **Step 4: Abrir o PR**

```bash
git push -u origin feat/backend-hardening
gh pr create --base main --title "feat(backend): hardening — rate-limit reset + error-handler + CSP report-only (WS4)" \
  --body "Rate-limit por conta nos 2 endpoints anônimos de reset (count read-only em password_reset_tokens, sem migration), sanitiza os 500 das rotas de reset, error-handler global (safety net, pronto pro Sentry/WS3) e CSP Report-Only no front. Parte do launch-readiness (WS4). Sweep dos ~78 err.message restantes fica pro WS4b."
```

---

## Self-Review (writing-plans)

**Cobertura do spec (WS4 enxuto):** rate-limit reset ✅ (Task 1, sem migration — count em `created_at`) · sanitiza 500 do reset ✅ (Task 2) · error-handler global pronto pro Sentry ✅ (Task 3) · CSP report-only ✅ (Task 4). Sweep amplo de `err.message` explicitamente **deferido** pro WS4b.

**Placeholders:** nenhum — código e comandos concretos. Único valor a preencher: e-mail cadastrado no smoke (Task 5, esperado).

**Consistência:** `resetThrottled(sbAdmin, uid)` definido em Task 1 e usado idêntico nas 2 rotas (Tasks 2/3 steps). Resposta de throttle = a MESMA mensagem genérica do caminho `!uid` (preserva anti-enumeração). Error-handler com 4 args (exigência do Express).

**Riscos:** (1) rate-limit fail-open em erro de DB — proposital. (2) CSP report-only não quebra nada; enforce é WS futuro (precisa origem do BFF + Sentry). (3) Backend sem teste de rota — smoke cobre o rate-limit.
