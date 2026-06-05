# WS2 — Brevo → Resend (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar todo o envio de e-mail transacional do backend de Brevo para Resend, atrás de um único módulo testado (`lib/mailer.js`), sem mudar o conteúdo dos e-mails.

**Architecture:** Um transporte único `sendEmail()` (best-effort, nunca lança) encapsula a API HTTP do Resend. As 4 rotas que mandavam e-mail (`auth` reset cliente+manager, `invites`, `contact`, `referrals`) passam a chamar esse módulo. Semântica preservada: reset → 503 se não-configurado / 500 se envio falhar; convites/contato/indicações → best-effort (warn, não derruba o request). O módulo lê env em tempo de chamada, então é testável com `globalThis.fetch` mockado.

**Tech Stack:** Node ≥20 (ESM), `node --test` (runner nativo, zero dep nova), Express, Resend HTTP API (`POST https://api.resend.com/emails`).

**Branch:** `feat/backend-resend` (1 PR para todo o WS2). `git fetch origin` antes de criar a branch.

**Spec:** `docs/superpowers/specs/2026-06-05-launch-readiness-cliente-design.md` (WS2).

---

## Pré-condições

- ✅ `RESEND_API_KEY` já no Vercel do backend (confirmado pelo owner 2026-06-05).
- ⚠️ **Validar antes de prod:** `RESEND_FROM` (remetente com domínio verificado no Resend). Sem ele, `mailerConfigured()` é `false` e os e-mails não saem (reset retorna 503; os demais logam warn).
- **Rollback:** manter `BREVO_*` setado no Vercel. Rollback = redeploy do backend anterior (que ainda usa Brevo). O código novo não lê mais `BREVO_*`.

## File Structure

- **Create** `backend/src/lib/mailer.js` — transporte Resend: `sendEmail`, `mailerConfigured`, `resendFrom`. Única responsabilidade: falar com o Resend.
- **Create** `backend/src/lib/mailer.test.js` — testes unitários (`node:test`) com `fetch` mockado.
- **Modify** `backend/package.json` — adicionar script `test`.
- **Modify** `backend/src/routes/auth.js` — 2 rotas de reset usam `sendEmail`/`mailerConfigured`.
- **Modify** `backend/src/routes/invites.js` — remover `sendBrevoEmail`/`brevoConfigured`; usar o módulo.
- **Modify** `backend/src/routes/contact.js` — usar `sendEmail`/`mailerConfigured`.
- **Modify** `backend/src/routes/referrals.js` — usar `sendEmail`/`mailerConfigured`.
- **Modify** `backend/.env.example` — `RESEND_*` documentado; `BREVO_*` marcado como legado.

---

## Task 1: Módulo `mailer.js` (TDD) + runner de teste do backend

**Files:**
- Create: `backend/src/lib/mailer.js`
- Create: `backend/src/lib/mailer.test.js`
- Modify: `backend/package.json`

- [ ] **Step 1: Adicionar script de teste ao backend**

Em `backend/package.json`, dentro de `"scripts"`, adicionar a linha `test` (após `"start"`):

```json
  "scripts": {
    "dev": "node --watch src/index.js",
    "build": "node -e \"console.log('backend: no compile step')\"",
    "start": "node src/index.js",
    "test": "node --test"
  },
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `backend/src/lib/mailer.test.js`:

```js
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sendEmail, mailerConfigured, resendFrom } from "./mailer.js";

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM = "no-reply@gestmiles.com.br";
  delete process.env.RESEND_FROM_NAME;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  delete process.env.RESEND_FROM_NAME;
});

test("mailerConfigured: false sem chave ou sem remetente", () => {
  delete process.env.RESEND_API_KEY;
  assert.equal(mailerConfigured(), false);
  process.env.RESEND_API_KEY = "re_test_key";
  delete process.env.RESEND_FROM;
  assert.equal(mailerConfigured(), false);
});

