import { Router } from "express";
import crypto from "node:crypto";
import { supabase, createSupabaseWithAuth } from "../lib/supabase.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function getPrimeiroNomeCliente(sbAdmin, userId) {
  const { data: perfil } = await sbAdmin.from("perfis").select("nome_completo").eq("usuario_id", userId).maybeSingle();
  const full = perfil?.nome_completo?.trim();
  if (full) {
    const first = full.split(/\s+/)[0];
    if (first) return escapeHtml(first);
  }
  const { data: authData } = await sbAdmin.auth.admin.getUserById(userId);
  const meta = authData?.user?.user_metadata || {};
  const raw = meta.full_name || meta.name || meta.given_name;
  if (typeof raw === "string" && raw.trim()) {
    const first = raw.trim().split(/\s+/)[0];
    if (first) return escapeHtml(first);
  }
  return null;
}

/** POST /api/auth/signup - Cadastro com email/senha */
router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email e password são obrigatórios" });
    }
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({
      user: data.user,
      session: data.session,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao cadastrar" });
  }
});

/** POST /api/auth/login - Login com email/senha */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email e password são obrigatórios" });
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return res.status(401).json({ error: error.message });
    }
    return res.json({
      user: data.user,
      session: data.session,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao fazer login" });
  }
});

/** POST /api/auth/magic-link - Envia link mágico por email */
router.post("/magic-link", async (req, res) => {
  try {
    const { email, redirectTo } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: "email é obrigatório" });
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo || undefined },
    });
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({ ok: true, message: "Link enviado por email" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao enviar link" });
  }
});

/** GET /api/auth/session - Retorna sessão atual (requer Bearer token) */
router.get("/session", requireAuth, async (req, res) => {
  try {
    const client = createSupabaseWithAuth(req.accessToken);
    const { data: { session }, error } = await client.auth.getSession();
    if (error) {
      return res.status(401).json({ error: error.message });
    }
    return res.json({ session, user: session?.user ?? null });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao obter sessão" });
  }
});

/** GET /api/auth/user - Retorna usuário atual (requer Bearer token) */
router.get("/user", requireAuth, async (req, res) => {
  try {
    const client = createSupabaseWithAuth(req.accessToken);
    const { data: { user }, error } = await client.auth.getUser();
    if (error) {
      return res.status(401).json({ error: error.message });
    }
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao obter usuário" });
  }
});

