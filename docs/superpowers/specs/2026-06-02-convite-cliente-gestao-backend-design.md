# Convite gestor → cliente_gestão — Backend (Fase 1)

**Data:** 2026-06-02
**Repo:** `gest-miles-usuario-front` (BFF Express em `backend/`)
**Status:** desenho aprovado pelo owner (Fase 1 = backend deste repo; 1 PR).

## Objetivo

Tornar funcional o fluxo de convite por e-mail **`admin_equipe` → futuro `cliente_gestao`**, implementando as 4 rotas que o front já consome mas que hoje **dão 404**. Ao final, um `admin_equipe` (via script nesta fase; via UI do Manager na Fase 2) consegue convidar alguém por e-mail; a pessoa se cadastra com aquele e-mail e é elevada a `cliente_gestao` vinculada à equipe de quem convidou.

Hoje: `grep -rin invite backend/src/` = zero; `convites_cliente_gestao` existe em prod com **0 linhas** (capacidade nova, não conserto de algo em uso).

## Não-objetivos (fora desta fase)

- **UI de criação no Manager** (`admin_equipe` clicando "Convidar") — é a **Fase 2**, cross-repo, PR separado no `gest-miles-manager-front`.
- **Organização / CNPJ** (`organizacoes_cliente`, `perfis.organizacao_id`) — a migration previu, mas ninguém usa; não entra.
- **Vínculo em `cliente_gestores`** — o accept concede só `role` + `equipe_id`. Sem criar linhas de carteira.
- **Migration** — a tabela e as colunas já estão em prod. **Nenhuma DDL.**
- Mudança de front — `AcceptInvite.tsx`/`Me.tsx` já consomem os endpoints; a Fase 1 só faz o backend responder. (Só tocar no front se um contrato divergir.)

## Peças que já existem

- **Front consumidor (sem mudança esperada):**
  - `src/pages/AcceptInvite.tsx` → `GET /api/invites/preview?token=` (plain `fetch` via `getApiUrl`), guarda o raw token em `sessionStorage[PENDING_INVITE_TOKEN_KEY]`, exige cadastro com o mesmo e-mail.
  - `src/pages/Me.tsx` → após `ensure_self_cliente_profile`, se há `PENDING_INVITE_TOKEN_KEY` chama `POST /api/invites/accept` `{token}` (Bearer); e **sempre** (todo novo usuário) chama `POST /api/invites/welcome` `{}` (Bearer). Ambos hoje em `catch {}`.
  - Rota pública `/auth/accept-invite` já existe em `src/App.tsx`.
- **Tabela `convites_cliente_gestao`** (migration `20260411140000_email_auth_flow.sql`, aplicada em prod): `id, token_hash unique, email, equipe_id, invited_by, expires_at, consumed_at, consumed_by, created_at`. RLS ON, **sem policy p/ authenticated** → só service role (padrão idêntico ao `password_reset_tokens`).
- **Padrão de backend a espelhar:** `backend/src/routes/auth.js` (password-reset): `crypto.randomBytes(32).toString("hex")` → `sha256Hex` (guarda só hash); `assertSupabaseService()` p/ tabela bloqueada; Brevo (`BREVO_API_KEY`/`BREVO_SENDER_EMAIL`/`PUBLIC_APP_URL`); consumo = valida exists/not-consumed/not-expired → ação → marca `consumed_at`.
- **Montagem de rota:** `backend/src/index.js` → `routes.use("/api/<nome>", router)`. Adicionar `routes.use("/api/invites", invitesRoutes)`.

## Arquitetura — `backend/src/routes/invites.js`

Novo router montado em `/api/invites`. Helpers reaproveitados/duplicados de `auth.js`: `sha256Hex`, `isValidEmail`, `escapeHtml`, envio Brevo. (Se o esforço de extrair `auth.js`→helpers compartilhados for baixo, extrair `sha256Hex`/`isValidEmail`/`escapeHtml`/`sendBrevoEmail` p/ `backend/src/lib/`; senão, duplicar com nota — decisão na implementação, sem refatorar o reset.)

