# Design — Exclusão de conta (LGPD art.18): solicitação + carência

**Data:** 2026-06-25
**Repo:** `gest-miles-usuario-front` (app cliente) + `backend/` (BFF)
**Status:** aprovado no brainstorming, pronto pro plano

## Objetivo

Materializar in-app o direito de **eliminação** da LGPD (art.18, V) — par do export
de acesso/portabilidade já entregue ([[lgpd-export-built]] / PR #42). Hoje só por
e-mail (`privacidade@gestmiles.com.br`). O `cliente` solicita a exclusão da própria
conta; após uma janela de carência, o owner processa o hard delete.

## Decisões fechadas (brainstorming)

1. **Modelo:** solicitação + carência (NÃO hard delete imediato self-service). Banco
   é **prod compartilhada, sem staging**; delete é irreversível e cascateia largo.
2. **Quem pode:** só **`cliente`** (cadastro próprio). `cliente_gestao` (gerido por
   gestor) é direcionado ao gestor/`privacidade@` — a relação B2B é do gestor.
   Validado **no servidor** (Zero Trust), não só na UI.
3. **Execução do hard delete:** **owner via runbook** (V1). Sem endpoint destrutivo
   nem cron. A solicitação/cancelamento é self-service; o passo destrutivo é manual,
   humano no loop. Cumpre o SLA da LGPD ("em até X dias").
4. **Carência:** 7 dias (`agendado_para = solicitado_em + 7d`).
5. **Estado na carência:** conta **continua usável** (login funciona — é o que
   permite cancelar). **NÃO** mexemos no `cliente_status` canônico (enum compartilhado,
   risco). O estado "exclusão agendada" vive na tabela nova. Após solicitar, o usuário
   é **deslogado**; ao logar de novo na carência vê banner + "Cancelar exclusão".

## Fatos de cascade (verificados ao vivo via MCP, 2026-06-25 — base do runbook)

Deletar `auth.users(id)` (via GoTrue admin / service role) faz **CASCADE** pra
~todo o dado do usuário: `perfis` (→ e daí cascateia `cliente_cs`, `equipe_clientes`,
`viagens`, `perfis_configuracao`, `blocos`), `programas_cliente`, `lotes_programa`,
`movimentos_programa`, `demandas_cliente`, `emissoes`, `timeline_eventos`,
`nps_avaliacoes`/`nps_convites`, `csat_avaliacoes`, `alertas_sistema`,
`notificacoes`, `cliente_programa_acessos` (+ audit), `credenciais_programa_cliente`,
`pesquisa_passagens_uso_usuario`, etc.

**Leftovers SET NULL** (linha mantida, user nulado — aceitável: operacional/compliance):
`subscriptions`, `contratos_cliente`, `tarefas_cs`, `reunioes_onboarding.cliente_id`,
`audit_logs.user_id`.

**PII órfã SEM FK pro usuário** (NÃO cascateia — o runbook trata explicitamente):
- `mensagens_contato` (`cliente_usuario_id`) — apagar do usuário.
- `indicacoes` (`indicador_usuario_id`) — apagar onde ele é o indicador.
- `indicacao_codigos` (`usuario_id`) — apagar.
- `indicacoes` onde ele foi **indicado** (`indicado_usuario_id`/`indicado_email`) —
  **anonimizar** (nullar) em vez de apagar (registro de outro indicador).

## Componentes

### 1. Migration — `conta_exclusao_solicitacoes` (prod compartilhada)

> **Bloqueador:** precisa de **OK do owner** e vai pelo fluxo do **manager-front**
> (repo canônico de migrations) + aplicar manual no SQL Editor / via MCP `apply_migration`
> com OK. Convenção `begin;…commit;`, timestamp `YYYYMMDDHHMMSS`.

Colunas: `id uuid pk default gen_random_uuid()`, `usuario_id uuid not null unique
references auth.users(id) on delete cascade`, `email text`, `status text not null
default 'pendente' check (status in ('pendente','cancelada','concluida'))`,
`solicitado_em timestamptz not null default now()`, `agendado_para timestamptz not null`,
`cancelado_em timestamptz`, `processado_em timestamptz`, `observacao text`.

RLS (enable):
- SELECT: `usuario_id = auth.uid()` (+ staff/admin se necessário — manter mínimo:
  só self + admin global). Permite o front ler o próprio status (banner).
- **Sem** policy de INSERT/UPDATE pra `authenticated` → escrita só via service role
  (backend). (Padrão do repo pra ação sensível.)
- Índice em `(status, agendado_para)` pra o owner listar pendentes a processar.

### 2. Backend — `backend/src/routes/accountDeletion.js`

Padrão dos irmãos `/api/contact` e `/api/referrals` (gravam + e-mail via service role,
validando `user.id` por `getUser`). Montar em `backend/src/index.js`.

- `POST /api/account/deletion-request` (`requireUser`):
  1. `getUser` (já feito no requireUser) → `req.user`.
  2. Ler `perfis.role` do usuário (service role); **se ≠ `cliente` → 403** (`publicError`).
  3. Gravar em `conta_exclusao_solicitacoes` — idempotente por `usuario_id` unique:
     se já existe solicitação `pendente`, **retorna a existente** (não reagenda, não
     duplica e-mail); se a anterior era `cancelada`/`concluida` (ou não existe), cria
     `pendente` nova com `agendado_para = now()+7d` (upsert por `usuario_id`).
  4. Resend: e-mail pra `privacidade@` (processar) + confirmação ao usuário (data +
     como cancelar). Falha de e-mail **não** derruba a solicitação (best-effort, logada).
  5. Resposta `{ status, agendado_para }`. Sem vazar `error.message` cru (usar `publicError`).
- `POST /api/account/deletion-request/cancel` (`requireUser`): marca a própria
  solicitação `pendente` → `cancelada` (`cancelado_em=now()`); 404/no-op se não houver
  pendente. Valida `user.id` (não confia no body).

Constantes: `GRACE_DAYS = 7`.

### 3. Front

- `src/hooks/useAccountDeletion.ts`: lê a solicitação pendente do próprio usuário via
  RLS (`conta_exclusao_solicitacoes` select where `usuario_id = user.id`, status
  `pendente`); `solicitar()` e `cancelar()` via `apiFetch` (BFF). Estados loading/erro.
- **Danger-zone no `src/pages/ClientProfile.tsx`** (só role `cliente`): seção "Excluir
  minha conta" com texto do que acontece + carência; botão abre **dialog de confirmação
  digitada** (digitar `EXCLUIR`). `cliente_gestao`/outros: em vez do botão, texto
  "Para excluir sua conta, fale com seu gestor ou escreva para privacidade@gestmiles.com.br".
- **Banner de carência**: quando há solicitação `pendente`, mostrar banner persistente
  (no ClientProfile e/ou topo) "Sua conta será excluída em <data>. Cancelar exclusão"
  → `cancelar()`.
- Após `solicitar()` com sucesso: toast de confirmação + **signOut** + redirect `/auth`.

### 4. Runbook — `docs/account-deletion-runbook.md`

Passo-a-passo do owner pra processar uma solicitação `pendente` cuja `agendado_para`
venceu: (a) confirmar identidade/solicitação; (b) `auth.admin.deleteUser(usuario_id)`
(service role; cascateia ~tudo); (c) apagar PII órfã: `mensagens_contato` where
`cliente_usuario_id`, `indicacoes` where `indicador_usuario_id`, `indicacao_codigos`
where `usuario_id`; (d) anonimizar `indicacoes` where `indicado_usuario_id = <id>`
(nullar `indicado_usuario_id` + `indicado_email`); (e) marcar a solicitação
`status='concluida'`, `processado_em=now()`. Nota sobre leftovers SET NULL aceitáveis.

## Tratamento de erro / Zero Trust

- Role-check de `cliente` **no servidor** (não confiar na UI). 403 gracioso.
- Backend nunca vaza `error.message` cru (`publicError`, padrão da PR #39).
- E-mail best-effort (não bloqueia a solicitação).
- Front trata 401/403 do BFF graciosamente (toast); banner degrada se a leitura falhar.

## Testes (Vitest — rede principal)

- **Backend** (`backend/src/routes/accountDeletion.test.js`, padrão dos testes de rota):
  grava solicitação p/ `cliente`; **rejeita 403** p/ role ≠ cliente; idempotência por
  `usuario_id`; cancel marca `cancelada` + no-op sem pendente; e-mail mockado não
  derruba em falha.
- **Front** (`src/hooks/useAccountDeletion.test.ts`): `solicitar`/`cancelar` chamam o
  endpoint certo; expõe estado pendente; trata erro. Gate de role na UI (ClientProfile):
  `cliente` vê botão, `cliente_gestao` vê o texto alternativo.

## Fora de escopo (YAGNI / deferido)

- Execução do hard delete em código (cron/endpoint destrutivo) — runbook no V1.
- `cliente_gestao` self-delete.
- UI admin de processamento (admin-front) — follow-up cross-product.
- Tocar o `cliente_status` canônico.

## Gate antes de "pronto"

`npx tsc -b` + `npm test` + `npm run build`. Backend: `node --check` nos arquivos +
testes de rota. Migration aplicada (com OK do owner) antes de validar o fluxo ponta-a-ponta.

## Referências

- `backend/src/routes/contact.js` / `referrals.js` (padrão grava+e-mail), `lib/mailer.js`,
  `lib/httpError.js` (`publicError`), `middleware/requireUser.js` (caminho seguro service-role).
- `src/pages/ClientProfile.tsx` (perfil do cliente), `src/contexts/AuthContext.tsx` (`signOut`, role).
- `src/services/api.ts` (`apiFetch`).
