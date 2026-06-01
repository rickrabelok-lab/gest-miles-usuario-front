# Fale Conosco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o form "Fale Conosco" funcional — o cliente envia assunto+mensagem, o backend grava em `mensagens_contato` e dispara um e-mail de notificação.

**Architecture:** Front (`FaleConoscoPage`) → `POST /api/contact` (Express, `requireAuth`) → valida o Bearer no servidor (`getUser`), grava a linha via **service role** (a tabela não tem INSERT policy pra authenticated) e manda e-mail Brevo best-effort. Leitura só por staff via RLS (`can_view_perfil`). Migration no banco compartilhado vai pelo repo canônico `gest-miles-manager-front`.

**Tech Stack:** React 18 + Vite + TS (front), Express 4 + `@supabase/supabase-js` (backend), Supabase Postgres (RLS), Brevo (e-mail), Vitest + Testing Library (testes front). Backend **sem harness de teste** → validação por smoke Playwright.

**Repos tocados:**
- `gest-miles-manager-front` (canônico de migrations) → Task 1.
- `gest-miles-usuario-front` (este; front + backend) → Tasks 2–5.

**Pré-condição de ordem:** Task 1 (migration) **aplicada em prod com OK do owner** antes do smoke end-to-end (Task 5). O código (Tasks 2–4) pode ser escrito/commitado antes.

---

### Task 1: Migration `mensagens_contato` (repo `gest-miles-manager-front`)

**Files:**
- Create: `supabase/migrations/<UTC timestamp>_mensagens_contato.sql` (no repo manager-front)

**Contexto:** banco é produção compartilhada sem staging. Há agente paralelo no manager-front → trabalhar em **git worktree** branqueado de `origin/main`. Aplicar em prod **só com OK explícito do owner** (via MCP `apply_migration` ou runner da equipe). `gen_random_uuid()`, `can_view_perfil(uuid)` já existem em prod (verificado 2026-06-01).

- [ ] **Step 1: Criar worktree e branch no manager-front**

```bash
cd <path-do-gest-miles-manager-front>
git fetch origin
git worktree add ../gmf-mensagens-contato origin/main -b feat/mensagens-contato
cd ../gmf-mensagens-contato
```

- [ ] **Step 2: Escrever o arquivo de migration**

Nome: `supabase/migrations/<YYYYMMDDHHMMSS>_mensagens_contato.sql` (timestamp UTC do momento). Conteúdo exato:

```sql
begin;

create table if not exists public.mensagens_contato (
  id uuid primary key default gen_random_uuid(),
  cliente_usuario_id uuid not null,
  equipe_id uuid,
  nome text,
  email_contato text,
  assunto text not null,
  mensagem text not null,
  status text not null default 'nova' check (status in ('nova','lida','respondida')),
  origem text not null default 'usuario_app',
  created_at timestamptz not null default now()
);

create index if not exists mensagens_contato_equipe_created_idx
  on public.mensagens_contato (equipe_id, created_at desc);
create index if not exists mensagens_contato_cliente_idx
  on public.mensagens_contato (cliente_usuario_id);

alter table public.mensagens_contato enable row level security;

-- Zero Trust: ninguém escreve via browser; só staff que gerencia o cliente lê.
revoke all on public.mensagens_contato from anon, authenticated;

drop policy if exists mensagens_contato_select_staff on public.mensagens_contato;
create policy mensagens_contato_select_staff on public.mensagens_contato
  for select to authenticated
  using (public.can_view_perfil(cliente_usuario_id));

grant select on public.mensagens_contato to authenticated;
grant all on public.mensagens_contato to service_role;

commit;
```

- [ ] **Step 3: Commit no manager-front**

```bash
git add supabase/migrations/*_mensagens_contato.sql
git commit -m "feat(db): tabela mensagens_contato (Fale Conosco) — service-role write, staff-read RLS"
```

- [ ] **Step 4: Abrir PR no manager-front**

```bash
git push origin feat/mensagens-contato
gh pr create --fill --base main
```

- [ ] **Step 5: Aplicar em prod (com OK do owner)**

PARAR e pedir OK explícito do owner. Com OK, aplicar via MCP `apply_migration` (project `jntkpcjmmnaghmimdcam`, name `mensagens_contato`, query = corpo SEM `begin;`/`commit;`) ou pelo runner da equipe.

- [ ] **Step 6: Verificar em prod (MCP read-only)**

Rodar via MCP `execute_sql`:

```sql
select
  to_regclass('public.mensagens_contato')::text as tbl,
  (select count(*) from pg_policies where schemaname='public' and tablename='mensagens_contato') as policies,
  (select relrowsecurity from pg_class where oid = 'public.mensagens_contato'::regclass) as rls_on;
```
Esperado: `tbl='public.mensagens_contato'`, `policies=1`, `rls_on=true`.

- [ ] **Step 7: Limpar worktree**

```bash
cd <path-do-gest-miles-manager-front>
git worktree remove ../gmf-mensagens-contato
```

---

### Task 2: Backend — rota `POST /api/contact` (repo usuario-front, branch `feat/fale-conosco`)

**Files:**
- Create: `backend/src/routes/contact.js`
- Modify: `backend/src/index.js` (import + montagem)
- Modify: `backend/.env.example` (documentar `CONTACT_INBOX_EMAIL`)

Backend não tem harness → sem teste unitário; verificação é no smoke (Task 5).

- [ ] **Step 1: Criar `backend/src/routes/contact.js`**

```js
import { Router } from "express";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const ASSUNTO_MIN = 3;
const ASSUNTO_MAX = 120;
const MSG_MIN = 5;
const MSG_MAX = 2000;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildContatoEmailHtml({ nome, email, assunto, mensagem, when }) {
  const quando = when.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/></head>
<body style="margin:0;background:#F7F7F8;font-family:'DM Sans',Segoe UI,system-ui,sans-serif;color:#1f1f1f;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F7F8;padding:28px 14px;"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #e8e4ec;border-radius:20px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#8A05BE 0%,#9E2FD4 48%,#B56CFF 100%);padding:28px;text-align:center;">
<p style="margin:0 0 10px 0;font-family:'Space Grotesk',Segoe UI,sans-serif;font-size:22px;font-weight:700;color:#ffffff;">Gest Miles</p>
<p style="margin:0;display:inline-block;padding:9px 20px;background:rgba(15,0,28,0.22);border-radius:10px;font-size:14px;font-weight:600;color:#ffffff;">Novo contato (Fale Conosco)</p>
</td></tr>
<tr><td style="padding:24px 32px;background:#ffffff;font-size:15px;line-height:1.6;">
<p style="margin:0 0 10px 0;"><strong>De:</strong> ${escapeHtml(nome) || "—"} ${email ? `&lt;${escapeHtml(email)}&gt;` : ""}</p>
<p style="margin:0 0 10px 0;"><strong>Quando:</strong> ${escapeHtml(quando)}</p>
<p style="margin:0 0 6px 0;"><strong>Assunto:</strong> ${escapeHtml(assunto)}</p>
<div style="margin:14px 0 0 0;padding:14px;background:#faf8fc;border:1px solid #ece8f0;border-radius:12px;white-space:pre-wrap;">${escapeHtml(mensagem)}</div>
</td></tr>
<tr><td style="padding:16px 32px 22px 32px;background:#faf8fc;border-top:1px solid #ece8f0;">
<p style="margin:0;color:#8f8f8f;font-size:11px;">Responda este e-mail para falar diretamente com o cliente.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

/** POST /api/contact — registra a mensagem e notifica a equipe por e-mail. */
router.post("/", requireAuth, async (req, res) => {
  try {
    const assunto = String(req.body?.assunto ?? "").trim();
    const mensagem = String(req.body?.mensagem ?? "").trim();

    if (assunto.length < ASSUNTO_MIN || assunto.length > ASSUNTO_MAX) {
      return res.status(400).json({ error: "Assunto deve ter entre 3 e 120 caracteres." });
    }
    if (mensagem.length < MSG_MIN || mensagem.length > MSG_MAX) {
      return res.status(400).json({ error: "Mensagem deve ter entre 5 e 2000 caracteres." });
    }

    // Zero Trust: revalida o token no servidor.
    const sbUser = createSupabaseWithAuth(req.accessToken);
    const { data: { user } = {}, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    const sbAdmin = assertSupabaseService();
    const { data: perfil } = await sbAdmin
      .from("perfis")
      .select("nome_completo, email, equipe_id")
      .eq("usuario_id", user.id)
      .maybeSingle();

    const emailContato = (perfil?.email || user.email || "").trim() || null;
    const nome = (perfil?.nome_completo || "").trim() || null;
    const equipeId = perfil?.equipe_id ?? null;

    const { data: inserted, error: insErr } = await sbAdmin
      .from("mensagens_contato")
      .insert({
        cliente_usuario_id: user.id,
        equipe_id: equipeId,
        nome,
        email_contato: emailContato,
        assunto,
        mensagem,
        status: "nova",
        origem: "usuario_app",
      })
      .select("id")
      .single();

    if (insErr) {
      return res.status(500).json({ error: insErr.message || "Erro ao registrar mensagem." });
    }

    // E-mail best-effort: nunca derruba o sucesso (a linha já foi salva).
    try {
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
    } catch (mailErr) {
      console.warn("[contact] erro ao enviar e-mail:", mailErr?.message ?? mailErr);
    }

    return res.json({ ok: true, id: inserted.id });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao enviar mensagem." });
  }
});

export default router;
```

