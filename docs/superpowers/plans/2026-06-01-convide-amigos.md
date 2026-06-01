# Convide Amigos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a tela "Convide Amigos" funcional como programa de indicação cliente→amigo com atribuição: link compartilhável + convite por e-mail (Brevo), e vínculo do amigo a quem indicou quando ele se cadastra.

**Architecture:** Banco compartilhado (`jntkpcjmmnaghmimdcam`) recebe 2 tabelas (`indicacao_codigos`, `indicacoes`) sem RLS pra `authenticated` (só RPC `SECURITY DEFINER` + service role), no padrão de segredos do repo. O front lê código+contador via RPC, copia o link e dispara o convite por e-mail via backend Express (`POST /api/referrals/invite`). O `?ref=` é capturado no `SignUp.tsx` (sessionStorage) e a atribuição roda no ramo de **usuário novo** do `Me.tsx` (RPC `indicacao_registrar_self`).

**Tech Stack:** React 18 + Vite + TS (frouxo), Vitest/RTL, Express 4, Supabase (RPC `SECURITY DEFINER`), Brevo (e-mail). Gate: `npx tsc -b` + `npm test` + `npm run build`.

> **Banco compartilhado sem staging.** A migration (Task 1) vai no repo canônico `gest-miles-manager-front` e **só é aplicada em prod com OK explícito do owner** (MCP `apply_migration`). Spec: `docs/superpowers/specs/2026-06-01-convide-amigos-design.md`.

> Branch de trabalho no usuario-front: `feat/convide-amigos` (já criada; o spec já está commitado nela).

---

### Task 1: Migration — tabelas + RLS + RPCs (repo manager-front + aplicar em prod)

**Files:**
- Create (manager-front, repo canônico): `supabase/migrations/<YYYYMMDDHHMMSS>_convide_amigos_indicacoes.sql`

**SQL completo da migration:**

