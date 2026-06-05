import { Router } from "express";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireAuth } from "../middleware/auth.js";
import { sendEmail, mailerConfigured } from "../lib/mailer.js";

const router = Router();

const ASSUNTO_MIN = 3;
const ASSUNTO_MAX = 120;
const MSG_MIN = 5;
const MSG_MAX = 2000;

// Rate-limit por usuário (evita flood do inbox de suporte + linhas no DB).
const CONTACT_MAX_PER_HOUR = 5;
const CONTACT_MAX_PER_DAY = 20;

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

    // Rate-limit (contagem no DB; serverless-safe — in-memory não persiste na Vercel).
    const nowMs = Date.now();
    const umaHoraMs = nowMs - 60 * 60 * 1000;
    const since24h = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentes } = await sbAdmin
      .from("mensagens_contato")
      .select("created_at")
      .eq("cliente_usuario_id", user.id)
      .gte("created_at", since24h);
    const lista = recentes ?? [];
    if (lista.filter((r) => new Date(r.created_at).getTime() >= umaHoraMs).length >= CONTACT_MAX_PER_HOUR) {
      return res.status(429).json({ error: "Muitas mensagens em pouco tempo. Tente novamente mais tarde." });
    }
    if (lista.length >= CONTACT_MAX_PER_DAY) {
      return res.status(429).json({ error: "Limite diário de mensagens atingido. Tente novamente amanhã." });
    }

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
      const inbox = process.env.CONTACT_INBOX_EMAIL || "gestmilesapp@gmail.com";
      if (mailerConfigured()) {
        const html = buildContatoEmailHtml({ nome, email: emailContato, assunto, mensagem, when: new Date() });
        const mail = await sendEmail({
          to: inbox,
          subject: `Novo contato (Fale Conosco) — ${assunto}`,
          html,
          ...(emailContato ? { replyTo: emailContato } : {}),
        });
        if (!mail.ok) console.warn("[contact] e-mail falhou:", mail.reason);
      } else {
        console.warn("[contact] e-mail não configurado; mensagem registrada sem envio.");
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