### 1) `POST /api/invites` — criar (autor = `admin_equipe`)

- Middleware `requireAuth` (Bearer).
- **Revalida no servidor** (Zero Trust): `createSupabaseWithAuth(token).auth.getUser()` → lê `perfis(role, equipe_id)` do autor. Exige `role === 'admin_equipe'` **e** `equipe_id` não-nulo. Senão `403`.
- Body `{ email }`. Valida `isValidEmail` → senão `400`.
- Exige Brevo configurado (`BREVO_API_KEY`/`BREVO_SENDER_EMAIL`), senão `503` (igual reset).
- **Supersede:** marca convites anteriores **não consumidos** do mesmo `lower(email)` como expirados (`expires_at = now()`) — garante 1 token válido por e-mail.
- Gera `rawToken = randomBytes(32).hex`, `token_hash = sha256(rawToken)`, `expires_at = now()+7d`.
- `service.from("convites_cliente_gestao").insert({ token_hash, email: lower(email), equipe_id: autor.equipe_id, invited_by: autor.id, expires_at })`.
- Envia e-mail Brevo (template roxo Gest Miles) com `link = ${PUBLIC_APP_URL}/auth/accept-invite?token=${rawToken}`.
- Resposta `200 {ok:true}`. (Não vaza se o e-mail já tem conta — neutro.)
- **Convêniencia de teste (dev-only):** quando `!process.env.VERCEL` (dev local), incluir `devToken: rawToken` no corpo da resposta pro script E2E capturar. **Em prod (`VERCEL` setado) NUNCA** retornar o token. (Guard explícito; o raw só viaja no e-mail em prod.)

### 2) `GET /api/invites/preview?token=` — público

- Sem auth (é pré-cadastro).
- `token` da query → `400` se ausente.
- `hash = sha256(token)`; `service.from(...).select("email, expires_at, consumed_at").eq("token_hash", hash).maybeSingle()`.
- Inválido / consumido / expirado → `400 {error}` (mensagem genérica; o front já normaliza).
- Válido → `200 { emailMasked }`. Máscara: preserva 1º char do local-part e domínio (`j***@e***.com`); helper `maskEmail`.

### 3) `POST /api/invites/accept` — consumir (sensível)

- `requireAuth`; `user = getUser(token)`.
- Body `{ token }` (raw) → `400` se ausente.
- `hash = sha256(token)`; carrega convite (`id, email, equipe_id, expires_at, consumed_at`).
- Validações → `400`/`409`:
  - não existe → `400` inválido.
  - `consumed_at` != null → `409` já utilizado.
  - `expires_at < now()` → `400` expirado.
  - **`lower(user.email) !== lower(invite.email)`** → `403` "convite é para outro e-mail". (Impede que quem logou com outro e-mail consuma.)
- **Claim atômico** (anti-corrida): `update convites set consumed_at=now(), consumed_by=user.id where id=invite.id and consumed_at is null returning id`. Se 0 linhas → `409` (corrida).
- **Concede:** `service.from("perfis").update({ role: 'cliente_gestao', equipe_id: invite.equipe_id }).eq("usuario_id", user.id)`. (O `perfis` já existe — `Me.tsx` chama `ensure_self_cliente_profile` antes.)
- `200 {ok:true}`. Front faz `refreshRole()` depois.
- **Decisão:** se o usuário já era `cliente_gestao`/tinha equipe, o accept **sobrescreve** com a equipe do convite (intencional: o convite é a autorização). Caso de uso normal é usuário novo (role `cliente`).

### 4) `POST /api/invites/welcome` — e-mail de boas-vindas (best-effort)

- `requireAuth`; `user = getUser`. **Não é específico de convite** — `Me.tsx` chama p/ todo novo usuário.
- Idempotência: lê `perfis.email_boas_vindas_enviado_at`; se já setado → `200 {ok:true, skipped:true}` sem reenviar.
- Resolve 1º nome (helper já existe em `auth.js`), envia e-mail Brevo de boas-vindas, seta `email_boas_vindas_enviado_at = now()`.
- Erros de e-mail não devem quebrar o onboarding → sempre responder `200` salvo erro interno; o front já está em `catch`.

