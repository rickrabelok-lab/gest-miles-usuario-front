/**
 * Edge Function: pedido de reset de senha (Brevo + password_reset_tokens).
 * Segredos: SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY, BREVO_SENDER_EMAIL, PUBLIC_APP_URL
 * Deploy: supabase functions deploy request-password-reset --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getPrimeiroNomeCliente(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data: perfil } = await admin.from("perfis").select("nome_completo").eq("usuario_id", userId).maybeSingle();
  const full = perfil?.nome_completo?.trim();
  if (full) {
    const first = full.split(/\s+/)[0];
    if (first) return escapeHtml(first);
  }
  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const meta = authData?.user?.user_metadata as Record<string, unknown> | undefined;
  const raw = meta?.full_name ?? meta?.name ?? meta?.given_name;
  if (typeof raw === "string" && raw.trim()) {
    const first = raw.trim().split(/\s+/)[0];
    if (first) return escapeHtml(first);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const { email } = await req.json();
    const em = String(email || "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      return new Response(JSON.stringify({ error: "E-mail inválido" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const brevoKey = Deno.env.get("BREVO_API_KEY");
    const sender = Deno.env.get("BREVO_SENDER_EMAIL");
    const appUrl = (Deno.env.get("PUBLIC_APP_URL") || "http://localhost:3080").replace(/\/$/, "");

    if (!brevoKey || !sender) {
      return new Response(JSON.stringify({ error: "Brevo não configurado na função" }), {
        status: 503,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: uid, error: uidErr } = await admin.rpc("get_user_id_by_email_for_service", { p_email: em });
    if (uidErr) throw uidErr;
    if (!uid) {
      return new Response(JSON.stringify({ ok: true, message: "Se o email for cadastrado na Gest Miles, enviaremos instruções." }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const rawToken = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: insErr } = await admin.from("password_reset_tokens").insert({
      user_id: uid as string,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (insErr) throw insErr;

    const primeiroNome = await getPrimeiroNomeCliente(admin, uid as string);
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
        sender: { name: Deno.env.get("BREVO_SENDER_NAME") || "Gest Miles", email: sender },
        to: [{ email: em }],
        subject: "Recuperação de senha — Gest Miles",
        htmlContent: html,
      }),
    });
    if (!r.ok) throw new Error(await r.text());

    return new Response(JSON.stringify({ ok: true, message: "Se o email for cadastrado na Gest Miles, enviaremos instruções." }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