```sql
begin;

-- Convide Amigos: indicação cliente->amigo com atribuição.
-- Padrão seguro do repo (cliente_programa_acessos): sem RLS para authenticated;
-- acesso só via RPC SECURITY DEFINER (autoridade = auth.uid()) + service role.

create table if not exists public.indicacao_codigos (
  usuario_id uuid primary key,
  codigo     text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.indicacoes (
  id                    uuid primary key default gen_random_uuid(),
  indicador_usuario_id  uuid not null,
  indicado_usuario_id   uuid,
  indicado_email        text,
  status                text not null default 'convidado' check (status in ('convidado','cadastrado')),
  origem                text not null check (origem in ('email','link')),
  created_at            timestamptz not null default now(),
  registered_at         timestamptz
);

-- 1 atribuição por amigo (primeiro vence); muitos nulos permitidos (convites pendentes).
create unique index if not exists indicacoes_indicado_uid_uniq
  on public.indicacoes (indicado_usuario_id)
  where indicado_usuario_id is not null;
create index if not exists indicacoes_indicador_idx
  on public.indicacoes (indicador_usuario_id);
create index if not exists indicacoes_indicado_email_idx
  on public.indicacoes (lower(indicado_email))
  where indicado_email is not null;

alter table public.indicacao_codigos enable row level security;
alter table public.indicacoes        enable row level security;
revoke all on public.indicacao_codigos from anon, authenticated;
revoke all on public.indicacoes        from anon, authenticated;
grant all on public.indicacao_codigos to service_role;
grant all on public.indicacoes        to service_role;

-- Helper interno: get-or-create de código curto único (alfabeto sem ambíguos).
create or replace function public.indicacao_codigo_get_or_create(p_usuario_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_codigo text;
  v_alpha  text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  i int; attempt int := 0;
begin
  select codigo into v_codigo from public.indicacao_codigos where usuario_id = p_usuario_id;
  if v_codigo is not null then return v_codigo; end if;
  loop
    attempt := attempt + 1;
    v_codigo := '';
    for i in 1..8 loop
      v_codigo := v_codigo || substr(v_alpha, 1 + floor(random()*length(v_alpha))::int, 1);
    end loop;
    begin
      insert into public.indicacao_codigos (usuario_id, codigo) values (p_usuario_id, v_codigo);
      return v_codigo;
    exception when unique_violation then
      select codigo into v_codigo from public.indicacao_codigos where usuario_id = p_usuario_id;
      if v_codigo is not null then return v_codigo; end if;
      if attempt >= 10 then raise exception 'não foi possível gerar código de indicação'; end if;
    end;
  end loop;
end; $$;
revoke all on function public.indicacao_codigo_get_or_create(uuid) from public;
grant execute on function public.indicacao_codigo_get_or_create(uuid) to service_role;

-- Resumo do próprio usuário: código (cria se faltar) + total de indicados cadastrados.
create or replace function public.indicacao_meu_resumo()
returns json language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_codigo text; v_total int;
begin
  if v_uid is null then raise exception 'não autenticado'; end if;
  v_codigo := public.indicacao_codigo_get_or_create(v_uid);
  select count(*) into v_total from public.indicacoes
   where indicador_usuario_id = v_uid and indicado_usuario_id is not null;
  return json_build_object('codigo', v_codigo, 'total_cadastrados', v_total);
end; $$;
revoke all on function public.indicacao_meu_resumo() from public;
grant execute on function public.indicacao_meu_resumo() to authenticated;

-- Atribuição: chamada pelo amigo recém-cadastrado (auth.uid() = indicado).
create or replace function public.indicacao_registrar_self(p_codigo text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_codigo text := upper(btrim(coalesce(p_codigo,'')));
  v_indicador uuid; v_email text; v_updated int;
begin
  if v_uid is null then raise exception 'não autenticado'; end if;
  if v_codigo = '' then return false; end if;
  select usuario_id into v_indicador from public.indicacao_codigos where codigo = v_codigo;
  if v_indicador is null then return false; end if;            -- código inválido
  if v_indicador = v_uid then return false; end if;           -- auto-indicação
  if exists (select 1 from public.indicacoes where indicado_usuario_id = v_uid)
    then return false; end if;                                -- já atribuído (idempotente)

  select lower(email) into v_email from auth.users where id = v_uid;

  -- Reconciliação: convite por e-mail pendente do MESMO indicador batendo o e-mail.
  update public.indicacoes
     set indicado_usuario_id = v_uid, status = 'cadastrado', registered_at = now()
   where id = (
     select id from public.indicacoes
      where indicador_usuario_id = v_indicador and indicado_usuario_id is null
        and status = 'convidado' and v_email is not null and lower(indicado_email) = v_email
      order by created_at asc limit 1
   );
  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    insert into public.indicacoes (indicador_usuario_id, indicado_usuario_id, status, origem, registered_at)
    values (v_indicador, v_uid, 'cadastrado', 'link', now());
  end if;
  return true;
exception when unique_violation then return false;            -- corrida na atribuição
end; $$;
revoke all on function public.indicacao_registrar_self(text) from public;
grant execute on function public.indicacao_registrar_self(text) to authenticated;

commit;
```

- [ ] **Step 1: Localizar o repo manager-front e branquear de origin/main**

Localizar o checkout de `gest-miles-manager-front` (repo canônico). `git fetch origin` e criar worktree/branch a partir de `origin/main` (há agente paralelo lá — não usar o main local). Nome do arquivo: timestamp `YYYYMMDDHHMMSS` posterior ao tip atual de `supabase/migrations/` do manager-front.

- [ ] **Step 2: Escrever o arquivo da migration**

Conteúdo = o SQL completo acima (begin/commit). Commit no branch do manager-front: `feat(db): tabelas indicacoes + RPCs (Convide Amigos)`.

- [ ] **Step 3: PEDIR OK EXPLÍCITO DO OWNER e aplicar em prod**

⚠️ Banco compartilhado. Só após "ok": aplicar via MCP `apply_migration` (name `convide_amigos_indicacoes`, query = SQL acima). Abrir PR no manager-front.

- [ ] **Step 4: Verificar em prod (MCP read-only)**

Run (MCP `execute_sql`):
```sql
select to_regclass('public.indicacao_codigos') as t1, to_regclass('public.indicacoes') as t2;
select proname from pg_proc where proname in
 ('indicacao_codigo_get_or_create','indicacao_meu_resumo','indicacao_registrar_self') order by 1;
```
Expected: `t1`/`t2` não-nulos; 3 funções listadas.

---

### Task 2: Front helper `src/lib/indicacao.ts` (TDD)

**Files:**
- Create: `src/lib/indicacao.ts`
- Test: `src/lib/indicacao.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

`src/lib/indicacao.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/services/api", () => ({ apiFetch: mocks.apiFetch }));

import { enviarConviteIndicacao } from "./indicacao";