test("resendFrom: envolve e-mail puro com nome default; respeita formato completo", () => {
  assert.equal(resendFrom(), "Gest Miles <no-reply@gestmiles.com.br>");
  process.env.RESEND_FROM = "Time <ola@gestmiles.com.br>";
  assert.equal(resendFrom(), "Time <ola@gestmiles.com.br>");
});

test("sendEmail: não chama fetch quando não-configurado", async () => {
  delete process.env.RESEND_API_KEY;
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, text: async () => "" }; };
  const res = await sendEmail({ to: "a@b.com", subject: "x", html: "<p>x</p>" });
  assert.deepEqual(res, { ok: false, reason: "not-configured" });
  assert.equal(called, false);
});

test("sendEmail: POST no Resend com Bearer + corpo correto", async () => {
  let captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, text: async () => "" };
  };
  const res = await sendEmail({
    to: "cliente@b.com",
    subject: "Assunto",
    html: "<p>oi</p>",
    replyTo: "resp@b.com",
  });
  assert.deepEqual(res, { ok: true });
  assert.equal(captured.url, "https://api.resend.com/emails");
  assert.equal(captured.opts.method, "POST");
  assert.equal(captured.opts.headers.Authorization, "Bearer re_test_key");
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.from, "Gest Miles <no-reply@gestmiles.com.br>");
  assert.deepEqual(body.to, ["cliente@b.com"]);
  assert.equal(body.subject, "Assunto");
  assert.equal(body.html, "<p>oi</p>");
  assert.equal(body.reply_to, "resp@b.com");
});

test("sendEmail: resposta não-ok retorna ok:false com o texto do erro", async () => {
  globalThis.fetch = async () => ({ ok: false, text: async () => "dominio nao verificado" });
  const res = await sendEmail({ to: "a@b.com", subject: "x", html: "<p>x</p>" });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "dominio nao verificado");
});

