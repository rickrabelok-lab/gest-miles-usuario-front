# Templates de e-mail do Supabase Auth (GoTrue) — Gest Miles

Templates **branded em PT-BR** (visual roxo Gest Miles, mesmo dos e-mails do backend
em `mailer.js`) para colar no dashboard, substituindo os defaults em inglês do Supabase.

## Onde colar

**Supabase → Authentication → Emails → Templates** → selecione cada template →
cole o HTML no corpo e ajuste o **Subject**. Salve cada um.

| Template no Supabase | Arquivo | Subject sugerido |
|----------------------|---------|------------------|
| **Confirm signup** | [`confirm-signup.html`](confirm-signup.html) | `Confirme seu e-mail · Gest Miles` |
| **Reset Password** (Recovery) | [`reset-password.html`](reset-password.html) | `Redefinir sua senha · Gest Miles` |
| **Magic Link** | [`magic-link.html`](magic-link.html) | `Seu link de acesso · Gest Miles` |

> **Confirm signup** é o essencial para o toggle "Confirm email" (ver
> `docs/confirm-email-runbook.md`). Os outros são polimento dos e-mails que já
> existem (recovery/magic link).

## Variável GoTrue

Todos usam `{{ .ConfirmationURL }}` (o link de ação que o GoTrue injeta — confirmar,
redefinir, ou logar). **Mantenha esse token literal** no HTML; o GoTrue o substitui no
envio. Não troque por uma URL fixa.

## Notas

- HTML table-based + estilos inline (compatível com clientes de e-mail), espelhando o
  template de convite em `backend/src/routes/referrals.js`.
- Marca: roxo `#8A05BE` (gradiente no header), fontes DM Sans / Space Grotesk.
- "Change Email Address" e "Invite user" ficaram de fora (não usados no fluxo atual —
  o convite `cliente_gestao` usa o backend/Resend, não o template GoTrue). Se precisar,
  é só clonar um destes e ajustar o texto.