describe("enviarConviteIndicacao", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("lança erro e não chama apiFetch quando e-mail é vazio ou inválido", async () => {
    await expect(enviarConviteIndicacao({ email: "   ", token: "t" })).rejects.toThrow();
    await expect(enviarConviteIndicacao({ email: "semarroba", token: "t" })).rejects.toThrow();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it("chama apiFetch com e-mail normalizado (trim+lower) e token quando válido", async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: true });
    const res = await enviarConviteIndicacao({ email: "  Amigo@Email.COM ", token: "tok-1" });
    expect(mocks.apiFetch).toHaveBeenCalledWith("/api/referrals/invite", {
      method: "POST",
      body: JSON.stringify({ email: "amigo@email.com" }),
      token: "tok-1",
    });
    expect(res).toEqual({ ok: true });
  });

  it("propaga erro do apiFetch", async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error("falha"));
    await expect(enviarConviteIndicacao({ email: "a@b.com", token: "t" })).rejects.toThrow("falha");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/lib/indicacao.test.ts`
Expected: FAIL (módulo `./indicacao` não existe).

- [ ] **Step 3: Implementar**

`src/lib/indicacao.ts`:
```ts
import { apiFetch } from "@/services/api";

export type ConviteIndicacaoInput = { email: string; token: string };
export type ConviteIndicacaoResult = { ok: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Dispara o convite de indicação (POST /api/referrals/invite).
 * Validação aqui é só UX — o backend revalida e é a autoridade.
 */
export async function enviarConviteIndicacao(
  input: ConviteIndicacaoInput,
): Promise<ConviteIndicacaoResult> {
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    throw new Error("Informe um e-mail válido.");
  }
  return apiFetch<ConviteIndicacaoResult>("/api/referrals/invite", {
    method: "POST",
    body: JSON.stringify({ email }),
    token: input.token,
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/lib/indicacao.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/indicacao.ts src/lib/indicacao.test.ts
git commit -m "feat(usuario): helper enviarConviteIndicacao + testes (Convide Amigos)"
```

---

### Task 3: Backend — rota `POST /api/referrals/invite`

**Files:**
- Create: `backend/src/routes/referrals.js`
- Modify: `backend/src/index.js` (import + mount após `/api/contact`, linha ~16 e ~82)

- [ ] **Step 1: Criar a rota**

`backend/src/routes/referrals.js`:
```js
import { Router } from "express";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildConviteEmailHtml({ nome, link }) {
  const de = escapeHtml(nome) || "Um amigo";
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/></head>
<body style="margin:0;background:#F7F7F8;font-family:'DM Sans',Segoe UI,system-ui,sans-serif;color:#1f1f1f;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F7F8;padding:28px 14px;"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #e8e4ec;border-radius:20px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#8A05BE 0%,#9E2FD4 48%,#B56CFF 100%);padding:28px;text-align:center;">
<p style="margin:0 0 10px 0;font-family:'Space Grotesk',Segoe UI,sans-serif;font-size:22px;font-weight:700;color:#ffffff;">Gest Miles</p>
<p style="margin:0;display:inline-block;padding:9px 20px;background:rgba(15,0,28,0.22);border-radius:10px;font-size:14px;font-weight:600;color:#ffffff;">Você foi convidado</p>
</td></tr>
<tr><td style="padding:24px 32px;background:#ffffff;font-size:15px;line-height:1.6;">
<p style="margin:0 0 14px 0;"><strong>${de}</strong> está usando a Gest Miles para gerenciar milhas de forma profissional e te convidou para conhecer.</p>
<p style="margin:0 0 22px 0;">Crie sua conta pelo botão abaixo — leva menos de um minuto.</p>
<p style="margin:0 0 6px 0;text-align:center;">
<a href="${escapeHtml(link)}" style="display:inline-block;padding:13px 26px;background:#8A05BE;border-radius:12px;color:#ffffff;font-weight:600;text-decoration:none;">Criar minha conta</a>
</p>
<p style="margin:18px 0 0 0;font-size:12px;color:#8f8f8f;">Ou copie e cole este link no navegador:<br/>${escapeHtml(link)}</p>
</td></tr>
<tr><td style="padding:16px 32px 22px 32px;background:#faf8fc;border-top:1px solid #ece8f0;">
<p style="margin:0;color:#8f8f8f;font-size:11px;">Se você não esperava este convite, pode ignorar este e-mail.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

/** POST /api/referrals/invite — registra o convite e envia o link por e-mail. */
router.post("/invite", requireAuth, async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Informe um e-mail válido." });
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
      .select("nome_completo, email")
      .eq("usuario_id", user.id)
      .maybeSingle();

    const remetenteEmail = (perfil?.email || user.email || "").trim().toLowerCase();
    if (remetenteEmail && remetenteEmail === email) {
      return res.status(400).json({ error: "Você não pode convidar a si mesmo." });
    }
    const nome = (perfil?.nome_completo || "").trim() || null;

    // get-or-create do código do remetente (deriva do user.id; não confia no body).
    const { data: codigo, error: codeErr } = await sbAdmin.rpc(
      "indicacao_codigo_get_or_create",
      { p_usuario_id: user.id },
    );
    if (codeErr || !codigo) {
      return res.status(500).json({ error: "Não foi possível gerar seu código de indicação." });
    }

    const { error: insErr } = await sbAdmin.from("indicacoes").insert({
      indicador_usuario_id: user.id,
      indicado_email: email,
      status: "convidado",
      origem: "email",
    });
    if (insErr) {
      return res.status(500).json({ error: insErr.message || "Erro ao registrar o convite." });
    }

    // E-mail best-effort: nunca derruba o sucesso (a linha já foi salva).
    try {
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
    } catch (mailErr) {
      console.warn("[referrals] erro ao enviar e-mail:", mailErr?.message ?? mailErr);
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao enviar convite." });
  }
});

export default router;
```

- [ ] **Step 2: Montar no index.js**

Em `backend/src/index.js`, após `import contactRoutes from "./routes/contact.js";` (linha 16):
```js
import referralsRoutes from "./routes/referrals.js";
```
E após `routes.use("/api/contact", contactRoutes);` (linha 82):
```js
routes.use("/api/referrals", referralsRoutes);
```

- [ ] **Step 3: Sanity (sobe sem erro de import)**

Run: `node --check backend/src/routes/referrals.js`
Expected: sem saída (sintaxe ok). (Smoke real do endpoint = Task 7.)

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/referrals.js backend/src/index.js
git commit -m "feat(backend): rota POST /api/referrals/invite (Convide Amigos)"
```

---

### Task 4: Captura do `?ref=` no cadastro

**Files:**
- Modify: `src/lib/authFlowStorage.ts`
- Modify: `src/pages/SignUp.tsx`

- [ ] **Step 1: Adicionar a chave de storage**

Em `src/lib/authFlowStorage.ts`, no fim do arquivo:
```ts
/** sessionStorage: código de indicação (?ref=) capturado no cadastro; atribuído após /me. */
export const PENDING_REFERRAL_CODE_KEY = "gestmiles_pending_referral_code";
```

- [ ] **Step 2: Capturar `?ref=` no SignUp**

Em `src/pages/SignUp.tsx`:
- Import: `import { PENDING_REFERRAL_CODE_KEY } from "@/lib/authFlowStorage";`
- Após `const fromInvite = searchParams.get("fromInvite") === "1";` (linha 14), adicionar um efeito que persiste o ref:
```tsx
const refCode = searchParams.get("ref");
useEffect(() => {
  if (refCode && refCode.trim()) {
    sessionStorage.setItem(PENDING_REFERRAL_CODE_KEY, refCode.trim());
  }
}, [refCode]);
```
- Garantir `useEffect` no import do React (`import { useEffect, useMemo, useState } from "react";`).

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc -b`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/authFlowStorage.ts src/pages/SignUp.tsx
git commit -m "feat(usuario): captura ?ref= no cadastro (Convide Amigos)"
```

---

### Task 5: Atribuição pós-cadastro no `Me.tsx`

**Files:**
- Modify: `src/pages/Me.tsx`

- [ ] **Step 1: Import da chave**

Em `src/pages/Me.tsx`, ajustar o import existente:
```ts
import { PENDING_INVITE_TOKEN_KEY, PENDING_REFERRAL_CODE_KEY } from "@/lib/authFlowStorage";
```

- [ ] **Step 2: Atribuir no ramo de usuário novo**

No bloco que cria o perfil novo, **após** `await refreshRole();` (logo após o `ensure_self_cliente_profile`, ~linha 84) e **antes** do bloco de `accessToken`/invites, inserir:
```ts
// Atribuição de indicação (Convide Amigos): só roda no ramo de usuário novo,
// garantindo que apenas cadastros novos são atribuídos. RPC reforça no-self-ref + idempotência.
const refCode = sessionStorage.getItem(PENDING_REFERRAL_CODE_KEY);
if (refCode) {
  try {
    await supabase.rpc("indicacao_registrar_self", { p_codigo: refCode });
  } catch {
    /* código inválido / já atribuído — não bloqueia o onboarding */
  }
  sessionStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
}
```

- [ ] **Step 3: Limpar a chave no early-return de usuário existente (defensivo)**

No ramo `if (existing?.slug) { ... }` (antes do `return`), adicionar:
```ts
sessionStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
```
(Usuário já existente não atribui; evita vazar o ref pra uma sessão futura.)

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc -b`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Me.tsx
git commit -m "feat(usuario): atribuição de indicação pós-cadastro (Me.tsx)"
```

---

### Task 6: Tela `ConvideAmigosPage` funcional

**Files:**
- Modify (reescrita): `src/pages/ConvideAmigosPage.tsx`
- Test: `src/pages/ConvideAmigosPage.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

`src/pages/ConvideAmigosPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
  enviarConvite: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc, auth: { getSession: mocks.getSession } },
}));
vi.mock("@/services/api", () => ({ hasApiUrl: () => true }));
vi.mock("@/lib/indicacao", () => ({ enviarConviteIndicacao: mocks.enviarConvite }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

import ConvideAmigosPage from "./ConvideAmigosPage";

const renderPage = () =>
  render(
    <MemoryRouter>
      <ConvideAmigosPage />
    </MemoryRouter>,
  );

describe("ConvideAmigosPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: { codigo: "AB12CD34", total_cadastrados: 3 }, error: null });
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "tok" } } });
    Object.assign(navigator, { clipboard: { writeText: mocks.writeText } });
    mocks.writeText.mockResolvedValue(undefined);
  });

  it("mostra link com o código e o contador vindos da RPC", async () => {
    renderPage();
    const linkInput = await screen.findByDisplayValue(/ref=AB12CD34/);
    expect(linkInput).toBeTruthy();
    expect(screen.getByText(/3/)).toBeTruthy();
  });

  it("copia o link ao clicar em Copiar", async () => {
    renderPage();
    await screen.findByDisplayValue(/ref=AB12CD34/);
    fireEvent.click(screen.getByRole("button", { name: /copiar/i }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(expect.stringContaining("ref=AB12CD34")));
  });

  it("envia o convite por e-mail e limpa o campo", async () => {
    mocks.enviarConvite.mockResolvedValueOnce({ ok: true });
    renderPage();
    await screen.findByDisplayValue(/ref=AB12CD34/);
    const emailInput = screen.getByPlaceholderText(/nome@empresa.com/i) as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "amigo@email.com" } });
    fireEvent.click(screen.getByRole("button", { name: /enviar convite/i }));
    await waitFor(() =>
      expect(mocks.enviarConvite).toHaveBeenCalledWith({ email: "amigo@email.com", token: "tok" }),
    );
    await waitFor(() => expect(emailInput.value).toBe(""));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/pages/ConvideAmigosPage.test.tsx`
Expected: FAIL (tela ainda é o stub sem link/contador/envio).

- [ ] **Step 3: Reescrever a tela**

`src/pages/ConvideAmigosPage.tsx`:
```tsx
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { hasApiUrl } from "@/services/api";
import { enviarConviteIndicacao } from "@/lib/indicacao";

