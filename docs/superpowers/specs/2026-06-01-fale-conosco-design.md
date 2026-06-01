# Fale Conosco — e-mail + registro (design)

**Data:** 2026-06-01
**Status:** aprovado (aguardando review do spec antes do plano)
**Origem:** caça a bugs / Fase 1 (hardening) — `FaleConoscoPage` era um form com botão morto (`type="button"` sem `onClick`); o usuário preenchia, clicava e nada acontecia. Owner decidiu **construir a feature**.

> Banco é **produção compartilhada sem staging** (`jntkpcjmmnaghmimdcam`, mesmo do manager/admin). Migration vai no repo canônico (`gest-miles-manager-front`) e só é aplicada em prod **com OK explícito do owner**.

---

## 1. Escopo & fronteiras

**Dentro deste ciclo:**
1. Migration (manager-front) criando a tabela `mensagens_contato` (+ RLS + grants + índices).
2. Rota `POST /api/contact` no backend Express (usuario-front).
3. `FaleConoscoPage` ligada de verdade (form controlado + submit + estados).
4. Testes (front Vitest/RTL; backend se houver harness, senão smoke Playwright).
5. Doc de variável de ambiente (`backend/.env.example`).

**Fora (deferido, NÃO neste ciclo):**
- UI de leitura no manager/admin (ciclo separado — o e-mail já notifica a equipe).
- Workflow de transição de status (`lida`/`respondida`).
- Rate-limiting avançado / antiabuso além do `requireAuth`.
- Histórico de mensagens no lado do cliente (a tela não tem listagem).

---

## 2. Modelo de dados — `mensagens_contato`

Tabela nova (não existe em prod — verificado via MCP em 2026-06-01).

| coluna | tipo | constraint / default | nota |
|---|---|---|---|
| `id` | uuid | pk, default `gen_random_uuid()` | |
| `cliente_usuario_id` | uuid | not null | = `auth.uid()` / `perfis.usuario_id` do remetente |
| `equipe_id` | uuid | null | snapshot do `perfis.equipe_id` (filtro futuro no manager) |
| `nome` | text | null | snapshot `perfis.nome_completo` |
| `email_contato` | text | null | snapshot do e-mail do cliente (p/ reply) |
| `assunto` | text | not null | |
| `mensagem` | text | not null | |
| `status` | text | not null, default `'nova'`, check `in ('nova','lida','respondida')` | lifecycle gerido no manager (futuro) |
| `origem` | text | not null, default `'usuario_app'` | de onde veio |
| `created_at` | timestamptz | not null, default `now()` | |

**RLS (padrão Zero Trust do repo):**
- `alter table public.mensagens_contato enable row level security;`
- `revoke all on public.mensagens_contato from anon;`
- **Sem policy de INSERT/UPDATE/DELETE pra `authenticated`** — quem escreve é o backend via **service role** (que bypassa RLS). O cliente NÃO insere direto.
- **SELECT só pra staff que gerencia o cliente:**
  ```sql
  create policy mensagens_contato_select_staff on public.mensagens_contato
    for select to authenticated
    using (public.can_view_perfil(cliente_usuario_id));
  ```
  (`can_view_perfil(target_usuario_id uuid) returns bool` — confirmado em prod.)
- `grant select on public.mensagens_contato to authenticated;` (filtrado pela policy acima)
- `grant all on public.mensagens_contato to service_role;`

**Índices:** `(equipe_id, created_at desc)` e `(cliente_usuario_id)` — para o manager filtrar por equipe/cliente no futuro.

**Por que service-role-write + staff-read (e não RPC `SECURITY DEFINER` do cliente):** o backend já precisa rodar para enviar o e-mail (chave Brevo é backend-only). Concentrar a escrita no backend mantém uma única autoridade (Zero Trust), evita expor INSERT ao browser e casa com o padrão de `password_reset_tokens` (service role escreve). Não é "segredo" como `cliente_programa_acessos`, mas a leitura fica restrita ao staff que gerencia o cliente.

---

## 3. Backend — `POST /api/contact`

Novo arquivo `backend/src/routes/contact.js`, montado em `backend/src/index.js`:
```js
routes.use("/api/contact", contactRoutes);
```

**Fluxo:**
1. `requireAuth` (middleware existente) → `req.user.id` (Bearer revalidado no servidor).
2. Body `{ assunto, mensagem }`. **Validação no backend** (front é só UX):
   - `assunto`: trim, 3–120 chars → 400 `{ error }` se fora.
   - `mensagem`: trim, 5–2000 chars → 400 se fora.
