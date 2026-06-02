import { Router } from "express";
import crypto from "node:crypto";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function isValidEmail(email) {
  const e = String(email || "").trim();
  return e.length > 0 && e.length <= 254 && EMAIL_RE.test(e);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Primeiro nome a partir do nome completo (ou metadata), já escapado para HTML. */
function firstNameEscaped(raw) {
  const full = String(raw ?? "").trim();
  if (!full) return null;
  const first = full.split(/\s+/)[0];
  return first ? escapeHtml(first) : null;
}

/** Mascara um e-mail preservando 1ª letra do local-part, do domínio e o TLD. */
function maskEmail(email) {
  const raw = String(email || "").trim();
  const at = raw.indexOf("@");
  if (at <= 0) return "****@****";
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const maskPart = (s) => (s ? `${s[0]}***` : "****");
  const dot = domain.lastIndexOf(".");
  if (dot > 0) {
    return `${maskPart(local)}@${maskPart(domain.slice(0, dot))}${domain.slice(dot)}`;
  }
  return `${maskPart(local)}@${maskPart(domain)}`;
}

const brevoConfigured = () =>
  Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);

/** Envia e-mail via Brevo. Retorna {ok} — nunca lança (best-effort). */
async function sendBrevoEmail({ to, subject, html }) {
  if (!brevoConfigured()) return { ok: false, reason: "not-configured" };
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME || "Gest Miles",
          email: process.env.BREVO_SENDER_EMAIL,
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });
    if (!r.ok) return { ok: false, reason: (await r.text().catch(() => "")) || "brevo-error" };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "brevo-exception" };
  }
}