const appOrigin =
  (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "");

const ConvideAmigosPage = () => {
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("indicacao_meu_resumo");
        if (error) throw error;
        if (!ativo) return;
        const resumo = (data ?? {}) as { codigo?: string; total_cadastrados?: number };
        setCodigo(resumo.codigo ?? null);
        setTotal(resumo.total_cadastrados ?? 0);
      } catch {
        if (ativo) setCodigo(null);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const link = codigo ? `${appOrigin}/auth/sign-up?ref=${encodeURIComponent(codigo)}` : "";

  const handleCopiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };

  const handleEnviar = async () => {
    if (!email.trim()) {
      toast.error("Informe o e-mail do amigo.");
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
      await enviarConviteIndicacao({ email, token });
      toast.success("Convite enviado! Seu amigo vai receber o link por e-mail.");
      setEmail("");
    } catch {
      toast.error("Não foi possível enviar o convite agora. Tente novamente em instantes.");
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
          <h1 className="text-base font-semibold tracking-tight">Convide Amigos</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="space-y-4 px-4 py-6">
        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-4 p-4">
            <p className="text-sm text-muted-foreground">
              Compartilhe a Gest Miles com outros gestores e consultores. Quando seu amigo se
              cadastrar pelo seu link, ele fica vinculado a você.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="ref-link">
                Seu link de indicação
              </label>
              <div className="flex gap-2">
                <Input
                  id="ref-link"
                  readOnly
                  value={link || "Gerando seu link..."}
                  className="text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={handleCopiar}
                  disabled={!link}
                  aria-label="Copiar link"
                >
                  {copiado ? <Check size={16} /> : <Copy size={16} />}
                  <span className="ml-1.5 hidden sm:inline">Copiar</span>
                </Button>
              </div>
            </div>

            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              <strong className="text-foreground">{total}</strong>{" "}
              {total === 1 ? "amigo já se cadastrou" : "amigos já se cadastraram"} pelo seu link.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-4 p-4">
            <p className="text-sm text-muted-foreground">Prefere convidar por e-mail?</p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                E-mail do convidado
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.com"
              />
            </div>
            <Button type="button" className="w-full" onClick={handleEnviar} disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar convite"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ConvideAmigosPage;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- src/pages/ConvideAmigosPage.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/pages/ConvideAmigosPage.tsx src/pages/ConvideAmigosPage.test.tsx
git commit -m "feat(usuario): tela Convide Amigos funcional (link + contador + e-mail)"
```

---

### Task 7: Doc de env + gate completo

**Files:**
- Modify: `backend/.env.example` (se `PUBLIC_APP_URL` não estiver documentado)

- [ ] **Step 1: Conferir/Documentar env**

Verificar `backend/.env.example`: garantir que `PUBLIC_APP_URL` está documentado (usado no link do convite; já usado em `auth.js`). Se faltar, adicionar com comentário. `VITE_APP_URL` (front) já é usado pelo `ForgotPassword`; conferir `.env.example` da raiz.

- [ ] **Step 2: Gate — type-check**

Run: `npx tsc -b`
Expected: sem erros.

- [ ] **Step 3: Gate — testes**

Run: `npm test`
Expected: todos passam (incluindo `indicacao.test.ts` e `ConvideAmigosPage.test.tsx`).

- [ ] **Step 4: Gate — build**

Run: `npm run build`
Expected: build conclui sem erro.

- [ ] **Step 5: Commit (se houve mudança de env)**

```bash
git add backend/.env.example .env.example
git commit -m "docs(backend): documenta PUBLIC_APP_URL para o link de indicação"
```

---

### Task 8: Smoke E2E (Playwright) + verificação em prod + limpeza

> Requer Task 1 aplicada em prod e `npm run dev:all` no ar. Launcher `py`, `sys.stdout.reconfigure(encoding="utf-8")`. Detectar a porta do Vite (varia a partir de :3081). Backend :3040.

- [ ] **Step 1: Resumo + link (cliente A)**

Login `smoke-usuario@gestmiles.com.br` → `/convide-amigos`. Confirmar que o link com `?ref=` aparece e o contador renderiza. Extrair o `codigo` do link.

- [ ] **Step 2: Cadastro do amigo pelo link (cliente B novo)**

Em contexto anônimo, abrir `/auth/sign-up?ref=<codigo>`, cadastrar um e-mail de teste novo, completar → cair em `/me` → `/`.

- [ ] **Step 3: Verificar atribuição (MCP read-only)**

Run (MCP `execute_sql`):
```sql
select indicador_usuario_id, indicado_usuario_id, status, origem
from public.indicacoes order by created_at desc limit 5;
```
Expected: linha `status='cadastrado'`, `origem='link'`, indicador = A, indicado = B.

- [ ] **Step 4: Contador sobe**

Recarregar `/convide-amigos` de A → contador = valor inicial + 1.

- [ ] **Step 5: Convite por e-mail**

Na tela de A, preencher um e-mail e "Enviar convite" → toast de sucesso. Confirmar linha `status='convidado'`, `origem='email'` via MCP.

- [ ] **Step 6: Limpeza de prod**

Remover linhas de teste de `indicacoes`/`indicacao_codigos` e o usuário de teste B criado (via MCP / coordenação), preservando a conta smoke A.

---

## Ordem & deploy

1. Task 1 (migration manager-front) **com OK do owner** → aplicada em prod **antes** do deploy de back/front.
2. Tasks 2–7 no `feat/convide-amigos` (usuario-front) → gate verde.
3. Task 8 smoke (precisa de prod + app no ar).
4. PR no usuario-front. Atenção ao deploy do backend na Vercel (histórico de rate-limit no free).