- [ ] **Step 2: Montar a rota em `backend/src/index.js`**

Adicionar o import junto aos outros (depois de `import programAccessRoutes ...`):
```js
import contactRoutes from "./routes/contact.js";
```
E montar junto aos demais `routes.use(...)` (depois de `/api/program-access`):
```js
routes.use("/api/contact", contactRoutes);
```

- [ ] **Step 3: Documentar a env em `backend/.env.example`**

Adicionar depois da linha `BREVO_SENDER_NAME=Gest Miles` (linha 23):
```
# Caixa que recebe as mensagens do "Fale Conosco" (default no código: gestmilesapp@gmail.com).
CONTACT_INBOX_EMAIL=gestmilesapp@gmail.com
```

- [ ] **Step 4: Sanidade — backend sobe sem erro de sintaxe**

Run: `node --check backend/src/routes/contact.js && node --check backend/src/index.js`
Expected: sem saída / exit 0 (sintaxe ok).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/contact.js backend/src/index.js backend/.env.example
git commit -m "feat(backend): rota POST /api/contact (Fale Conosco) — grava mensagens_contato + e-mail Brevo"
```

---

### Task 3: Front — helper `submitContato` (TDD)

**Files:**
- Test: `src/lib/contato.test.ts`
- Create: `src/lib/contato.ts`

- [ ] **Step 1: Escrever o teste que falha — `src/lib/contato.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/services/api", () => ({ apiFetch: mocks.apiFetch }));

import { submitContato } from "./contato";

describe("submitContato", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lança erro e não chama apiFetch quando assunto ou mensagem está vazio", async () => {
    await expect(submitContato({ assunto: "   ", mensagem: "oi", token: "t" })).rejects.toThrow();
    await expect(submitContato({ assunto: "Tema", mensagem: "   ", token: "t" })).rejects.toThrow();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("chama apiFetch com payload trim e token quando válido", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: true, id: "abc" });

    const res = await submitContato({
      assunto: "  Sugestão  ",
      mensagem: "  Texto da mensagem  ",
      token: "tok-1",
    });

    expect(mocks.apiFetch).toHaveBeenCalledWith("/api/contact", {
      method: "POST",
      body: JSON.stringify({ assunto: "Sugestão", mensagem: "Texto da mensagem" }),
      token: "tok-1",
    });
    expect(res).toEqual({ ok: true, id: "abc" });
  });

  it("propaga erro do apiFetch", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error("falha"));
    await expect(
      submitContato({ assunto: "Tema", mensagem: "mensagem", token: "t" }),
    ).rejects.toThrow("falha");
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/lib/contato.test.ts`
Expected: FAIL — não resolve `./contato` (módulo não existe).

- [ ] **Step 3: Implementar `src/lib/contato.ts`**

```ts
import { apiFetch } from "@/services/api";

export type ContatoInput = {
  assunto: string;
  mensagem: string;
  token: string;
};

export type ContatoResult = {
  ok: boolean;
  id?: string;
};

/**
 * Envia a mensagem do "Fale Conosco" para o backend (POST /api/contact).
 * Validação de presença aqui é só UX — o backend revalida e é a autoridade.
 */
