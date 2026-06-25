# Exclusão de conta (LGPD) — solicitação + carência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o `cliente` solicite a exclusão da própria conta in-app (com carência de 7 dias e cancelamento); o hard delete real é processado pelo owner via runbook.

**Architecture:** Front (danger-zone no ClientProfile + banner) → backend BFF (`/api/account/deletion-request[/cancel]`, `requireUser` + service role, valida role no servidor, grava em `conta_exclusao_solicitacoes` + e-mails best-effort) → tabela nova com RLS self-read. Lógica de decisão pura num lib testável; rota fina. Sem execução destrutiva em código (runbook).

**Tech Stack:** React 18 + TS frouxo + Vite + Supabase JS + sonner + Express 4 (BFF) + Resend (mailer) + Vitest (front) + node:test (backend).

## Global Constraints

- **Copy PT-BR.** Banco `snake_case`, TS `camelCase`.
- **Type-check REAL = `npx tsc -b`.** Redes: **front `npm test` (Vitest)**, **backend `npm test` (`node --test`, em `backend/`)**. Build: `npm run build`.
- **Zero Trust:** role `cliente` validado **no SERVIDOR** (`getUser` → `perfis.role`), nunca só na UI; tudo escopado a `user.id` do token (nunca do body); **nunca vazar `error.message`** cru (usar `serverError`/`publicError`); e-mail **best-effort** (não derruba a solicitação).
- **Sem dependência nova.**
- **Migration na prod compartilhada:** precisa **OK do owner**; canônico via **manager-front**; aplicar via MCP `apply_migration` (com OK) ou SQL Editor. Os tasks de código **não exigem** a tabela existir (lib puro + smoke); a aplicação é passo de ops do controller/owner.
- **NÃO** tocar o enum canônico `cliente_status`. **NÃO** replicar no manager.
- Carência fixa: **7 dias**. Branch: `feat/account-deletion-lgpd`. Commits frequentes.
- Owner-columns/cascade confirmados ao vivo (ver spec): deletar `auth.users(id)` cascateia ~tudo; PII órfã sem FK = `mensagens_contato`/`indicacoes`/`indicacao_codigos` (runbook trata).

---

### Task 1: Migration + runbook

**Files:**
- Create: `supabase/migrations/20260625120000_conta_exclusao_solicitacoes.sql`
- Create: `docs/account-deletion-runbook.md`

**Interfaces:**
- Produces: tabela `conta_exclusao_solicitacoes` (colunas: `id`, `usuario_id` unique, `email`, `status`, `solicitado_em`, `agendado_para`, `cancelado_em`, `processado_em`, `observacao`); RLS self-select. Consumida pelo backend (service role) e front (RLS read).

> **Nota de execução (controller/owner, fora do subagente):** o subagente só ESCREVE os arquivos. A APLICAÇÃO no banco compartilhado é feita pelo controller/owner com OK explícito (MCP `apply_migration` ou via manager-front canônico). Não aplicar no fluxo do implementer.

- [ ] **Step 1: Escrever a migration**

Create `supabase/migrations/20260625120000_conta_exclusao_solicitacoes.sql`:

```sql
begin;

create table if not exists public.conta_exclusao_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  status text not null default 'pendente' check (status in ('pendente','cancelada','concluida')),
  solicitado_em timestamptz not null default now(),
  agendado_para timestamptz not null,
  cancelado_em timestamptz,
  processado_em timestamptz,
  observacao text
);

create index if not exists conta_exclusao_solicitacoes_status_agendado_idx
  on public.conta_exclusao_solicitacoes (status, agendado_para);

alter table public.conta_exclusao_solicitacoes enable row level security;

-- Self lê a própria solicitação (banner). Admin global também. SEM policy de
-- insert/update/delete p/ authenticated → escrita só via service role (backend).
create policy conta_exclusao_select_self
  on public.conta_exclusao_solicitacoes
  for select
  to authenticated
  using (usuario_id = (select auth.uid()) or public.is_legacy_platform_admin());

commit;
```

- [ ] **Step 2: Escrever o runbook**

Create `docs/account-deletion-runbook.md`:

```markdown
# Runbook — Processar exclusão de conta (LGPD)

Quando uma solicitação em `conta_exclusao_solicitacoes` está `pendente` e
`agendado_para` já venceu, o owner processa o hard delete. Banco é prod
compartilhada, sem staging — confira o id antes de executar.

## Passos (service role / MCP)

1. Listar pendentes vencidas:
   `select usuario_id, email, agendado_para from conta_exclusao_solicitacoes
    where status='pendente' and agendado_para <= now();`
2. Conferir que é o usuário certo (id/email) e que não houve cancelamento.
3. Deletar o usuário no GoTrue (cascateia ~tudo: perfis, programas_cliente,
   demandas, timeline, nps/csat, alertas, lotes/movimentos, emissoes,
   notificacoes, credenciais cifradas, etc.):
   `auth.admin.deleteUser('<usuario_id>')` (service role; via dashboard Auth ou API admin).
4. Apagar PII órfã (sem FK pro usuário):
   - `delete from mensagens_contato where cliente_usuario_id = '<usuario_id>';`
   - `delete from indicacoes where indicador_usuario_id = '<usuario_id>';`
   - `delete from indicacao_codigos where usuario_id = '<usuario_id>';`
5. Anonimizar onde o usuário foi INDICADO (registro de outro indicador):
   `update indicacoes set indicado_usuario_id = null, indicado_email = null
    where indicado_usuario_id = '<usuario_id>';`
6. Marcar a solicitação concluída:
   `update conta_exclusao_solicitacoes set status='concluida', processado_em=now()
    where usuario_id = '<usuario_id>';`

## Notas
- Leftovers SET NULL (subscriptions/contratos_cliente/tarefas_cs/reunioes_onboarding/
  audit_logs) são mantidos com user nulado — aceitável (operacional/compliance).
- `auth.admin.deleteUser` exige service role — NUNCA no browser.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260625120000_conta_exclusao_solicitacoes.sql docs/account-deletion-runbook.md
git commit -m "feat(usuario): migration + runbook da exclusão de conta LGPD"
```

---

### Task 2: Backend — service (puro) + rota

**Files:**
- Create: `backend/src/lib/accountDeletionService.js`
- Test: `backend/src/lib/accountDeletionService.test.js`
- Create: `backend/src/routes/accountDeletion.js`
- Modify: `backend/src/index.js` (mount da rota)

**Interfaces:**
- Produces (lib): `GRACE_DAYS` (=7); `isDeletionEligibleRole(role): boolean`; `computeScheduledFor(nowMs, graceDays?): string`; `decideRequestAction(existing): "create"|"return-existing"`; `buildDeletionRequestRow({userId, email, nowMs, graceDays?}): object`.
- Produces (rota): `POST /api/account/deletion-request` → `{ status, agendado_para }`; `POST /api/account/deletion-request/cancel` → `{ status }`.
- Consumes: `requireUser` (`req.user`/`req.accessToken`), `assertSupabaseService`, `sendEmail`/`mailerConfigured`, `serverError`/`publicError`.

- [ ] **Step 1: Escrever os testes do lib puro (falham)**

Create `backend/src/lib/accountDeletionService.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GRACE_DAYS,
  isDeletionEligibleRole,
  computeScheduledFor,
  decideRequestAction,
  buildDeletionRequestRow,
} from "./accountDeletionService.js";

test("isDeletionEligibleRole: só 'cliente'", () => {
  assert.equal(isDeletionEligibleRole("cliente"), true);
  for (const r of ["cliente_gestao", "gestor", "cs", "admin_equipe", "admin", null, undefined]) {
    assert.equal(isDeletionEligibleRole(r), false);
  }
});

test("computeScheduledFor: now + carência (default 7d)", () => {
  assert.equal(computeScheduledFor(0), "1970-01-08T00:00:00.000Z");
  assert.equal(computeScheduledFor(0, 1), "1970-01-02T00:00:00.000Z");
  assert.equal(GRACE_DAYS, 7);
});

test("decideRequestAction: pendente → return-existing; senão create", () => {
  assert.equal(decideRequestAction({ status: "pendente" }), "return-existing");
  assert.equal(decideRequestAction(null), "create");
  assert.equal(decideRequestAction({ status: "cancelada" }), "create");
  assert.equal(decideRequestAction({ status: "concluida" }), "create");
});

test("buildDeletionRequestRow: shape e agendamento", () => {
  const row = buildDeletionRequestRow({ userId: "u-1", email: "a@b.com", nowMs: 0 });
  assert.equal(row.usuario_id, "u-1");
  assert.equal(row.email, "a@b.com");
  assert.equal(row.status, "pendente");
  assert.equal(row.solicitado_em, "1970-01-01T00:00:00.000Z");
  assert.equal(row.agendado_para, "1970-01-08T00:00:00.000Z");
  assert.equal(row.cancelado_em, null);
  assert.equal(row.processado_em, null);
  // email ausente vira null
  assert.equal(buildDeletionRequestRow({ userId: "u-2", nowMs: 0 }).email, null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (em `backend/`): `npm test`
Expected: FAIL (módulo `./accountDeletionService.js` não existe).

- [ ] **Step 3: Implementar o lib puro**

Create `backend/src/lib/accountDeletionService.js`:

```js
// Lógica pura da exclusão de conta (sem I/O) — testável com node:test.
export const GRACE_DAYS = 7;

