# Launch-Readiness — App do Cliente (Gest Miles Usuário) — Design

> Data: 2026-06-05 · Autor: Claude (dev sênior) + Rick (owner)
> Status: **spec pendente de revisão do owner** (nada implementado ainda)
> Escopo: auditoria de prontidão pro launch público do app do cliente (`gest-miles-usuario-front`).

## Contexto

Auditoria de launch-readiness do app do cliente. O diagnóstico (P0/P1/P2) foi feito sobre o
código real do repo, e revelou divergências do handoff vindo do manager-front:

- **E-mail:** TODOS os fluxos do backend usam Brevo. Não há código nem env de Resend neste
  repo (o handoff dizia que o reset já tinha migrado e que a infra Resend existia — falso aqui).
- **Bucket `contratos`:** existe (privado) mas está **vazio** (0 objetos). Backup não é blocker
  de launch — vira ops fast-follow antes do primeiro upload de contrato.

Decisões do owner que delimitam este escopo:

1. **E-mail:** migrar os fluxos pra **Resend agora** (todos).
2. **Stripe:** **congelar** (pivô mobile/IAP) — sem hardening de Stripe neste escopo.
3. **LGPD:** **mínimo legal** — aceite no cadastro + links pras páginas legais existentes +
   aviso de cookies informativo (só cookie funcional; não há analytics no front do cliente).
4. **Backup:** investigado — bucket `contratos` vazio → fast-follow ops.
5. **Execução:** **PRs pequenos por workstream**, sequenciado por severidade.
6. **Escopo:** manter os **6 workstreams**.

## Regra de ouro / guarda-corpos (do repo)

- **Gate de "pronto":** `npx tsc -b` limpo + `npm test` (Vitest) + `npm run build`.
  - ⚠️ O **backend não tem test runner** (`backend/package.json` sem script `test`). Mudanças de
    backend (WS2/WS3/WS4) são verificadas por **smoke local + review**, não por `npm test`. O
    gate `npm test`/`tsc -b`/`build` cobre o **front**.
- **Main anda rápido:** `git fetch` antes de cada WS; **branch + PR**, nunca push direto no main.
- **Banco compartilhado, sem staging:** **nenhuma migration** neste escopo. O rate-limit do reset
  (WS4) usa a tabela existente `password_reset_tokens` em **leitura** (count). Se algum WS exigir
  schema, **PARA e confirma com o owner**.
- **Zero Trust:** segredo nunca no bundle (`VITE_*`). Resend/Sentry DSN de backend só em
  `process.env`. Front só recebe `VITE_SENTRY_DSN` (DSN é público por design) e URLs legais.

---

## Diagnóstico priorizado (baseline)

### P0 — bloqueia launch
- **P0-1 LGPD:** sem aceite de Termos/Privacidade no cadastro (`src/pages/SignUp.tsx`). → WS1
- **P0-2 LGPD:** nenhuma rota/link legal no app do cliente. → WS1
- **P0-3 CORS (verificar):** allowlist do BFF depende de `CORS_ORIGINS`/`PUBLIC_APP_URL`; se o
  domínio do cliente não estiver lá, o app não fala com o backend em prod. → WS6

### P1 — corrigir antes/no launch
- **P1-1** Reset de senha = endpoint anônimo **sem rate-limit** (`auth.js:131` e `:212`). → WS4
- **P1-2** Zero observabilidade (sem Sentry no front e no backend). → WS3
- **P1-3** Aviso de cookies ausente (leve: só cookie funcional). → WS1
- **P1-4** E-mail tudo em Brevo, sem Resend → migrar. → WS2
- **P1-5** Sem smoke E2E automatizado do cliente. → WS5
- **P1-6** Backup do bucket `contratos` → **rebaixado a P2-ops** (bucket vazio). → WS6

### P2 — fast-follow
- **P2-1** Respostas de erro vazam `err.message` (`res.status(500).json({ error: err.message })`). → WS4
- **P2-2** Rota `invites` sem rate-limit (mitigado: admin_equipe-gated). → WS4
- **P2-3** Sem CSP no front; sem headers na API. → WS4
- **P2-4** `docs/release-checklist.md` desatualizado (2026-04-12). → WS6

