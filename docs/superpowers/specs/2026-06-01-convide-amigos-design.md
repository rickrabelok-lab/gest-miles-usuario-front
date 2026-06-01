# Convide Amigos — indicação com atribuição (design)

**Data:** 2026-06-01
**Status:** aprovado (aguardando review do spec antes do plano)
**Origem:** caça a bugs / Fase 1 (hardening) — `ConvideAmigosPage` era um form com botão morto (`type="button"` sem `onClick`); o cliente digitava o e-mail, clicava "Gerar convite" e nada acontecia. Owner decidiu **construir a feature** (ciclo 2 dos forms-stub; ciclo 1 = Fale Conosco).

> Banco é **produção compartilhada sem staging** (`jntkpcjmmnaghmimdcam`, mesmo do manager/admin). Migration vai no repo canônico (`gest-miles-manager-front`) e só é aplicada em prod **com OK explícito do owner**.

> **Distinto do convite gestor→cliente** (`convites_cliente_gestao`, meio-construído e fora deste ciclo). Aqui é **referral cliente→amigo**: nenhuma tabela de referral existe em prod hoje (verificado via MCP — só existem `convites_cliente_gestao` e `nps_convites`).

---

## 1. Escopo & fronteiras

**Dentro deste ciclo:**
1. Migration (manager-front): tabelas `indicacao_codigos` e `indicacoes` (+ RLS/grants/índices) e 2 RPCs `SECURITY DEFINER` (`indicacao_meu_resumo`, `indicacao_registrar_self`).
2. Rota `POST /api/referrals/invite` no backend Express (usuario-front) — e-mail de convite via Brevo.
3. `ConvideAmigosPage` ligada de verdade: link de indicação (copiar), contador, campo de e-mail + envio.
4. Captura do `?ref=` no `SignUp.tsx` + atribuição pós-cadastro no `Me.tsx`.
5. `src/lib/indicacao.ts` + testes (front Vitest/RTL; backend smoke).
6. Doc de env (`backend/.env.example`).

**Fora (deferido, NÃO neste ciclo):**
- **Recompensa** (bônus/crédito a quem indica ou ao indicado) — só **registramos a atribuição** agora; a base de dados permite calcular depois.
- Lista de indicados na tela do cliente (só **contador** agregado, sem expor e-mails/nomes).
- UI de leitura no manager/admin (a tabela existe; ciclo separado).
- Atribuição por Google/OAuth com reconciliação avançada por e-mail (best-effort apenas — ver §3).
- Anti-abuso além de `requireAuth` + guardas do RPC (no-self-ref, idempotência, só conta nova).

---

## 2. Modelo de dados

Padrão seguro do repo (igual `cliente_programa_acessos`): **sem RLS de escrita/leitura pra `authenticated`**; todo acesso via **RPC `SECURITY DEFINER`** (autoridade = `auth.uid()`) ou **backend service role**.

### 2.1 `indicacao_codigos` — código curto por indicador