/** Conta elegível pra self-delete: só cadastro próprio ('cliente'). */
export function isDeletionEligibleRole(role) {
  return role === "cliente";
}

/** Data agendada (ISO) a partir de um epoch ms + carência em dias. */
export function computeScheduledFor(nowMs, graceDays = GRACE_DAYS) {
  return new Date(nowMs + graceDays * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Decide a ação dado o estado atual:
 * - já 'pendente' → 'return-existing' (idempotente: não reagenda, não re-emaila)
 * - inexistente/'cancelada'/'concluida' → 'create'
 */
export function decideRequestAction(existing) {
  if (existing && existing.status === "pendente") return "return-existing";
  return "create";
}

/** Linha a gravar (upsert por usuario_id). */
export function buildDeletionRequestRow({ userId, email, nowMs, graceDays = GRACE_DAYS }) {
  return {
    usuario_id: userId,
    email: email ?? null,
    status: "pendente",
    solicitado_em: new Date(nowMs).toISOString(),
    agendado_para: computeScheduledFor(nowMs, graceDays),
    cancelado_em: null,
    processado_em: null,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run (em `backend/`): `npm test`
Expected: PASS (todos os testes, incluindo os novos).

- [ ] **Step 5: Implementar a rota (fina, orquestração)**

Create `backend/src/routes/accountDeletion.js`:

```js
import { Router } from "express";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireUser } from "../middleware/requireUser.js";
import { sendEmail, mailerConfigured } from "../lib/mailer.js";
import { serverError, publicError } from "../lib/httpError.js";
import {
  GRACE_DAYS,
  isDeletionEligibleRole,
  decideRequestAction,
  buildDeletionRequestRow,
} from "../lib/accountDeletionService.js";

const router = Router();
const PRIVACY_EMAIL = process.env.PRIVACY_CONTACT_EMAIL || "privacidade@gestmiles.com.br";

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** POST /api/account/deletion-request — registra a solicitação (carência) + e-mails. */
router.post("/deletion-request", requireUser, async (req, res) => {
  try {
    const user = req.user;
    const sb = assertSupabaseService();

    const { data: perfil } = await sb
      .from("perfis")
      .select("role, email")
      .eq("usuario_id", user.id)
      .maybeSingle();

    if (!isDeletionEligibleRole(perfil?.role)) {
      return publicError(
        res,
        403,
        "Este tipo de conta não pode ser excluído por aqui. Fale com seu gestor ou escreva para privacidade@gestmiles.com.br.",
        null,
        "[accountDeletion]",
      );
    }

    const { data: existing } = await sb
      .from("conta_exclusao_solicitacoes")
      .select("status, agendado_para")
      .eq("usuario_id", user.id)
      .maybeSingle();

    if (decideRequestAction(existing) === "return-existing") {
      return res.json({ status: "pendente", agendado_para: existing.agendado_para });
    }

    const email = (perfil?.email || user.email || "").trim() || null;
    const row = buildDeletionRequestRow({ userId: user.id, email, nowMs: Date.now(), graceDays: GRACE_DAYS });

    const { data: saved, error: upErr } = await sb
      .from("conta_exclusao_solicitacoes")
      .upsert(row, { onConflict: "usuario_id" })
      .select("status, agendado_para")
      .single();
    if (upErr) {
      return serverError(res, "Não foi possível registrar a solicitação.", upErr, "[accountDeletion]");
    }

    // E-mails best-effort: nunca derrubam a solicitação (já gravada).
    try {
      if (mailerConfigured()) {
        const dataFmt = new Date(saved.agendado_para).toLocaleDateString("pt-BR");
        await sendEmail({
          to: PRIVACY_EMAIL,
          subject: "Solicitação de exclusão de conta (LGPD)",
          html: `<p>O usuário <strong>${escapeHtml(email || user.id)}</strong> (id ${escapeHtml(user.id)}) solicitou a exclusão da conta.</p><p>Agendada para <strong>${escapeHtml(dataFmt)}</strong>. Processar via runbook (docs/account-deletion-runbook.md).</p>`,
        });
        if (email) {
          await sendEmail({
            to: email,
            subject: "Recebemos sua solicitação de exclusão de conta",
            html: `<p>Recebemos seu pedido para excluir sua conta da Gest Miles.</p><p>Ela será excluída em <strong>${escapeHtml(dataFmt)}</strong>. Se mudar de ideia, entre no app e clique em "Cancelar exclusão" antes dessa data.</p>`,
          });
        }
      } else {
        console.warn("[accountDeletion] e-mail não configurado; solicitação registrada sem envio.");
      }
    } catch (mailErr) {
      console.warn("[accountDeletion] e-mail falhou:", mailErr?.message ?? mailErr);
    }

    return res.json({ status: saved.status, agendado_para: saved.agendado_para });
  } catch (err) {
    return serverError(res, "Erro ao solicitar exclusão.", err, "[accountDeletion]");
  }
});

/** POST /api/account/deletion-request/cancel — cancela a própria solicitação pendente. */
router.post("/deletion-request/cancel", requireUser, async (req, res) => {
  try {
    const user = req.user;
    const sb = assertSupabaseService();
    const { data: updated, error } = await sb
      .from("conta_exclusao_solicitacoes")
      .update({ status: "cancelada", cancelado_em: new Date().toISOString() })
      .eq("usuario_id", user.id)
      .eq("status", "pendente")
      .select("status")
      .maybeSingle();
    if (error) {
      return serverError(res, "Não foi possível cancelar a solicitação.", error, "[accountDeletion]");
    }
    return res.json({ status: updated?.status ?? "sem_pendente" });
  } catch (err) {
    return serverError(res, "Erro ao cancelar exclusão.", err, "[accountDeletion]");
  }
});

export default router;
```

- [ ] **Step 6: Montar a rota no index.js**

Em `backend/src/index.js`: adicionar o import junto aos outros (após a linha `import equipeBillingRoutes ...`):

```js
import accountDeletionRoutes from "./routes/accountDeletion.js";
```

E o mount junto aos outros `routes.use(...)` (após `routes.use("/api/equipe-billing", equipeBillingRoutes);`):

```js
routes.use("/api/account", accountDeletionRoutes);
```

- [ ] **Step 7: Verificar (sintaxe + testes)**

Run (em `backend/`): `node --check src/routes/accountDeletion.js && node --check src/index.js && npm test`
Expected: sem erro de sintaxe; testes verdes.

- [ ] **Step 8: Commit**

```bash
git add backend/src/lib/accountDeletionService.js backend/src/lib/accountDeletionService.test.js backend/src/routes/accountDeletion.js backend/src/index.js
git commit -m "feat(backend): rota de exclusão de conta LGPD (solicitação + cancelamento)"
```

---

### Task 3: Front — lib + hook

**Files:**
- Create: `src/lib/accountDeletion.ts`
- Test: `src/lib/accountDeletion.test.ts`
- Create: `src/hooks/useAccountDeletion.ts`

**Interfaces:**
- Consumes: `apiFetch` de `@/services/api`; `supabase`; `useAuth`.
- Produces:
  - `type DeletionStatus = { status: "pendente"|"cancelada"|"concluida"|"sem_pendente"; agendado_para?: string }`
  - `solicitarExclusaoConta(token: string): Promise<DeletionStatus>`
  - `cancelarExclusaoConta(token: string): Promise<DeletionStatus>`
  - `useAccountDeletion(): { pending: { agendado_para: string } | null; loading: boolean; solicitar(): Promise<DeletionStatus>; cancelar(): Promise<void>; refresh(): Promise<void> }`

- [ ] **Step 1: Escrever os testes do lib (falham)**

Create `src/lib/accountDeletion.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/services/api", () => ({ apiFetch: mocks.apiFetch }));

import { solicitarExclusaoConta, cancelarExclusaoConta } from "./accountDeletion";

describe("accountDeletion lib", () => {
  beforeEach(() => vi.clearAllMocks());

  it("solicitar chama POST /api/account/deletion-request com token", async () => {
    mocks.apiFetch.mockResolvedValue({ status: "pendente", agendado_para: "2026-07-02T00:00:00.000Z" });
    const res = await solicitarExclusaoConta("tok-1");
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/account/deletion-request",
      expect.objectContaining({ method: "POST", token: "tok-1" }),
    );
    expect(res.status).toBe("pendente");
  });

  it("cancelar chama POST /api/account/deletion-request/cancel com token", async () => {
    mocks.apiFetch.mockResolvedValue({ status: "cancelada" });
    await cancelarExclusaoConta("tok-2");
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/account/deletion-request/cancel",
      expect.objectContaining({ method: "POST", token: "tok-2" }),
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/accountDeletion.test.ts`
Expected: FAIL (módulo `./accountDeletion` não existe).

- [ ] **Step 3: Implementar o lib**

Create `src/lib/accountDeletion.ts`:

```ts
import { apiFetch } from "@/services/api";

export type DeletionStatus = {
  status: "pendente" | "cancelada" | "concluida" | "sem_pendente";
  agendado_para?: string;
};

/** Solicita a exclusão da conta (POST /api/account/deletion-request). */
export async function solicitarExclusaoConta(token: string): Promise<DeletionStatus> {
  return apiFetch<DeletionStatus>("/api/account/deletion-request", {
    method: "POST",
    body: JSON.stringify({}),
    token,
  });
}

/** Cancela a solicitação pendente (POST /api/account/deletion-request/cancel). */
export async function cancelarExclusaoConta(token: string): Promise<DeletionStatus> {
  return apiFetch<DeletionStatus>("/api/account/deletion-request/cancel", {
    method: "POST",
    body: JSON.stringify({}),
    token,
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/accountDeletion.test.ts`
Expected: PASS.

- [ ] **Step 5: Implementar o hook**

Create `src/hooks/useAccountDeletion.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cancelarExclusaoConta, solicitarExclusaoConta, type DeletionStatus } from "@/lib/accountDeletion";

export type PendingDeletion = { agendado_para: string } | null;

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");
  return token;
}

export function useAccountDeletion() {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingDeletion>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setPending(null);
      return;
    }
    // Degrada graciosamente se a tabela não existir ainda (pré-migration) ou RLS negar.
    const { data, error } = await supabase
      .from("conta_exclusao_solicitacoes")
      .select("agendado_para, status")
      .eq("usuario_id", user.id)
      .eq("status", "pendente")
      .maybeSingle();
    if (error) {
      setPending(null);
      return;
    }
    setPending(data?.agendado_para ? { agendado_para: data.agendado_para } : null);
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const solicitar = useCallback(async (): Promise<DeletionStatus> => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      return await solicitarExclusaoConta(token);
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelar = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      await cancelarExclusaoConta(token);
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  return { pending, loading, solicitar, cancelar, refresh };
}
```

- [ ] **Step 6: Type-check + commit**

Run: `npx tsc -b`
Expected: sem erros.

```bash
git add src/lib/accountDeletion.ts src/lib/accountDeletion.test.ts src/hooks/useAccountDeletion.ts
git commit -m "feat(usuario): lib + hook de exclusão de conta (solicitar/cancelar/pendente)"
```

---

### Task 4: Front — UI (AccountDeletionSection no ClientProfile)

**Files:**
- Create: `src/components/perfil/AccountDeletionSection.tsx`
- Test: `src/components/perfil/AccountDeletionSection.test.tsx`
- Modify: `src/pages/ClientProfile.tsx` (import + render)

**Interfaces:**
- Consumes: `useAccountDeletion` (Task 3), `useAuth` (`role`, `signOut`), `useNavigate`, `toast` (sonner), `Button` (`@/components/ui/button`).
- Produces: `<AccountDeletionSection />` (default export) — renderiza banner (se pendente), texto alternativo (role ≠ cliente) ou a danger-zone com confirmação digitada (role = cliente).

- [ ] **Step 1: Escrever o teste do componente (falha)**

Create `src/components/perfil/AccountDeletionSection.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useAccountDeletion: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/hooks/useAccountDeletion", () => ({ useAccountDeletion: mocks.useAccountDeletion }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import AccountDeletionSection from "./AccountDeletionSection";

const baseHook = { pending: null, loading: false, solicitar: vi.fn(), cancelar: vi.fn(), refresh: vi.fn() };

describe("AccountDeletionSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAccountDeletion.mockReturnValue({ ...baseHook });
  });

  it("cliente sem pendência vê o botão de excluir", () => {
    mocks.useAuth.mockReturnValue({ role: "cliente", signOut: vi.fn() });
    render(<AccountDeletionSection />);
    expect(screen.getByRole("button", { name: /excluir minha conta/i })).toBeInTheDocument();
  });

  it("cliente_gestao vê o texto alternativo (sem botão destrutivo)", () => {
    mocks.useAuth.mockReturnValue({ role: "cliente_gestao", signOut: vi.fn() });
    render(<AccountDeletionSection />);
    expect(screen.getByText(/fale com seu gestor/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /excluir minha conta/i })).not.toBeInTheDocument();
  });

  it("com pendência mostra o banner e cancela", async () => {
    const cancelar = vi.fn().mockResolvedValue(undefined);
    mocks.useAuth.mockReturnValue({ role: "cliente", signOut: vi.fn() });
    mocks.useAccountDeletion.mockReturnValue({ ...baseHook, pending: { agendado_para: "2026-07-02T00:00:00.000Z" }, cancelar });
    render(<AccountDeletionSection />);
    expect(screen.getByText(/será excluída em/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancelar exclusão/i }));
    await waitFor(() => expect(cancelar).toHaveBeenCalled());
  });

  it("confirmação exige digitar EXCLUIR antes de solicitar", async () => {
    const solicitar = vi.fn().mockResolvedValue({ status: "pendente", agendado_para: "2026-07-02T00:00:00.000Z" });
    const signOut = vi.fn().mockResolvedValue(undefined);
    mocks.useAuth.mockReturnValue({ role: "cliente", signOut });
    mocks.useAccountDeletion.mockReturnValue({ ...baseHook, solicitar });
    render(<AccountDeletionSection />);
    fireEvent.click(screen.getByRole("button", { name: /excluir minha conta/i }));
    // texto errado → não solicita
    fireEvent.change(screen.getByLabelText(/digite/i), { target: { value: "errado" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar exclusão/i }));
    expect(solicitar).not.toHaveBeenCalled();
    // texto certo → solicita + signOut
    fireEvent.change(screen.getByLabelText(/digite/i), { target: { value: "EXCLUIR" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar exclusão/i }));
    await waitFor(() => expect(solicitar).toHaveBeenCalled());
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/components/perfil/AccountDeletionSection.test.tsx`
Expected: FAIL (componente não existe).

- [ ] **Step 3: Implementar o componente**

Create `src/components/perfil/AccountDeletionSection.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAccountDeletion } from "@/hooks/useAccountDeletion";

const PRIVACY_EMAIL = "privacidade@gestmiles.com.br";

const formatData = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
};

const AccountDeletionSection = () => {
  const { role, signOut } = useAuth();
  const { pending, loading, solicitar, cancelar } = useAccountDeletion();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  // Banner de carência (só quem solicitou — sempre 'cliente' — tem pendência).
  if (pending) {
    return (
      <section className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
        <p className="font-medium text-destructive">Exclusão de conta agendada</p>
        <p className="text-destructive/90">
          Sua conta será excluída em {formatData(pending.agendado_para)}. Você pode cancelar até lá.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={async () => {
            try {
              await cancelar();
              toast.success("Exclusão cancelada.");
            } catch {
              toast.error("Não foi possível cancelar agora. Tente novamente.");
            }
          }}
        >
          Cancelar exclusão
        </Button>
      </section>
    );
  }

  // Só cadastro próprio exclui por aqui.
  if (role !== "cliente") {
    return (
      <section className="space-y-1 rounded-xl border border-border bg-card p-3 text-sm">
        <p className="font-medium">Excluir minha conta</p>
        <p className="text-muted-foreground">
          Para excluir sua conta, fale com seu gestor ou escreva para{" "}
          <a className="underline" href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>.
        </p>
      </section>
    );
  }

  const handleConfirm = async () => {
    if (typed.trim().toUpperCase() !== "EXCLUIR") {
      toast.error('Digite "EXCLUIR" para confirmar.');
      return;
    }
    try {
      const res = await solicitar();
      const dataFmt = res.agendado_para ? formatData(res.agendado_para) : "";
      toast.success(`Solicitação registrada. Sua conta será excluída em ${dataFmt}.`);
      await signOut();
      navigate("/auth");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível solicitar a exclusão.");
    }
  };

  return (
    <section className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="font-medium text-destructive">Excluir minha conta</p>
      <p className="text-muted-foreground">
        Isso solicita a exclusão definitiva da sua conta e dos seus dados, após uma carência de 7
        dias. Você poderá cancelar nesse período.
      </p>
      {!confirming ? (
        <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
          Excluir minha conta
        </Button>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs text-muted-foreground" htmlFor="confirm-delete-account">
            Digite <strong>EXCLUIR</strong> para confirmar:
          </label>
          <input
            id="confirm-delete-account"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          />
          <div className="flex gap-2">
            <Button type="button" variant="destructive" disabled={loading} onClick={handleConfirm}>
              Confirmar exclusão
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};

export default AccountDeletionSection;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/components/perfil/AccountDeletionSection.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Renderizar no ClientProfile**

Em `src/pages/ClientProfile.tsx`:

(a) adicionar o import junto aos outros de componentes:

```tsx
import AccountDeletionSection from "@/components/perfil/AccountDeletionSection";
```

(b) renderizar como última seção dentro do container `<div className="space-y-4">`, logo após o botão Salvar (a linha `<Button ... onClick={handleSave} ...>` e seu fechamento), antes do `</div>` que fecha o `space-y-4`:

```tsx
        <AccountDeletionSection />
```

- [ ] **Step 6: Gate completo**

Run: `npx tsc -b && npm run lint && npm run build`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/components/perfil/AccountDeletionSection.tsx src/components/perfil/AccountDeletionSection.test.tsx src/pages/ClientProfile.tsx
git commit -m "feat(usuario): danger-zone de exclusão de conta no perfil (role-gated + carência)"
```

---

### Verificação final (antes de PR)

- [ ] `npx tsc -b` limpo
- [ ] `npm test` (front, Vitest) verde — suíte completa
- [ ] `cd backend && npm test` (node:test) verde
- [ ] `npm run build` ok
- [ ] Migration revisada (aplicação pelo owner com OK — pode ser pós-merge, antes do smoke de prod)
- [ ] Abrir PR `feat/account-deletion-lgpd` → `main`
- [ ] Pós-aplicação da migration: smoke (login cliente → /perfil → solicitar → banner → cancelar; e cliente_gestao vê texto alternativo)

## Self-review do plano (feito)

- **Spec coverage:** modelo solicitação+carência (rota + tabela + carência 7d) ✅; só cliente (gate no servidor `isDeletionEligibleRole` + UI) ✅; execução via runbook (Task 1 doc, sem código destrutivo) ✅; conta usável na carência + banner + cancelar (Task 4) ✅; deslogar após solicitar (Task 4 handleConfirm) ✅; e-mails best-effort owner+usuário ✅; PII órfã no runbook ✅; sem tocar cliente_status ✅; não replicar no manager ✅; testes (lib puro node:test, lib front Vitest, componente Vitest) ✅.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Type/contrato consistency:** `solicitarExclusaoConta`/`cancelarExclusaoConta`/`DeletionStatus`/`useAccountDeletion`/`AccountDeletionSection` idênticos entre lib, hook, componente e testes; rota devolve `{status, agendado_para}` que o lib tipa como `DeletionStatus`.
- **Dependência entre tasks:** T2 (backend) e T3/T4 (front) independentes no código; T4 consome T3; nenhuma depende da migration estar APLICADA pra build/test (só pro smoke de runtime).
```