**Não re-auditado** (já verificado limpo recentemente): rota `program-access` e fundação RLS.

---

## Workstreams

Cada WS = 1 branch + 1 PR. Critério de pronto por WS no fim de cada seção.

### WS1 — LGPD mínimo (P0, front)

**Objetivo:** tornar o cadastro juridicamente apresentável e avisar sobre cookies.

**Escopo (in):**
- `src/pages/SignUp.tsx`: checkbox controlado de aceite (Radix Checkbox — `@radix-ui/react-checkbox`
  já é dep; usar `components/ui/checkbox` se existir). Label com links pra **Termos** e **Privacidade**
  (`target="_blank" rel="noopener noreferrer"`). `canSubmit` passa a exigir `accepted`; o botão
  "Continuar com Google" também fica desabilitado até o aceite.
- `src/lib/legalUrls.ts` (novo): centraliza as URLs legais, lidas de env
  (`VITE_LEGAL_TERMS_URL`, `VITE_LEGAL_PRIVACY_URL`, `VITE_LEGAL_COOKIES_URL`) com fallback pro
  domínio manager/captação. Owner fornece as URLs canônicas.
- `src/components/CookieNotice.tsx` (novo): banner fixo no rodapé, informativo (sem toggles de
  consentimento — só cookie funcional), com link pra página de cookies e botão "Entendi". Dismiss
  persistido em `localStorage`. Montado uma vez no `App` (dentro dos providers, fora das rotas).

**Escopo (out):** páginas legais dentro do app; banner de consentimento com opções; registro
server-side do aceite (timestamp/versão) — anotado como fast-follow opcional, não bloqueia.

**Arquivos:** `src/pages/SignUp.tsx`, `src/lib/legalUrls.ts` (novo), `src/components/CookieNotice.tsx`
(novo), `src/App.tsx` (montar o banner), `.env.example` (novas `VITE_LEGAL_*`).

**Pré-condição (owner):** URLs canônicas de Termos / Privacidade / Cookies.

**Pronto quando:** `tsc -b` + `npm test` + `npm run build` limpos; testes novos —
SignUp (submit/Google bloqueados até aceitar) e CookieNotice (renderiza até dismiss, persiste).

---

### WS2 — Brevo → Resend (P1, backend)

**Objetivo:** migrar todo o envio de e-mail do backend pra Resend e aposentar Brevo.

**Escopo (in):**
- `backend/src/lib/mailer.js` (novo): `sendEmail({ to, subject, html, replyTo })` via Resend HTTP
  (`https://api.resend.com/emails`), `RESEND_API_KEY` + `RESEND_FROM` (sender verificado). Retorna
  `{ ok, reason }`, **nunca lança** (best-effort) — o caller decide se falha vira erro HTTP.
- Migrar as **5 chamadas Brevo** preservando a semântica atual:
  - `auth.js` reset cliente (`:131`) e reset manager (`:212`): hoje dão 500 em falha de envio e
    503 se não-configurado → manter (mailer não-configurado ⇒ 503; envio falho ⇒ 500).
  - `invites.js` `sendBrevoEmail` (convite + welcome): best-effort (warn, não falha o request).
  - `contact.js` (`:117`) e `referrals.js` (`:117`): best-effort.
- Renomear helpers `brevoConfigured()` → `mailerConfigured()`; remover leituras `BREVO_*`.
- `backend/.env.example`: adicionar `RESEND_API_KEY`, `RESEND_FROM`; `BREVO_*` viram legado
  comentado (rollback) até confirmação em prod.

**Escopo (out):** mudar o conteúdo/HTML dos e-mails (reaproveitar os templates atuais).

**Arquivos:** `backend/src/lib/mailer.js` (novo), `backend/src/routes/auth.js`,
`backend/src/routes/invites.js`, `backend/src/routes/contact.js`,
`backend/src/routes/referrals.js`, `backend/.env.example`.