## Modelo de segurança (Zero Trust)

- A tabela é **invisível ao browser** (sem policy p/ authenticated). Toda leitura/escrita é **service role no backend**.
- **A posse do token + match de e-mail é a autorização** do accept; o backend é a verdade. Concessão de `role`/`equipe_id` só acontece após claim atômico do token válido.
- Criação exige **revalidação de role no servidor** (`admin_equipe` + `equipe_id`), nunca confia no front.
- Token só em **hash** (nunca plaintext no banco). Raw token só viaja no link do e-mail.
- `escapeHtml` em qualquer valor interpolado no HTML do e-mail.
- `security-review` obrigatório antes de mergear (toca auth + concede privilégio).

## Casos de borda / decisões

- **E-mail já cadastrado:** criar convite não falha (neutro). No accept, se a pessoa logar com o e-mail do convite (mesmo sendo conta antiga), é elevada. Aceito nesta fase.
- **Expiração:** 7 dias (onboarding), vs 1h do reset.
- **Reuso/duplo-consumo:** claim atômico cobre corrida; `consumed_at` cobre replay.
- **Sem equipe no autor:** `admin_equipe` sem `equipe_id` → `403` (não dá pra vincular).
- **Brevo off:** `503` no create; welcome degrada gracioso.

## Estratégia de teste (⚠️ prod compartilhada, sem staging)

- **Helpers puros** (`maskEmail`, validação de e-mail, ordenação de validação) → testáveis isolados. Avaliar adicionar um runner mínimo ao backend (Vitest node) OU testar via script — decisão no plano.
- **E2E controlado, com limpeza:** script Node bate no backend local (`npm run dev:backend`, :3040, aponta pro Supabase remoto). Passos: (1) obter Bearer de um `admin_equipe` de teste; (2) `POST /api/invites` com e-mail descartável → captura `devToken` do corpo (dev-only); (3) `preview?token=devToken` → confere `emailMasked`; (4) logar/criar conta descartável com esse e-mail, `accept {token: devToken}` → confere via MCP `perfis.role='cliente_gestao'` + `equipe_id`; (5) **limpeza:** `delete` da linha em `convites_cliente_gestao` + reset do `role/equipe_id/email_boas_vindas_enviado_at` da conta de teste. Cleanup explícito via MCP. **Não usar contas reais.** ⚠️ Precisa de um `admin_equipe` de teste com `equipe_id` (pedir ao owner ou criar/limpar) — sem ele, o create dá 403 por design.
- Verificar erros: token inválido/expirado/consumido, e-mail divergente (403), autor não-`admin_equipe` (403).

## Arquivos

- **Novo:** `backend/src/routes/invites.js` (4 rotas + helpers/templates).
- **Editar:** `backend/src/index.js` (import + `routes.use("/api/invites", invitesRoutes)`).
- **Possível novo:** `backend/src/lib/` helpers compartilhados (se extração de `auth.js` for barata) — opcional.
- **Possível novo:** script de validação E2E (`scripts/` ou `backend/scripts/`), descartável.
- Front: **sem mudança** (revalidar contratos preview/accept/welcome ao testar).

## Gate de verificação (antes de "pronto")

- `npx tsc -b` limpo (front intacto) + `npm test` (Vitest front) verde + `npm run build`.
- Backend: lint/parse ok; E2E controlado passou com limpeza; rotas respondem (não-404).
- `security-review` da mudança.
- PR no `usuario-front` (branch a partir de `origin/main` fresco; nunca push direto). Deploy do backend é automático no merge (projeto Vercel `gest-miles-usuario-front-api`).

## Fase 2 (registrar, fora deste PR)

UI no Manager (`gest-miles-manager-front`) para `admin_equipe`: form "Convidar cliente gestão" (e-mail) → `POST /api/invites` com Bearer. CORS já libera `manager.gestmiles.com.br`. PR separado, cross-repo.
