# Runbook — Ligar "Confirm email" (GoTrue) com segurança

**Objetivo:** fechar a brecha latente onde o cadastro confirma o e-mail automaticamente
(`auto-confirm`), permitindo reivindicar um e-mail alheio. Ligar o **"Confirm email"** do
Supabase Auth (GoTrue) passa a exigir que o usuário clique no link enviado por e-mail antes
de logar.

> ⚠️ **É GLOBAL e o backend é compartilhado** (`jntkpcjmmnaghmimdcam`). Ligar afeta o
> **onboarding dos 3 apps** (usuario + manager + admin). **Alinhe com manager/admin antes.**

> ⚠️ **Ordem importa.** Configure e **teste o envio de e-mail ANTES** de ligar o toggle.
> Se ligar o "Confirm email" sem um SMTP que entregue, **todo signup novo dos 3 apps fica
> trancado** (cria conta, não recebe confirmação, não loga).

A parte de **código** (deste repo) já está pronta e no `main` quando este PR mergear:
o signup passa `emailRedirectTo`, a tela de cadastro mostra "verifique seu e-mail" + botão
de reenviar, e o login trata o erro "Email not confirmed" com mensagem + reenviar.
**O que falta é só o dashboard do Supabase — abaixo.**

---

## Passo 1 — SMTP do Resend no Supabase (envio de produção)

O SMTP default do Supabase é rate-limited (~3-4/h) e **não serve pra produção**. Use o Resend
(que o projeto já usa no reset de senha).

1. No **Resend**: crie/pegue uma **API key** e confirme que o domínio remetente está
   **verificado** (ex.: `gestmiles.com.br`).
2. No **Supabase** → **Authentication → Emails → SMTP Settings** (ou *Project Settings → Auth →
   SMTP*) → **Enable Custom SMTP** e preencha:
   - **Host:** `smtp.resend.com`
   - **Port:** `465` (SSL) ou `587` (TLS)
   - **Username:** `resend`
   - **Password:** a **API key do Resend**
   - **Sender email:** um endereço do domínio verificado (ex.: `nao-responda@gestmiles.com.br`)
   - **Sender name:** `Gest Miles`
3. Salve.

## Passo 2 — Redirect URLs (allowlist)

O link de confirmação só funciona se o destino estiver na allowlist.

- **Authentication → URL Configuration:**
  - **Site URL:** `https://app.gestmiles.com.br`
  - **Redirect URLs** (adicione todas que se aplicam):
    - `https://app.gestmiles.com.br/me`
    - `http://localhost:3081/me` (dev, se for testar local)
    - os equivalentes de **manager** e **admin**, se eles também usarem confirmação.

> O código manda `emailRedirectTo = <origin>/me` (mesmo destino do magic link / Google).

## Passo 3 — (opcional) Template do e-mail de confirmação

- **Authentication → Emails → Templates → "Confirm signup":** ajuste o HTML/assunto pra marca
  Gest Miles. O editor já cobre branding — não precisa de edge function.

## Passo 4 — Teste o envio ANTES de exigir confirmação

- Use **magic link** numa conta de teste (Authentication → ou pela própria tela de login) OU
  dispare um "Confirm signup" de teste e confirme que o e-mail **chega pelo Resend** (cheque o
  painel do Resend: evento de entrega).
- Só avance se o e-mail chegou.

## Passo 5 — Ligar o "Confirm email"

- **Authentication → Sign In / Providers → Email → "Confirm email": ON.**
- A partir daqui, **cadastros novos** precisam confirmar antes de logar.

## Passo 6 — Verificação ponta-a-ponta

1. Crie uma conta nova (e-mail real seu) no app.
2. A tela deve mostrar *"Conta criada. Enviamos um e-mail de confirmação…"* + botão **Reenviar**.
3. Tente logar antes de confirmar → deve aparecer *"Confirme seu e-mail antes de entrar…"* +
   botão **Reenviar**.
4. Clique no link do e-mail → deve cair em `/me` **já logado**.

---

## Notas importantes

- **Usuários existentes não são afetados** — quem já existe está `email_confirmed_at` setado
  (auto-confirm histórico). O toggle só vale pra **cadastros novos**.
- **Google OAuth e Magic Link não mudam** — o provedor/o próprio OTP já provam o e-mail.
- **Convites** (`/api/invites/accept`) ficam **mais fortes**: com confirmação ligada, o
  `email-match` passa a provar posse do inbox (hoje é só o token secreto que garante).

## Rollback

- Reverter = **Authentication → Email → "Confirm email": OFF**. Volta ao auto-confirm na hora,
  sem migration. (O código deste PR continua funcionando com o toggle OFF — só não exibe os
  fluxos de confirmação.)