test("sendEmail: nunca lança quando fetch estoura", async () => {
  globalThis.fetch = async () => { throw new Error("network down"); };
  const res = await sendEmail({ to: "a@b.com", subject: "x", html: "<p>x</p>" });
  assert.deepEqual(res, { ok: false, reason: "network down" });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run (a partir de `backend/`): `npm test`
Expected: FAIL — `Cannot find module './mailer.js'` (o módulo ainda não existe).

- [ ] **Step 4: Implementar `mailer.js`**

Criar `backend/src/lib/mailer.js`:

```js
// Transporte de e-mail transacional via Resend (https://resend.com).
// Substitui o envio direto por Brevo. Lê env em tempo de chamada (não no import),
// então o backend e os testes definem as variáveis antes de enviar.
//
// Env (só backend — nunca em VITE_*):
//   RESEND_API_KEY   chave da API Resend.
//   RESEND_FROM      remetente verificado. Aceita "Nome <email@dominio>" OU só "email@dominio".
//   RESEND_FROM_NAME (opcional) nome usado quando RESEND_FROM é só o e-mail. Default "Gest Miles".

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** true quando há chave + remetente configurados. */
export function mailerConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

/** Monta o campo `from` no formato que o Resend espera. */
export function resendFrom() {
  const from = String(process.env.RESEND_FROM || "").trim();
  if (!from) return "";
  if (from.includes("<")) return from;
  const name = (process.env.RESEND_FROM_NAME || "Gest Miles").trim();
  return `${name} <${from}>`;
}

/**
 * Envia um e-mail via Resend. Best-effort: NUNCA lança.
 * @param {{ to: string|string[], subject: string, html: string, replyTo?: string }} params
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function sendEmail({ to, subject, html, replyTo } = {}) {
  if (!mailerConfigured()) return { ok: false, reason: "not-configured" };
  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom(),
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!r.ok) {
      return { ok: false, reason: (await r.text().catch(() => "")) || "resend-error" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "resend-exception" };
  }
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run (a partir de `backend/`): `npm test`
Expected: PASS — 6 testes passando.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/mailer.js backend/src/lib/mailer.test.js backend/package.json
git commit -m "feat(backend): transporte de e-mail via Resend (lib/mailer) + node --test"
```

---

## Task 2: Reset de senha (cliente + manager) usa o mailer

**Files:**
- Modify: `backend/src/routes/auth.js`

- [ ] **Step 1: Importar o mailer**

No topo de `backend/src/routes/auth.js`, após a linha `import { requireAuth } from "../middleware/auth.js";`, adicionar:

```js
import { sendEmail, mailerConfigured } from "../lib/mailer.js";
```

- [ ] **Step 2: Rota cliente — trocar checagem de config**

Em `request-password-reset`, substituir:

```js
    const brevoKey = process.env.BREVO_API_KEY;
    const sender = process.env.BREVO_SENDER_EMAIL;
    const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:3080").replace(/\/$/, "");
    if (!brevoKey || !sender) {
      return res.status(503).json({ error: "Brevo não configurado no backend." });
    }
```

por:

```js
    const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:3080").replace(/\/$/, "");
    if (!mailerConfigured()) {
      return res.status(503).json({ error: "Serviço de e-mail não configurado no backend." });
    }
```

- [ ] **Step 3: Rota cliente — trocar o envio**

Na mesma rota, substituir o bloco do fetch Brevo:

```js
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": brevoKey },
      body: JSON.stringify({
        sender: { name: process.env.BREVO_SENDER_NAME || "Gest Miles", email: sender },
        to: [{ email: em }],
        subject: "Recuperação de senha — Gest Miles",
        htmlContent: html,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
```

por:

```js
    const mail = await sendEmail({
      to: em,
      subject: "Recuperação de senha — Gest Miles",
      html,
    });
    if (!mail.ok) throw new Error(mail.reason || "Falha ao enviar e-mail.");
```

- [ ] **Step 4: Rota manager — trocar checagem de config**

Em `request-password-reset-manager`, substituir:

```js
    const brevoKey = process.env.BREVO_API_KEY;
    const sender = process.env.BREVO_SENDER_EMAIL;
    const managerUrl = (process.env.PUBLIC_MANAGER_URL || "http://localhost:3002").replace(/\/$/, "");
    if (!brevoKey || !sender) {
      return res.status(503).json({ error: "Brevo não configurado no backend." });
    }
```

por:

```js
    const managerUrl = (process.env.PUBLIC_MANAGER_URL || "http://localhost:3002").replace(/\/$/, "");
    if (!mailerConfigured()) {
      return res.status(503).json({ error: "Serviço de e-mail não configurado no backend." });
    }
```

- [ ] **Step 5: Rota manager — trocar o envio**

Na mesma rota, substituir:

```js
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": brevoKey },
      body: JSON.stringify({
        sender: { name: process.env.BREVO_SENDER_NAME || "Gest Miles", email: sender },
        to: [{ email: em }],
        subject: "Recuperação de acesso — Painel de Gestão Gest Miles",
        htmlContent: html,
      }),
    });
    if (!r.ok) throw new Error(await r.text());
```

por:

```js
    const mail = await sendEmail({
      to: em,
      subject: "Recuperação de acesso — Painel de Gestão Gest Miles",
      html,
    });
    if (!mail.ok) throw new Error(mail.reason || "Falha ao enviar e-mail.");
```

- [ ] **Step 6: Verificar sintaxe e ausência de Brevo no arquivo**

Run (a partir de `backend/`): `node --check src/routes/auth.js`
Expected: sem saída (sintaxe ok).
Run: `grep -n "brevo\|Brevo\|BREVO" src/routes/auth.js`
Expected: nenhuma linha (zero ocorrências).

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/auth.js
git commit -m "refactor(backend): reset de senha (cliente+manager) envia via Resend"
```

---

## Task 3: `invites.js` usa o mailer (remove helper Brevo local)

**Files:**
- Modify: `backend/src/routes/invites.js`

- [ ] **Step 1: Importar o mailer**

No topo de `backend/src/routes/invites.js`, após `import { requireAuth } from "../middleware/auth.js";`, adicionar:

```js
import { sendEmail, mailerConfigured } from "../lib/mailer.js";
```

- [ ] **Step 2: Remover `brevoConfigured` e `sendBrevoEmail`**

Apagar o bloco inteiro (atualmente linhas 52–81):

```js
const brevoConfigured = () =>
  Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);

/** Envia e-mail via Brevo. Retorna {ok} — nunca lança (best-effort). */
async function sendBrevoEmail({ to, subject, html }) {
  if (!brevoConfigured()) return { ok: false, reason: "not-configured" };
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME || "Gest Miles",
          email: process.env.BREVO_SENDER_EMAIL,
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!r.ok) return { ok: false, reason: (await r.text().catch(() => "")) || "brevo-error" };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "brevo-exception" };
  }
}
```

- [ ] **Step 3: Trocar as referências aos helpers**

No restante de `invites.js`:
- Trocar `!brevoConfigured()` por `!mailerConfigured()` (há uma ocorrência, no guard `if (!brevoConfigured() && process.env.VERCEL)`).
- Trocar as 2 chamadas `await sendBrevoEmail({` por `await sendEmail({` (a forma do argumento `{ to, subject, html }` é idêntica — `sendEmail` aceita).
- Atualizar as mensagens de warn (opcional, cosmético): `"[invites] Brevo falhou ao enviar convite:"` → `"[invites] e-mail falhou ao enviar convite:"` e `"[invites] welcome Brevo falhou:"` → `"[invites] welcome e-mail falhou:"`.

Também trocar a frase de erro 503 `"E-mail (Brevo) não configurado no backend."` por `"Serviço de e-mail não configurado no backend."`.

- [ ] **Step 4: Verificar sintaxe e ausência de Brevo**

Run (a partir de `backend/`): `node --check src/routes/invites.js`
Expected: sem saída.
Run: `grep -n "brevo\|Brevo\|BREVO\|sendBrevoEmail" src/routes/invites.js`
Expected: nenhuma linha.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/invites.js
git commit -m "refactor(backend): convites enviam via Resend (lib/mailer)"
```

---

## Task 4: `contact.js` + `referrals.js` usam o mailer

**Files:**
- Modify: `backend/src/routes/contact.js`
- Modify: `backend/src/routes/referrals.js`

- [ ] **Step 1: Importar o mailer nos dois arquivos**

No topo de `backend/src/routes/contact.js` e de `backend/src/routes/referrals.js`, adicionar (junto ao bloco de imports existente):

```js
import { sendEmail, mailerConfigured } from "../lib/mailer.js";
```

- [ ] **Step 2: `contact.js` — trocar o bloco de envio**

Substituir (atualmente linhas 117–136):

```js
      const brevoKey = process.env.BREVO_API_KEY;
      const sender = process.env.BREVO_SENDER_EMAIL;
      const inbox = process.env.CONTACT_INBOX_EMAIL || "gestmilesapp@gmail.com";
      if (brevoKey && sender) {
        const html = buildContatoEmailHtml({ nome, email: emailContato, assunto, mensagem, when: new Date() });
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json", "api-key": brevoKey },
          body: JSON.stringify({
            sender: { name: process.env.BREVO_SENDER_NAME || "Gest Miles", email: sender },
            to: [{ email: inbox }],
            ...(emailContato ? { replyTo: { email: emailContato, name: nome || undefined } } : {}),
            subject: `Novo contato (Fale Conosco) — ${assunto}`,
            htmlContent: html,
          }),
        });
        if (!r.ok) console.warn("[contact] Brevo falhou:", await r.text());
      } else {
        console.warn("[contact] Brevo não configurado; mensagem registrada sem e-mail.");
      }
```

por:

```js
      const inbox = process.env.CONTACT_INBOX_EMAIL || "gestmilesapp@gmail.com";
      if (mailerConfigured()) {
        const html = buildContatoEmailHtml({ nome, email: emailContato, assunto, mensagem, when: new Date() });
        const mail = await sendEmail({
          to: inbox,
          subject: `Novo contato (Fale Conosco) — ${assunto}`,
          html,
          ...(emailContato ? { replyTo: emailContato } : {}),
        });
        if (!mail.ok) console.warn("[contact] e-mail falhou:", mail.reason);
      } else {
        console.warn("[contact] e-mail não configurado; mensagem registrada sem envio.");
      }
```

- [ ] **Step 3: `referrals.js` — trocar o bloco de envio**

Substituir (atualmente linhas 117–137):

```js
      const brevoKey = process.env.BREVO_API_KEY;
      const sender = process.env.BREVO_SENDER_EMAIL;
      const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:3080").replace(/\/$/, "");
      if (brevoKey && sender) {
        const link = `${appUrl}/auth/sign-up?ref=${encodeURIComponent(codigo)}`;
        const html = buildConviteEmailHtml({ nome, link });
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { accept: "application/json", "content-type": "application/json", "api-key": brevoKey },
          body: JSON.stringify({
            sender: { name: process.env.BREVO_SENDER_NAME || "Gest Miles", email: sender },
            to: [{ email }],
            ...(remetenteEmail ? { replyTo: { email: remetenteEmail, name: nome || undefined } } : {}),
            subject: `${nome || "Um amigo"} te convidou para a Gest Miles`,
            htmlContent: html,
          }),
        });
        if (!r.ok) console.warn("[referrals] Brevo falhou:", await r.text());
      } else {
        console.warn("[referrals] Brevo não configurado; convite registrado sem e-mail.");
      }
```

por:

```js
      const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:3080").replace(/\/$/, "");
      if (mailerConfigured()) {
        const link = `${appUrl}/auth/sign-up?ref=${encodeURIComponent(codigo)}`;
        const html = buildConviteEmailHtml({ nome, link });
        const mail = await sendEmail({
          to: email,
          subject: `${nome || "Um amigo"} te convidou para a Gest Miles`,
          html,
          ...(remetenteEmail ? { replyTo: remetenteEmail } : {}),
        });
        if (!mail.ok) console.warn("[referrals] e-mail falhou:", mail.reason);
      } else {
        console.warn("[referrals] e-mail não configurado; convite registrado sem envio.");
      }
```

- [ ] **Step 4: Verificar sintaxe e ausência de Brevo**

Run (a partir de `backend/`):
```
node --check src/routes/contact.js
node --check src/routes/referrals.js
grep -rn "brevo\|Brevo\|BREVO" src/routes/contact.js src/routes/referrals.js
```
Expected: sem saída nos `--check`; zero ocorrências no `grep`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/contact.js backend/src/routes/referrals.js
git commit -m "refactor(backend): contato e indicações enviam via Resend (lib/mailer)"
```

---

## Task 5: `.env.example` — documentar Resend, aposentar Brevo

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Substituir o bloco Brevo**

Substituir (atualmente linhas 18–23):

```
# Brevo — Transactional emails (https://app.brevo.com → SMTP & API → API Keys)
# Coloque a chave real em backend/.env (nunca commite chaves reais).
BREVO_API_KEY=xkeysib-replace-with-your-brevo-api-key
# E-mail remetente já verificado no domínio da Brevo (Senders → Domains).
BREVO_SENDER_EMAIL=redacted@example.com
BREVO_SENDER_NAME=Gest Miles
```

por:

```
# Resend — Transactional emails (https://resend.com → API Keys).
# Coloque a chave real em backend/.env (nunca commite chaves reais).
RESEND_API_KEY=re_replace-with-your-resend-api-key
# Remetente com domínio verificado no Resend (Domains). Aceita "Nome <email@dominio>" ou só "email@dominio".
RESEND_FROM=no-reply@gestmiles.com.br
RESEND_FROM_NAME=Gest Miles

# Legado — Brevo (mantido só como referência de rollback; o código não lê mais estas vars).
# BREVO_API_KEY=
# BREVO_SENDER_EMAIL=
# BREVO_SENDER_NAME=Gest Miles
```

- [ ] **Step 2: Commit**

```bash
git add backend/.env.example
git commit -m "docs(backend): .env.example migra de Brevo para Resend"
```

---

## Task 6: Verificação final + smoke + PR

- [ ] **Step 1: Garantir que não sobrou Brevo no código do backend**

Run (a partir de `backend/`): `grep -rn "api.brevo.com\|BREVO_API_KEY\|sendBrevoEmail" src/`
Expected: nenhuma linha.

- [ ] **Step 2: Rodar os testes do backend**

Run (a partir de `backend/`): `npm test`
Expected: PASS — os 6 testes do mailer.

- [ ] **Step 3: Confirmar que o backend sobe**

Run (a partir de `backend/`): `npm run dev` (ou `node src/index.js`)
Expected: `Backend API rodando em http://localhost:3000` sem stack trace. Encerrar (Ctrl+C).

- [ ] **Step 4: Smoke manual de uma rota (com `.env` real configurado)**

Com `RESEND_API_KEY` + `RESEND_FROM` reais em `backend/.env` e o backend rodando:

```bash
curl -s -X POST http://localhost:3000/api/auth/request-password-reset \
  -H "content-type: application/json" \
  -d '{"email":"SEU_EMAIL_DE_TESTE@dominio.com"}'
```
Expected: `{"ok":true,"message":"Se o email for cadastrado..."}` e, se o e-mail existir no Supabase, chegada do e-mail de reset via Resend. Sem `RESEND_FROM`, esperado `503` com a mensagem de serviço não-configurado.

- [ ] **Step 5: Sanity do front (não deve ter sido afetado)**

Run (na raiz do repo): `npm run build`
Expected: build do Vite sem erro (WS2 não toca o front; confirma que nada quebrou no monorepo de pasta única).

- [ ] **Step 6: Abrir o PR**

```bash
git push -u origin feat/backend-resend
gh pr create --base main --title "feat(backend): migra e-mail de Brevo para Resend (WS2)" \
  --body "Migra todo o envio transacional do backend (reset cliente+manager, convites, contato, indicações) para Resend atrás de lib/mailer (testado com node --test). Parte do launch-readiness (WS2). Pré-cutover: setar RESEND_FROM no Vercel; manter BREVO_* para rollback."
```

---

## Self-Review (writing-plans)

**Cobertura do spec (WS2):** mailer único ✅ (Task 1) · 5 chamadas migradas — reset cliente (Task 2) · reset manager (Task 2) · convite+welcome (Task 3) · contato (Task 4) · indicação (Task 4) ✅ · `brevoConfigured`→`mailerConfigured` ✅ (Tasks 2–4) · `.env.example` Resend/Brevo-legado ✅ (Task 5) · semântica preservada (503/500 no reset; best-effort nos demais) ✅.

**Placeholders:** nenhum — todo passo tem código/comando concreto. O único valor a preencher é o e-mail de teste no smoke (Task 6, esperado).

**Consistência de tipos/nomes:** `sendEmail({ to, subject, html, replyTo })` e `mailerConfigured()` usados de forma idêntica em todas as rotas; `replyTo` é **string** (e-mail) em todos os call-sites (contact/referrals convertidos do objeto `{email,name}` do Brevo para string). `resendFrom()` testado nos dois formatos.

**Riscos:** (1) `RESEND_FROM` ausente ⇒ e-mails não saem — coberto por pré-condição + smoke. (2) Backend sem teste de rota — mitigado por mailer unit-testado + smoke manual. (3) Rollback = redeploy anterior (mantém `BREVO_*`).