function buildInviteEmailHtml({ link, deNome }) {
  const convidante = firstNameEscaped(deNome);
  const intro = convidante
    ? `<strong>${convidante}</strong> convidou você para a gestão de milhas da <strong style="color:#8A05BE;">Gest Miles</strong>.`
    : `Você foi convidado para a gestão de milhas da <strong style="color:#8A05BE;">Gest Miles</strong>.`;
  const safeLink = escapeHtml(link);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;background:#F7F7F8;font-family:'DM Sans',Segoe UI,system-ui,sans-serif;color:#1f1f1f;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F7F8;padding:28px 14px;"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #e8e4ec;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px -12px rgba(106,0,163,0.18);">
<tr><td style="background:linear-gradient(135deg,#8A05BE 0%,#9E2FD4 48%,#B56CFF 100%);padding:32px 28px 28px 28px;text-align:center;">
<p style="margin:0 0 12px 0;font-family:'Space Grotesk',Segoe UI,sans-serif;font-size:24px;font-weight:700;color:#ffffff;">Gest Miles</p>
<p style="margin:0;display:inline-block;padding:10px 22px;background:rgba(15,0,28,0.22);border-radius:10px;font-size:15px;font-weight:600;color:#ffffff;">Você foi convidado</p>
</td></tr>
<tr><td style="padding:28px 32px 8px 32px;background:#ffffff;color:#1f1f1f;font-size:16px;line-height:1.6;">
<p style="margin:0 0 12px 0;">${intro}</p>
<p style="margin:0 0 8px 0;">Crie sua conta com <strong>este mesmo e-mail</strong> pelo botão abaixo. Por segurança, <strong>o convite expira em 7 dias</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0 0 0;"><tr><td align="center">
<a href="${safeLink}" style="display:inline-block;padding:14px 32px;border-radius:14px;text-decoration:none;font-weight:700;font-size:16px;color:#ffffff;background-color:#8A05BE;background-image:linear-gradient(135deg,#8A05BE 0%,#9E2FD4 52%,#B56CFF 100%);box-shadow:0 4px 14px -2px rgba(138,5,190,0.45);">Aceitar convite</a>
</td></tr></table>
<p style="margin:18px 0 0 0;font-size:12px;color:#8f8f8f;">Ou copie e cole este link no navegador:<br/>${safeLink}</p>
<p style="margin:16px 0 0 0;color:#7a5a9a;font-size:14px;line-height:1.55;">Se você <strong>não</strong> esperava este convite, pode ignorar este e-mail.</p>
</td></tr>
<tr><td style="padding:22px 32px 26px 32px;background:#faf8fc;border-top:1px solid #ece8f0;">
<p style="margin:0 0 6px 0;color:#1f1f1f;font-size:14px;">Atenciosamente,</p>
<p style="margin:0;font-family:'Space Grotesk',Segoe UI,sans-serif;font-size:16px;font-weight:700;"><span style="color:#6b6b6b;">Equipe </span><span style="color:#8A05BE;">Gest Miles</span></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function buildWelcomeEmailHtml({ primeiroNome }) {
  const saudacao = primeiroNome
    ? `<p style="margin:0 0 14px 0;font-size:17px;">Olá, <strong>${primeiroNome}</strong>!</p>`
    : `<p style="margin:0 0 14px 0;font-size:17px;">Olá!</p>`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;background:#F7F7F8;font-family:'DM Sans',Segoe UI,system-ui,sans-serif;color:#1f1f1f;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F7F8;padding:28px 14px;"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #e8e4ec;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px -12px rgba(106,0,163,0.18);">
<tr><td style="background:linear-gradient(135deg,#8A05BE 0%,#9E2FD4 48%,#B56CFF 100%);padding:32px 28px 28px 28px;text-align:center;">
<p style="margin:0 0 12px 0;font-family:'Space Grotesk',Segoe UI,sans-serif;font-size:24px;font-weight:700;color:#ffffff;">Gest Miles</p>
<p style="margin:0;display:inline-block;padding:10px 22px;background:rgba(15,0,28,0.22);border-radius:10px;font-size:15px;font-weight:600;color:#ffffff;">Bem-vindo</p>
</td></tr>
<tr><td style="padding:28px 32px 8px 32px;background:#ffffff;color:#1f1f1f;font-size:16px;line-height:1.6;">
${saudacao}
<p style="margin:0 0 12px 0;">Sua conta na <strong style="color:#8A05BE;">Gest Miles</strong> está pronta. A partir de agora você acompanha seus programas, saldos, vencimentos e oportunidades em um só lugar.</p>
<p style="margin:0;">Bons voos! ✈️</p>
</td></tr>
<tr><td style="padding:22px 32px 26px 32px;background:#faf8fc;border-top:1px solid #ece8f0;">
<p style="margin:0 0 6px 0;color:#1f1f1f;font-size:14px;">Atenciosamente,</p>
<p style="margin:0;font-family:'Space Grotesk',Segoe UI,sans-serif;font-size:16px;font-weight:700;"><span style="color:#6b6b6b;">Equipe </span><span style="color:#8A05BE;">Gest Miles</span></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * POST /api/invites — cria um convite (autor precisa ser admin_equipe com equipe).
 * Gera token (só hash no banco), supersede convites antigos do mesmo e-mail e envia
 * o link por e-mail (Brevo). Em dev (sem VERCEL) retorna o devToken para testes.
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Informe um e-mail válido." });
    }

    // Zero Trust: revalida o token no servidor e exige role admin_equipe + equipe.
    const sbUser = createSupabaseWithAuth(req.accessToken);
    const { data: { user } = {}, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    const sbAdmin = assertSupabaseService();
    const { data: autor, error: autorErr } = await sbAdmin
      .from("perfis")
      .select("role, equipe_id, nome_completo")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (autorErr) throw autorErr;
    if (!autor || autor.role !== "admin_equipe" || !autor.equipe_id) {
      return res.status(403).json({ error: "Apenas um administrador de equipe pode convidar." });
    }

    // Em produção, sem Brevo não há como entregar o convite.
    if (!brevoConfigured() && process.env.VERCEL) {
      return res.status(503).json({ error: "E-mail (Brevo) não configurado no backend." });
    }

    // Supersede: invalida convites anteriores ainda válidos do mesmo e-mail.
    const nowIso = new Date().toISOString();
    const { error: supErr } = await sbAdmin
      .from("convites_cliente_gestao")
      .update({ expires_at: nowIso })
      .eq("email", email)
      .is("consumed_at", null)
      .gt("expires_at", nowIso);
    if (supErr) throw supErr;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    const { error: insErr } = await sbAdmin.from("convites_cliente_gestao").insert({
      token_hash: tokenHash,
      email,
      equipe_id: autor.equipe_id,
      invited_by: user.id,
      expires_at: expiresAt,
    });
    if (insErr) throw insErr;

    const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:3080").replace(/\/$/, "");
    const link = `${appUrl}/auth/accept-invite?token=${encodeURIComponent(rawToken)}`;
    const mail = await sendBrevoEmail({
      to: email,
      subject: "Convite — Gest Miles",
      html: buildInviteEmailHtml({ link, deNome: autor.nome_completo }),
    });
    if (!mail.ok && mail.reason !== "not-configured") {
      console.warn("[invites] Brevo falhou ao enviar convite:", mail.reason);
    }

    const body = { ok: true };
    // Conveniência de teste só em dev: nunca expor o token em produção.
    if (!process.env.VERCEL) body.devToken = rawToken;
    return res.json(body);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao criar convite." });
  }
});