**Pré-condição (owner/ops):** `RESEND_API_KEY` + domínio/sender verificado no Resend, no projeto
Vercel `gest-miles-usuario-front-api`. **Manter `BREVO_*` setado até o Resend ser confirmado em
prod** (caminho de rollback).

**Pronto quando:** smoke local de cada rota (configurado ⇒ Resend chamado / 503 quando faltando /
500 em envio falho no reset; best-effort não derruba contact/referrals/invites); `tsc -b`/`build`
do front seguem limpos (backend não tem test runner).

---

### WS3 — Sentry (P1, front + backend)

**Objetivo:** parar de lançar às cegas — capturar erros de runtime no front e no BFF.

**Escopo (in):**
- **Front:** `@sentry/react`. Init no entry (`src/main.tsx`/equivalente) guardado por
  `VITE_SENTRY_DSN` (sem DSN ⇒ no-op). `tracesSampleRate` baixo, `environment`, `release`.
  `beforeSend` scrub de PII. Integrar `src/components/AppErrorBoundary.tsx` →
  `Sentry.captureException` no catch.
- **Backend:** `@sentry/node`. Init no `index.js` guardado por `SENTRY_DSN`. Captura no
  error-handler global (overlap com WS4 — o handler reporta ao Sentry **e** sanitiza a resposta).
  Em serverless (Vercel), captura manual no middleware de erro (confiável).

**Arquivos:** front entry, `src/components/AppErrorBoundary.tsx`, `package.json` (+`@sentry/react`);
`backend/src/index.js`, `backend/package.json` (+`@sentry/node`); ambos `.env.example`.

**Pré-condição (owner):** `SENTRY_DSN` (front + backend) — 2 projetos Sentry novos ou reuso do
manager com `environment`/tags distintos.

**Pronto quando:** init guardado (sem DSN ⇒ no-op, testável no front); erro forçado aparece no
Sentry (validação manual com DSN de teste); gate do front limpo.

---

### WS4 — Hardening (P1/P2, backend + front)

**Objetivo:** fechar os vetores de abuso e vazamento conhecidos.

**Escopo (in):**
- **Rate-limit dos resets (P1-1):** em `auth.js` (reset cliente + manager). Serverless-safe,
  **sem migration**: após resolver email→uid, contar linhas de `password_reset_tokens` do uid nos
  últimos ~15 min; se ≥ N (ex.: 3), **não envia** e retorna o `ok` genérico (preserva
  anti-enumeração). E-mail desconhecido já retorna cedo sem enviar. Per-IP fica como fast-follow
  (exige store).
- **Error-handler global (P2-1):** `app.use((err, req, res, next) => …)` no fim do `index.js`:
  loga completo (+ Sentry do WS3) e responde mensagem **genérica** + status. Varrer os
  `res.status(500).json({ error: err.message })` (auth.js etc.) pra `next(err)`/genérico.
- **CSP no front (P2-3):** adicionar `Content-Security-Policy-Report-Only` no `vercel.json` da raiz
  primeiro (não quebra), com `connect-src` pro Supabase + ingest do Sentry + Google OAuth;
  endurecer pra enforce depois de validar. (Report-Only no launch, enforce fast-follow.)
- **Rate-limit invites (P2-2):** se barato, DB-count análogo; senão fast-follow.

**Arquivos:** `backend/src/routes/auth.js`, `backend/src/index.js`, `backend/src/routes/invites.js`
(opcional), `vercel.json` (raiz).

**Pronto quando:** reset acima do limite não envia e responde genérico; resposta de erro não vaza
`err.message`; CSP Report-Only presente sem quebrar o app (DevTools sem violação que bloqueie).

---

### WS5 — Smoke E2E do cliente (P1, verificação)

**Objetivo:** uma rede de segurança ponta-a-ponta do caminho feliz antes do launch.

**Escopo (in):**
- Playwright (devDep) + 1 spec de smoke em `e2e/`: login (conta de teste) → home → telas-chave
  (ex.: perfil, vencimentos, um programa) → logout. Mais um caso de **401/403 gracioso** (chamada
  ao BFF sem/erro de sessão não quebra a tela).