3. Service role (`supabaseService`): lê `perfis` (`nome_completo`, `email`, `equipe_id`) por `usuario_id = req.user.id`.
4. `INSERT` em `mensagens_contato` (service role) com snapshots, `status='nova'`, `origem='usuario_app'`. Se falhar → 500.
5. **E-mail Brevo (best-effort, NÃO bloqueia o sucesso):**
   - destino: `process.env.CONTACT_INBOX_EMAIL || 'gestmilesapp@gmail.com'` (e-mail temporário; troca por env quando houver profissional).
   - `sender`: `{ name: BREVO_SENDER_NAME || 'Gest Miles', email: BREVO_SENDER_EMAIL }`.
   - `replyTo`: `{ email: <email do cliente> }` (a equipe responde direto).
   - `subject`: `Novo contato (Fale Conosco) — <assunto>`.
   - `htmlContent`: template branded (reusa o padrão visual do `auth.js`) com nome, e-mail, equipe, assunto, mensagem, data.
   - Se `BREVO_API_KEY`/`BREVO_SENDER_EMAIL` ausentes ou o `fetch` falhar → `console.warn` e segue (a linha já está salva; a mensagem não se perde).
6. Retorna `{ ok: true, id }`.

**Erros:** 401 (sem/inválido Bearer, via middleware), 400 (validação), 500 (falha de insert). O e-mail nunca causa erro 5xx pro cliente.

---

## 4. Frontend — `FaleConoscoPage`

Converter de estático para form controlado (mantém o layout/visual atual):
- `useState` para `assunto` e `mensagem`; `useState` `enviando`.
- Submit handler:
  1. Valida não-vazio (trim) dos dois → se vazio, `toast.error` e não envia.
  2. `const { data } = await supabase.auth.getSession(); const token = data.session?.access_token;` (padrão do `Me.tsx`). Se não houver `hasApiUrl()`/token → `toast.error` gracioso ("indisponível agora").
  3. `await apiFetch('/api/contact', { method: 'POST', body: JSON.stringify({ assunto, mensagem }), token })`.
  4. Sucesso → `toast.success('Mensagem enviada! Em breve a equipe responde por e-mail.')` + limpa os campos.
  5. `catch` → `toast.error` gracioso (trata 401/403 de sessão expirada e backend ausente).
- Botão: `disabled={enviando}` e label "Enviando…" durante o envio.
- Imports novos: `useState`, `toast` (sonner), `supabase`, `apiFetch`/`hasApiUrl`.

---

## 5. Tratamento de erro & Zero Trust

- O front-validation é só UX; o **backend valida de novo** (autoridade).
- `requireAuth` garante usuário logado (anti-spam anônimo).
- Falha de e-mail não perde a mensagem (grava a linha **antes** de tentar enviar).
- `replyTo` permite resposta sem expor caixa interna.
- A tabela não é legível pelo cliente; só staff que gerencia o cliente lê (RLS).

---

## 6. Testes

**Front (Vitest + Testing Library, PT-BR, `vi.clearAllMocks()` no `beforeEach`):**
- Campos vazios → `toast.error`, **não** chama `apiFetch`.
- Submit válido → `apiFetch` chamado com `/api/contact`, método POST e payload `{ assunto, mensagem }`; `toast.success`; campos limpos.
- `apiFetch` rejeita → `toast.error`, campos preservados.
- Mockar `@/services/api` (`apiFetch`/`hasApiUrl`) e `@/lib/supabase` (sessão com token).

**Backend:** verificar na fase de plano se há harness de teste no `backend/`. Se houver: teste de rota (válido → 200 + insert + brevo chamados; inválido → 400; sem auth → 401), com service role e fetch mockados. Se não houver harness: smoke via Playwright (`Temp/smoke_*.py`, launcher `py`): login → `/fale-conosco` → preencher → enviar → ver toast de sucesso → confirmar a linha em `mensagens_contato` via MCP read-only.

---

## 7. Entregáveis / deploy / ordem

1. **PR no `gest-miles-manager-front`** (repo canônico de migrations): migration `mensagens_contato` (begin/commit, timestamp `YYYYMMDDHHMMSS`, branqueada de `origin/main`, idempotente onde fizer sentido). **Aplicar em prod só com OK do owner** (MCP `apply_migration` ou runner da equipe). Usar git worktree (há agente paralelo no manager).
2. **PR no `gest-miles-usuario-front`**: `backend/src/routes/contact.js` + montagem no `index.js` + wiring do `FaleConoscoPage` + testes + `backend/.env.example` (`CONTACT_INBOX_EMAIL`).
3. **Ordem de deploy:** migration **aplicada antes** do deploy do backend (a rota insere na tabela). Coordenar.
4. **Env nova:** `CONTACT_INBOX_EMAIL` (backend; default no código `gestmilesapp@gmail.com`). Documentar no `backend/.env.example`.

**Gate antes de "pronto"** (TS frouxo, build não type-checka): `npx tsc -b` + `npm test` + `npm run build`. Validação em runtime via smoke Playwright.

---

## 8. Decisões registradas
- Destino: `gestmilesapp@gmail.com` (temporário; via env, trocável).
- Registro: tabela dedicada `mensagens_contato` (não reusar `demandas_cliente` p/ não poluir a fila operacional do gestor).
- Escrita: backend service role (não RPC do cliente) — o backend já roda pra enviar e-mail.
- UI de leitura no manager: ciclo separado.