/**
 * GET /api/invites/preview?token= — valida o convite (pré-cadastro, sem auth) e
 * devolve o e-mail mascarado para a tela de aceite.
 */
router.get("/preview", async (req, res) => {
  try {
    const token = String(req.query?.token ?? "").trim();
    if (!token) return res.status(400).json({ error: "Token ausente." });

    const sbAdmin = assertSupabaseService();
    const { data: row, error } = await sbAdmin
      .from("convites_cliente_gestao")
      .select("email, expires_at, consumed_at")
      .eq("token_hash", sha256Hex(token))
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(400).json({ error: "Convite inválido." });
    if (row.consumed_at) return res.status(400).json({ error: "Convite já utilizado." });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: "Convite expirado." });
    }

    return res.json({ emailMasked: maskEmail(row.email) });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao validar convite." });
  }
});

/**
 * POST /api/invites/accept — consome o convite após login. Confere o e-mail do
 * usuário contra o do convite, concede role=cliente_gestao + equipe e marca o
 * convite como consumido. Concede ANTES de marcar (falha benigna: grant idempotente).
 */
router.post("/accept", requireAuth, async (req, res) => {
  try {
    const token = String(req.body?.token ?? "").trim();
    if (!token) return res.status(400).json({ error: "Token ausente." });

    const sbUser = createSupabaseWithAuth(req.accessToken);
    const { data: { user } = {}, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    const sbAdmin = assertSupabaseService();
    const { data: invite, error: qErr } = await sbAdmin
      .from("convites_cliente_gestao")
      .select("id, email, equipe_id, expires_at, consumed_at")
      .eq("token_hash", sha256Hex(token))
      .maybeSingle();
    if (qErr) throw qErr;
    if (!invite) return res.status(400).json({ error: "Convite inválido." });
    if (invite.consumed_at) return res.status(409).json({ error: "Convite já utilizado." });
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: "Convite expirado." });
    }

    const userEmail = String(user.email ?? "").trim().toLowerCase();
    if (!userEmail || userEmail !== String(invite.email).trim().toLowerCase()) {
      return res.status(403).json({ error: "Este convite é para outro e-mail." });
    }

    // Concede primeiro (idempotente: mesmos valores fixos).
    const { error: grantErr } = await sbAdmin
      .from("perfis")
      .update({ role: "cliente_gestao", equipe_id: invite.equipe_id })
      .eq("usuario_id", user.id);
    if (grantErr) throw grantErr;

    // Marca consumido (anti-replay). Guard consumed_at IS NULL evita corrida.
    const { error: consumeErr } = await sbAdmin
      .from("convites_cliente_gestao")
      .update({ consumed_at: new Date().toISOString(), consumed_by: user.id })
      .eq("id", invite.id)
      .is("consumed_at", null);
    if (consumeErr) {
      console.warn("[invites] falha ao marcar convite consumido:", consumeErr.message);
    }

    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao aceitar convite." });
  }
});

/**
 * POST /api/invites/welcome — e-mail de boas-vindas (best-effort) para todo novo
 * usuário. Idempotente via perfis.email_boas_vindas_enviado_at.
 */
router.post("/welcome", requireAuth, async (req, res) => {
  try {
    const sbUser = createSupabaseWithAuth(req.accessToken);
    const { data: { user } = {}, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado." });
    }

    const sbAdmin = assertSupabaseService();
    const { data: perfil, error: pErr } = await sbAdmin
      .from("perfis")
      .select("nome_completo, email, email_boas_vindas_enviado_at")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (perfil?.email_boas_vindas_enviado_at) {
      return res.json({ ok: true, skipped: true });
    }

    const to = String(perfil?.email || user.email || "").trim().toLowerCase();
    let sentOk = false;
    if (isValidEmail(to)) {
      const primeiroNome = firstNameEscaped(perfil?.nome_completo || user.user_metadata?.full_name);
      const mail = await sendBrevoEmail({
        to,
        subject: "Bem-vindo à Gest Miles",
        html: buildWelcomeEmailHtml({ primeiroNome }),
      });
      if (!mail.ok && mail.reason !== "not-configured") {
        console.warn("[invites] welcome Brevo falhou:", mail.reason);
      }
      sentOk = mail.ok;
    }

    // Só marca como enviado se de fato enviou (coluna = "enviado_at").
    if (sentOk) {
      await sbAdmin
        .from("perfis")
        .update({ email_boas_vindas_enviado_at: new Date().toISOString() })
        .eq("usuario_id", user.id);
    }

    return res.json({ ok: true, sent: sentOk });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao enviar boas-vindas." });
  }
});

export default router;