/** POST /api/auth/request-password-reset - Envia reset custom por Brevo */
router.post("/request-password-reset", async (req, res) => {
  try {
    const em = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!isValidEmail(em)) {
      return res.status(400).json({ error: "E-mail inválido." });
    }

    const brevoKey = process.env.BREVO_API_KEY;
    const sender = process.env.BREVO_SENDER_EMAIL;
    const appUrl = (process.env.PUBLIC_APP_URL || "http://localhost:3080").replace(/\/$/, "");
    if (!brevoKey || !sender) {
      return res.status(503).json({ error: "Brevo não configurado no backend." });
    }

    const sbAdmin = assertSupabaseService();
    const { data: uid, error: uidErr } = await sbAdmin.rpc("get_user_id_by_email_for_service", { p_email: em });
    if (uidErr) throw uidErr;
    if (!uid) {
      return res.json({ ok: true, message: "Se o email for cadastrado na Gest Miles, enviaremos instruções." });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { error: insErr } = await sbAdmin.from("password_reset_tokens").insert({
      user_id: uid,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (insErr) throw insErr;

    const primeiroNome = await getPrimeiroNomeCliente(sbAdmin, uid);
    const saudacao = primeiroNome
      ? `<p style="margin:0 0 14px 0;font-size:17px;">Olá, <strong>${primeiroNome}</strong>!</p>`
      : `<p style="margin:0 0 14px 0;font-size:17px;">Olá!</p>`;
    const link = `${appUrl}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;background:#F7F7F8;font-family:'DM Sans',Segoe UI,system-ui,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F7F8;padding:28px 14px;"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #e8e4ec;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px -12px rgba(106,0,163,0.18);">
<tr><td style="background:linear-gradient(135deg,#8A05BE 0%,#9E2FD4 48%,#B56CFF 100%);padding:32px 28px 28px 28px;text-align:center;">
<p style="margin:0 0 12px 0;font-family:'Space Grotesk',Segoe UI,sans-serif;font-size:24px;font-weight:700;color:#ffffff;">Gest Miles</p>
<p style="margin:0;display:inline-block;padding:10px 22px;background:rgba(15,0,28,0.22);border-radius:10px;font-size:15px;font-weight:600;color:#ffffff;">Recuperação de senha</p>
</td></tr>
<tr><td style="padding:28px 32px 8px 32px;background:#ffffff;color:#1f1f1f;font-size:16px;line-height:1.6;">
${saudacao}
<p style="margin:0 0 12px 0;">Recebemos um pedido para <strong>redefinir a senha</strong> da sua conta no <strong style="color:#8A05BE;">Gest Miles</strong>.</p>
<p style="margin:0 0 8px 0;">Clique no botão abaixo para criar uma nova senha. Por segurança, <strong>este link expira em 1 hora</strong>.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0 0 0;"><tr><td align="center">
<a href="${link}" style="display:inline-block;padding:14px 32px;border-radius:14px;text-decoration:none;font-weight:700;font-size:16px;color:#ffffff;background-color:#8A05BE;background-image:linear-gradient(135deg,#8A05BE 0%,#9E2FD4 52%,#B56CFF 100%);box-shadow:0 4px 14px -2px rgba(138,5,190,0.45);">Redefinir senha</a>
</td></tr></table>
<p style="margin:20px 0 0 0;color:#7a5a9a;font-size:14px;line-height:1.55;">Se <strong>não</strong> solicitou esta alteração, ignore este e-mail — a sua senha permanece a mesma.</p>
</td></tr>
<tr><td style="padding:22px 32px 26px 32px;background:#faf8fc;border-top:1px solid #ece8f0;">
<p style="margin:0 0 6px 0;color:#1f1f1f;font-size:14px;">Atenciosamente,</p>
<p style="margin:0 0 14px 0;font-family:'Space Grotesk',Segoe UI,sans-serif;font-size:16px;font-weight:700;"><span style="color:#6b6b6b;">Equipa </span><span style="color:#8A05BE;">Gest Miles</span></p>
<p style="margin:0;color:#8f8f8f;font-size:11px;line-height:1.45;">Este é um email automático, por favor não responda.</p>
</td></tr>
</table></td></tr></table></body></html>`;

    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": brevoKey },
      body: JSON.stringify({
        sender: { name: process.env.BREVO_SENDER_NAME || "Gest Miles", email: sender },
        to: [{ email: em }],
        subject: "Recuperação de senha — Gest Miles",
        htmlContent: html,
      }),
    });
    if (!r.ok) throw new Error(await r.text());

    return res.json({ ok: true, message: "Se o email for cadastrado na Gest Miles, enviaremos instruções." });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao enviar reset." });
  }
});

/** POST /api/auth/complete-password-reset - Consome token e altera senha */
router.post("/complete-password-reset", async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    if (!token) return res.status(400).json({ error: "Token ausente." });
    if (password.length < 6) return res.status(400).json({ error: "A senha precisa ter pelo menos 6 caracteres." });

    const tokenHash = sha256Hex(token);
    const sbAdmin = assertSupabaseService();
    const { data: row, error: qErr } = await sbAdmin
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, consumed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (qErr) throw qErr;
    if (!row) return res.status(400).json({ error: "Token inválido." });
    if (row.consumed_at) return res.status(400).json({ error: "Token já utilizado." });
    if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: "Token expirado." });

    const { error: updErr } = await sbAdmin.auth.admin.updateUserById(row.user_id, { password });
    if (updErr) throw updErr;

    const { error: markErr } = await sbAdmin
      .from("password_reset_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (markErr) throw markErr;

    return res.json({ ok: true, message: "Senha alterada com sucesso." });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao redefinir senha." });
  }
});

export default router;