export async function submitContato(input: ContatoInput): Promise<ContatoResult> {
  const assunto = (input.assunto ?? "").trim();
  const mensagem = (input.mensagem ?? "").trim();
  if (!assunto || !mensagem) {
    throw new Error("Preencha o assunto e a mensagem.");
  }
  return apiFetch<ContatoResult>("/api/contact", {
    method: "POST",
    body: JSON.stringify({ assunto, mensagem }),
    token: input.token,
  });
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npm test -- src/lib/contato.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contato.ts src/lib/contato.test.ts
git commit -m "feat(usuario): helper submitContato + testes (Fale Conosco)"
```

---

### Task 4: Front — ligar `FaleConoscoPage`

**Files:**
- Modify: `src/pages/FaleConoscoPage.tsx` (substitui o conteúdo inteiro)

- [ ] **Step 1: Substituir `src/pages/FaleConoscoPage.tsx`**

```tsx
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { hasApiUrl } from "@/services/api";
import { submitContato } from "@/lib/contato";

const FaleConoscoPage = () => {
  const navigate = useNavigate();
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async () => {
    if (!assunto.trim() || !mensagem.trim()) {
      toast.error("Preencha o assunto e a mensagem.");
      return;
    }
    if (!hasApiUrl()) {
      toast.error("Envio indisponível no momento. Tente novamente mais tarde.");
      return;
    }
    setEnviando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.error("Sua sessão expirou. Entre novamente para enviar.");
        return;
      }
      await submitContato({ assunto, mensagem, token });
      toast.success("Mensagem enviada! Em breve a equipe responde por e-mail.");
      setAssunto("");
      setMensagem("");
    } catch {
      toast.error("Não foi possível enviar sua mensagem agora. Tente novamente em instantes.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-semibold tracking-tight">Fale Conosco</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-4 p-4">
            <p className="text-sm text-muted-foreground">
              Envie dúvidas, feedbacks ou sugestões sobre a GestMiles.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="assunto">
                Assunto
              </label>
              <Input
                id="assunto"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                maxLength={120}
                placeholder="Ex: Sugestão de melhoria"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="mensagem">
                Mensagem
              </label>
              <Textarea
                id="mensagem"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Conte como podemos ajudar ou o que você gostaria de ver na plataforma."
              />
            </div>
            <Button type="button" className="w-full" onClick={handleSubmit} disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar mensagem"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default FaleConoscoPage;
```

- [ ] **Step 2: Type-check + testes**

Run: `npx tsc -b && npm test`
Expected: `tsc -b` sem erro; Vitest verde (incluindo `contato.test.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/pages/FaleConoscoPage.tsx
git commit -m "feat(usuario): liga o form Fale Conosco ao backend (submit + toast + loading)"
```

---

### Task 5: Gate de verificação + smoke runtime

**Pré-condição:** Task 1 aplicada em prod (tabela existe), Task 2 deployada OU backend local no ar (`npm run dev:all`).

- [ ] **Step 1: Gate completo**

Run: `npx tsc -b && npm test && npm run build`
Expected: tudo verde (TS sem erro, Vitest passa, build conclui).

- [ ] **Step 2: Smoke E2E (Playwright)**

Reusar o harness (`Temp/smoke_*.py`, launcher `py`, conta `smoke-usuario@gestmiles.com.br` — senha com o owner; se Playwright atualizou, `py -m playwright install chromium`). Roteiro:
1. Login (`#auth-email` / `#auth-password`, botão "Entrar").
2. Navegar pra `/fale-conosco`.
3. Preencher `#assunto` e `#mensagem`.
4. Clicar "Enviar mensagem".
5. Esperar o toast de sucesso ("Mensagem enviada!").

Expected: toast de sucesso, sem erro no console.

- [ ] **Step 3: Confirmar a gravação (MCP read-only)**

```sql
select id, cliente_usuario_id, equipe_id, assunto, status, origem, created_at
from public.mensagens_contato
order by created_at desc
limit 3;
```
Expected: a linha do smoke aparece com `status='nova'`, `origem='usuario_app'`.

- [ ] **Step 4: Abrir PR do usuario-front**

```bash
git push origin feat/fale-conosco
gh pr create --fill --base main
```

- [ ] **Step 5 (opcional, com OK do owner): confirmar e-mail**

Checar a caixa `gestmilesapp@gmail.com` — deve ter chegado o "Novo contato (Fale Conosco) — <assunto>" com reply-to do cliente. (Se Brevo não estiver configurado no backend de prod, a mensagem ainda fica registrada; o e-mail é best-effort.)

---

## Notas de execução

- **Ordem entre repos:** Task 1 pode ser feita em paralelo às Tasks 2–4 (código), mas o **smoke (Task 5) exige a migration aplicada**. Não declarar "pronto" sem o gate verde + smoke.
- **Zero Trust:** a validação do front é só UX; o backend revalida o Bearer (`getUser`) e os limites (3–120 / 5–2000). A tabela não é legível pelo browser do cliente.
- **Best-effort e-mail:** falha de Brevo loga e não derruba o request — a linha já foi gravada antes.
- **Sem listagem no cliente:** a tela não mostra histórico (fora de escopo). Leitura no manager = ciclo separado.