| coluna | tipo | constraint / default | nota |
|---|---|---|---|
| `usuario_id` | uuid | **pk** | dono do código (= `perfis.usuario_id`) |
| `codigo` | text | not null, **unique** | curto, ~8 chars, alfabeto sem ambíguos (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`) |
| `created_at` | timestamptz | not null, default `now()` | |

- Um código por cliente, **criado sob demanda** (1ª vez que abre a tela ou envia convite) via RPC/função.
- **RLS:** enable; `revoke all from anon, authenticated`; `grant all to service_role`. Leitura do cliente acontece **só via RPC** `indicacao_meu_resumo` (definer) — não há policy de select pra `authenticated`. (Mantém o link/código fora de queries diretas do browser; o RPC entrega só o do próprio usuário.)

### 2.2 `indicacoes` — convites + atribuições

| coluna | tipo | constraint / default | nota |
|---|---|---|---|
| `id` | uuid | pk, default `gen_random_uuid()` | |
| `indicador_usuario_id` | uuid | not null | quem indicou |
| `indicado_usuario_id` | uuid | null | preenchido quando o amigo se cadastra |
| `indicado_email` | text | null | snapshot do e-mail no convite por e-mail (lower/trim) |
| `status` | text | not null, default `'convidado'`, check `in ('convidado','cadastrado')` | |
| `origem` | text | not null, check `in ('email','link')` | `email` = convite disparado; `link` = atribuição só pelo link |
| `created_at` | timestamptz | not null, default `now()` | |
| `registered_at` | timestamptz | null | quando virou `cadastrado` |

- **Idempotência da atribuição:** índice único parcial `unique (indicado_usuario_id) where indicado_usuario_id is not null` → **1 atribuição por amigo** (primeiro vence). Auto-indicação é barrada no RPC.
- **RLS:** enable; `revoke all from anon, authenticated`; `grant all to service_role`. **Sem policy pra `authenticated`** — leitura agregada (contador) só via RPC definer; escrita só via RPC definer (atribuição) ou backend service role (convite por e-mail). Casa com o padrão de segredos do repo.
- **Índices:** `(indicador_usuario_id)` (contador/uso), `(lower(indicado_email))` parcial `where indicado_email is not null` (reconciliação do convite por e-mail).

---

## 3. Contrato de servidor (Zero Trust)

### 3.1 RPC `indicacao_meu_resumo()` → json
`SECURITY DEFINER`, `grant execute to authenticated`. Sem args.
- Resolve `v_uid := auth.uid()`; se null → erro (não autenticado).
- **Get-or-create** o código de `v_uid` em `indicacao_codigos` (gera código único; retry em colisão).
- Retorna `{ "codigo": text, "total_cadastrados": int }`, onde `total_cadastrados = count(*) from indicacoes where indicador_usuario_id = v_uid and indicado_usuario_id is not null`.
- Usado pela tela pra montar o link (`?ref=codigo`) e mostrar o contador.

### 3.2 RPC `indicacao_registrar_self(p_codigo text)` → boolean
`SECURITY DEFINER`, `grant execute to authenticated`. Chamada pelo **amigo recém-cadastrado**.
- `v_uid := auth.uid()` (= o **indicado**, a autoridade). Null → erro.
- Normaliza `p_codigo` (trim/upper). Vazio → retorna `false` (no-op gracioso).
- Resolve `v_indicador := usuario_id from indicacao_codigos where codigo = p_codigo`. Não achou → `false`.
- **Guardas:**
  - `v_indicador = v_uid` (auto-indicação) → `false`.
  - Já existe linha com `indicado_usuario_id = v_uid` (já atribuído) → `false` (idempotente).
- **Reconciliação best-effort:** se existir linha `convidado` desse indicador batendo o e-mail do indicado (`indicado_email = lower(<email do indicado>)`, lido de `auth.users`/`perfis` dentro do definer) e ainda sem `indicado_usuario_id` → **UPDATE** dela (`status='cadastrado'`, `indicado_usuario_id=v_uid`, `registered_at=now()`). Senão → **INSERT** nova (`origem='link'`, `status='cadastrado'`, `registered_at=now()`).
- Conflito no índice único (corrida) → tratado como já-atribuído → `false`. Retorna `true` na atribuição feita.

> **Por que RPC (não backend) pra atribuição:** é escrita pura no banco, sem segredo, e a autoridade natural é `auth.uid()` do indicado. RPC `SECURITY DEFINER` é o encaixe Zero-Trust limpo (mesmo padrão de `cliente_perfil_save_self`, `ensure_self_cliente_profile`).

### 3.3 Backend `POST /api/referrals/invite` (espelha `contact.js`)
Novo `backend/src/routes/referrals.js`, montado em `index.js`: `routes.use("/api/referrals", referralsRoutes)`.
- `requireAuth` → Bearer revalidado (`getUser`).
- Body `{ email }`. **Validação no backend:** e-mail trim/lower, regex simples, ≤ 254 chars → 400 se inválido. Bloqueia enviar pro **próprio** e-mail (auto-convite) → 400.
- Service role: lê `perfis` (`nome_completo`, `email`) do remetente; **get-or-create** o `codigo` do remetente em `indicacao_codigos` (não confia em código vindo do body — deriva do `user.id`).
- `INSERT` em `indicacoes` (`indicador_usuario_id=user.id`, `indicado_email=email`, `status='convidado'`, `origem='email'`). (Sem dedupe forte de convite; convidar 2x gera 2 linhas `convidado` — aceitável, o contador só conta `cadastrado`.)
- **E-mail Brevo best-effort** (não derruba o sucesso): `to` = amigo; `replyTo` = e-mail do remetente; template branded (reusa o visual do `contact.js`/`auth.js`) com CTA pro link `${APP_URL}/auth/sign-up?ref=<codigo>`. `APP_URL` = `process.env.PUBLIC_APP_URL` (fallback já usado no backend). Sem chave Brevo → `console.warn` e segue.
- Retorna `{ ok: true }`.

---

## 4. Frontend

### 4.1 `ConvideAmigosPage` (reescrita do stub)
Mantém o shell visual (header, card). Ao montar:
- `supabase.rpc('indicacao_meu_resumo')` → `{ codigo, total_cadastrados }`. Estados de loading/erro graciosos.
- Monta `link = ${appOrigin}/auth/sign-up?ref=${codigo}` (`appOrigin = (VITE_APP_URL)?.replace(/\/$/,'') || window.location.origin`, padrão do `ForgotPassword.tsx`).
- **Bloco link:** campo read-only com o link + botão **Copiar** (`navigator.clipboard.writeText`, toast "Link copiado!"; fallback se clipboard indisponível).
- **Contador:** "X amigos já se cadastraram pelo seu link" (de `total_cadastrados`; some/zero-state amigável quando 0).
- **Bloco e-mail:** campo de e-mail + botão **Enviar convite** → `enviarConviteIndicacao({ email, token })` (toast/loading/disabled igual `FaleConoscoPage`). Sucesso → toast + limpa o campo.

### 4.2 `src/lib/indicacao.ts` (espelha `contato.ts`)
- `enviarConviteIndicacao({ email, token }): Promise<{ ok: boolean }>` → valida e-mail (UX) e `apiFetch('/api/referrals/invite', { method:'POST', body: JSON.stringify({ email }), token })`.

### 4.3 Captura do `?ref=` — `SignUp.tsx`
- Adiciona em `authFlowStorage.ts`: `export const PENDING_REFERRAL_CODE_KEY = "gestmiles_pending_referral_code";`
- No `SignUp`, `const ref = searchParams.get("ref")`; se presente, `sessionStorage.setItem(PENDING_REFERRAL_CODE_KEY, ref)` (espelha `AcceptInvite.tsx:52`). Persiste pelo redirect do Google (sessionStorage sobrevive ao round-trip same-tab) e pela navegação pro `/me`.
- Opcional (UX leve): banner discreto "Você foi convidado por um amigo" quando `ref` presente (não bloqueia nada).

### 4.4 Atribuição — `Me.tsx` (ramo de usuário novo)
- **Dentro do bloco de criação de perfil** (após `ensure_self_cliente_profile` + `refreshRole`, ~linha 84), ler `sessionStorage.getItem(PENDING_REFERRAL_CODE_KEY)`; se houver: `await supabase.rpc('indicacao_registrar_self', { p_codigo })` (try/catch gracioso) e **remover a chave**.
- ⭐ Colocar **só no ramo novo** garante que **apenas cadastros novos atribuem**: usuário existente faz early-return (linha ~56) e nunca chega aqui. Limpar a chave também no early-return (defensivo, evita vazar pra sessão futura).
- Falha do RPC nunca quebra o onboarding (mesma postura dos `/api/invites/*`).

---

## 5. Tratamento de erro & Zero Trust

- Front-validation é só UX; **RPC e backend revalidam** (autoridade).
- `requireAuth` no convite por e-mail (anti-spam anônimo); RPC exige `auth.uid()`.
- Guardas server-side: no-self-ref, idempotência (índice único), só conta nova (via posição no `Me.tsx` + RPC defensivo).
- E-mail best-effort: a linha `convidado` é gravada **antes** de tentar o e-mail; falha de Brevo não derruba.
- `indicacoes`/`indicacao_codigos` **não são legíveis pelo browser**; contador e código saem só do RPC definer (do próprio usuário). Sem expor quem-indicou-quem ao cliente.
- Código no link não é segredo (é um identificador de indicação); a atribuição valida no servidor.

---

## 6. Testes

**Front (Vitest + Testing Library, PT-BR, `vi.clearAllMocks()` no `beforeEach`):**
- `lib/indicacao.test.ts` (espelha `contato.test.ts`): e-mail vazio/ inválido → erro, **não** chama `apiFetch`; e-mail válido → `apiFetch('/api/referrals/invite', POST, { email })`.
- `ConvideAmigosPage`: render com RPC mockada → mostra link/contador; clicar Copiar → `clipboard.writeText` com o link; enviar e-mail válido → chama helper + toast + limpa; erro → toast, preserva campo. Mockar `@/lib/supabase` (rpc + sessão) e `@/services/api`.
- (Opcional) `Me.tsx` / captura: teste de que `?ref=` vira `sessionStorage` no SignUp; que o ramo novo chama `indicacao_registrar_self` e limpa a chave. Avaliar custo/benefício na fase de plano (Me.tsx tem efeito complexo).

**Backend:** se houver harness no `backend/`, teste de rota (válido → 200 + insert + brevo; inválido → 400; sem auth → 401), service role e fetch mockados. Senão, smoke via Playwright.

**Smoke E2E (Playwright, launcher `py`, 2 contas):**
1. Login cliente A → `/convide-amigos` → vê link + contador (X).
2. Copiar link / extrair `?ref=` → abrir como anônimo → cadastrar **cliente B novo** pelo link → cair no `/me`.
3. Via MCP read-only: confirmar linha `cadastrado` em `indicacoes` (indicador=A, indicado=B). Recarregar `/convide-amigos` de A → contador = X+1.
4. Enviar convite por e-mail (A) → toast sucesso + linha `convidado` gravada.
5. Limpar linhas/contas de teste de prod ao final.

---

## 7. Entregáveis / deploy / ordem

1. **PR no `gest-miles-manager-front`** (repo canônico): migration (begin/commit, timestamp `YYYYMMDDHHMMSS`, branqueada de `origin/main`, idempotente; **git worktree** — há agente paralelo) com as 2 tabelas + RLS/grants/índices + as 2 RPCs. **Aplicar em prod só com OK do owner** (MCP `apply_migration` ou runner da equipe).
2. **PR no `gest-miles-usuario-front`**: `backend/src/routes/referrals.js` + montagem no `index.js` + `ConvideAmigosPage` + `src/lib/indicacao.ts` + `authFlowStorage.ts` + `SignUp.tsx` + `Me.tsx` + testes + `backend/.env.example`.
3. **Ordem de deploy:** migration **aplicada antes** do deploy do backend e do front (a tela chama o RPC; a rota insere nas tabelas). Coordenar. Atenção ao deploy do backend na Vercel (histórico de rate-limit no plano free — ver Fale Conosco).
4. **Env:** confirmar `PUBLIC_APP_URL` no backend (link do convite) e `VITE_APP_URL` no front (link copiável); documentar no `.env.example` se faltar. Brevo já configurado (reusa o do Fale Conosco/auth).

**Gate antes de "pronto"** (TS frouxo, build não type-checka): `npx tsc -b` + `npm test` + `npm run build`. Validação em runtime via smoke Playwright.

---

## 8. Decisões registradas
- **Identidade:** código curto em `indicacao_codigos` (Approach 1), não `usuario_id` no link nem token-por-convite. Link bonito/compartilhável vale a tabela a mais.
- **Mecânica:** link copiável **+** convite por e-mail (Brevo). Contador agregado, sem lista.
- **Recompensa:** fora deste ciclo (só atribuição; base pronta pra calcular depois).
- **Atribuição:** RPC `SECURITY DEFINER` (autoridade `auth.uid()` do indicado), ancorada no ramo de usuário novo do `Me.tsx` → só conta nova atribui. Convite por e-mail = backend (chave Brevo é backend-only).
- **Segurança:** `indicacoes`/`indicacao_codigos` sem RLS pra `authenticated` (só RPC definer + service role), padrão dos segredos do repo. Sem UI no manager agora.
