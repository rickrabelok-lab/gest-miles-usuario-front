import { Router } from "express";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireAuth } from "../middleware/auth.js";
import { sendEmail, mailerConfigured } from "../lib/mailer.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate-limit por usuário (anti relay de spam — envia e-mail a destinatário arbitrário).
const REFERRAL_MAX_PER_HOUR = 10;
const REFERRAL_MAX_PER_DAY = 30;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/** POST /api/referrals/invite — registra o convite e envia o link de indicação por e-mail. */
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

    // Rate-limit (contagem no DB; serverless-safe — in-memory não persiste na Vercel).
    const nowMs = Date.now();
    const umaHoraMs = nowMs - 60 * 60 * 1000;
    const since24h = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentes } = await sbAdmin
      .from("indicacoes")
      .select("created_at, indicado_email")
      .eq("indicador_usuario_id", user.id)
      .eq("origem", "email") // só convites por e-mail (não atribuições orgânicas via ?ref=)
      .gte("created_at", since24h);
    const lista = recentes ?? [];
    if (lista.filter((r) => new Date(r.created_at).getTime() >= umaHoraMs).length >= REFERRAL_MAX_PER_HOUR) {
      return res.status(429).json({ error: "Muitos convites em pouco tempo. Tente novamente mais tarde." });
    }
    if (lista.length >= REFERRAL_MAX_PER_DAY) {
      return res.status(429).json({ error: "Limite diário de convites atingido. Tente novamente amanhã." });
    }
    if (lista.some((r) => String(r.indicado_email ?? "").toLowerCase() === email)) {
      return res.status(429).json({ error: "Você já convidou este e-mail recentemente." });
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
      const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:3080").replace(/\/$/, "");
      if (mailerConfigured()) {
        const link = `${appUrl}/auth/sign-up?ref=${encodeURIComponent(codigo)}`;
        const html = buildConviteEmailHtml({ nome, link });
        const mail = await sendEmail({
          to: email,
          subject: `${nome || "Um amigo"} te convidou para a Gest Miles`,
          html,
          ...(remetenteEmail ? { replyTo: remetenteEmail } : {}),
        });
        if (!mail.ok) console.warn("[referrals] e-mail falhou:", mail.reason);
      } else {
        console.warn("[referrals] e-mail não configurado; convite registrado sem envio.");
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