- Roda contra `npm run dev:all` local ou uma preview URL. Creds via env, **não commitadas**.

**Alternativa considerada:** rodar smoke ad-hoc via skill `webapp-testing` sem commitar Playwright.
Rejeitada: smoke commitado é durável e reusável pós-launch.

**Arquivos:** `e2e/*.spec.ts` (novo), `playwright.config.ts` (novo), `package.json` (devDep + script
`test:e2e`).

**Pré-condição (owner):** conta de teste cliente (e-mail/senha) pro smoke.

**Pronto quando:** smoke passa localmente; `tsc -b`/`npm test`/`build` seguem limpos. Roda **por
último**, validando o conjunto dos outros WS.

---

### WS6 — CORS prod + backup do bucket (P0-verify / P2-ops)

**Objetivo:** garantir que o app fala com o BFF em prod e documentar o backup pendente.

**Escopo (in):**
- **CORS (P0-3):** confirmar que `CORS_ORIGINS`/`PUBLIC_APP_URL` no Vercel do backend incluem o
  domínio público do cliente. Como o Vercel CLI não está instalado, owner confirma o valor; do lado
  do código, **adicionar o domínio prod do cliente ao `STATIC_ALLOWED_ORIGINS`** (`index.js`) como
  defesa-em-profundidade (pendente o owner informar o domínio).
- **Backup `contratos`:** bucket existe e está **vazio**. Documentar em `docs/release-checklist.md`
  (e atualizar o checklist desatualizado — P2-4) que o backup de Storage do bucket `contratos` deve
  ser configurado **antes** do primeiro upload de contrato. Sem ação de código urgente.

**Arquivos:** `backend/src/index.js` (allowlist), `docs/release-checklist.md`.

**Pré-condição (owner):** domínio público do cliente + acesso ao Vercel env do backend.

**Pronto quando:** domínio do cliente confirmado na allowlist/env; checklist atualizado com a nota
de backup.

---

## Pré-condições consolidadas (dependem do owner/ops)

| # | O que | Bloqueia |
|---|-------|----------|
| 1 | URLs canônicas Termos / Privacidade / Cookies | WS1 |
| 2 | ✅ `RESEND_API_KEY` na Vercel (confirmado pelo owner 2026-06-05) — falta validar sender/domínio | WS2 |
| 3 | `SENTRY_DSN` front + backend | WS3 |
| 4 | Domínio público do cliente + acesso ao Vercel env do backend | WS6 |
| 5 | Conta de teste cliente | WS5 |

Prontos pra começar já: **WS4** (sem pré-condição), **WS2** (`RESEND_API_KEY` confirmado) e a
parte de código do **WS6**.

## Sequência (Approach A — PRs pequenos por severidade)

1. **Destravar:** WS6-CORS (verificação) ‖ WS1-LGPD (P0).
2. **Backend:** WS2-Resend → WS4-Hardening (arquivos próximos; sequenciar p/ evitar conflito) ‖ WS3-Sentry.
3. **Fechar:** WS5-Smoke E2E (valida o conjunto).

`git fetch` antes de cada WS. Cada WS: branch → implementação → gate → PR.

## Riscos & notas

- **Backend sem test runner:** WS2/3/4 verificados por smoke local + review, não por `npm test`.
- **Cutover de e-mail:** manter `BREVO_*` em prod até o Resend ser confirmado (rollback).
- **CSP:** começar Report-Only pra não quebrar OAuth/Supabase/Sentry; enforce é fast-follow.
- **Sem migration:** se qualquer WS exigir schema, PARA e confirma (banco compartilhado, sem staging).
- **Registro de consentimento LGPD** (timestamp/versão server-side) fica como fast-follow opcional.

## Fora de escopo (decisões do owner)

- Hardening de Stripe (congelado — pivô mobile/IAP).
- Páginas legais dentro do app + banner de consentimento com opções (escolhido: mínimo).
- Backup ativo do bucket `contratos` agora (vazio → ops fast-follow).
