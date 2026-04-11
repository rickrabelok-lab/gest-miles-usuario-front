import { Router } from "express";
import { createSupabaseAdmin } from "../lib/supabaseAdmin.js";
import { getUserIdByEmail } from "../lib/authUserLookup.js";
import { sendTransactionalEmail } from "../lib/brevo.js";
import { templateRecuperacaoSenha, templateSenhaAlterada } from "../lib/emailTemplates.js";
import { generateUrlToken, hashToken } from "../lib/tokens.js";
import { getPrimeiroNomeCliente } from "../lib/userDisplayName.js";

const router = Router();

const appUrl = () => (process.env.PUBLIC_APP_URL || "http://localhost:3080").replace(/\/$/, "");

router.post("/request-password-reset", async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "E-mail inválido" });
    }

    const admin = createSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY" });
    }

    const { userId: uid, error: uidErr } = await getUserIdByEmail(admin, email);
    if (uidErr) {
      console.error(uidErr);
      return res.status(500).json({ error: "Erro ao verificar utilizador" });
    }
    if (!uid) {
      // Não revelar se o e-mail existe
      return res.json({ ok: true, message: "Se o email for cadastrado na Gest Miles, enviaremos instruções." });
    }

    const rawToken = generateUrlToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 h

    const { error: insErr } = await admin.from("password_reset_tokens").insert({
      user_id: uid,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    });
    if (insErr) {
      console.error(insErr);
      return res.status(500).json({ error: "Erro ao registar pedido" });
    }

    const link = `${appUrl()}/auth/reset-password?token=${encodeURIComponent(rawToken)}`;
    const primeiroNome = await getPrimeiroNomeCliente(admin, uid);
    const html = templateRecuperacaoSenha({ linkReset: link, primeiroNome });

    await sendTransactionalEmail({
      toEmail: email,
      subject: "Recuperação de senha — Gest Miles",
      htmlContent: html,
    });

    return res.json({ ok: true, message: "Se o email for cadastrado na Gest Miles, enviaremos instruções." });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Erro ao enviar e-mail" });
  }
});

router.post("/complete-password-reset", async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    if (!token || password.length < 6) {
      return res.status(400).json({ error: "Token e senha (mín. 6 caracteres) são obrigatórios" });
    }

    const admin = createSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: "Servidor sem SUPABASE_SERVICE_ROLE_KEY" });
    }

    const tokenHash = hashToken(token);
    const { data: row, error: findErr } = await admin
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, consumed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (findErr || !row || row.consumed_at) {
      return res.status(400).json({ error: "Token inválido ou já utilizado" });
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: "Token expirado" });
    }

    const { error: updAuth } = await admin.auth.admin.updateUserById(row.user_id, { password });
    if (updAuth) {
      console.error(updAuth);
      return res.status(500).json({ error: "Erro ao atualizar senha" });
    }

    await admin
      .from("password_reset_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);

    const { data: u } = await admin.auth.admin.getUserById(row.user_id);
    const email = u?.user?.email;
    if (email) {
      const primeiroNome = await getPrimeiroNomeCliente(admin, row.user_id);
      const html = templateSenhaAlterada({
        primeiroNome,
        loginUrl: `${appUrl()}/auth`,
        alteradoEm: new Date(),
      });
      await sendTransactionalEmail({
        toEmail: email,
        subject: "Senha alterada — Gest Miles",
        htmlContent: html,
      });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Erro ao redefinir senha" });
  }
});

export default router;
