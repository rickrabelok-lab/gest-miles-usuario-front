// Transporte de e-mail transacional via Resend (https://resend.com).
// Substitui o envio direto por Brevo. Lê env em tempo de chamada (não no import),
// então o backend e os testes definem as variáveis antes de enviar.
//
// Env (só backend — nunca em VITE_*):
//   RESEND_API_KEY   chave da API Resend.
//   RESEND_FROM      remetente verificado. Aceita "Nome <email@dominio>" OU só "email@dominio".
//   RESEND_FROM_NAME (opcional) nome usado quando RESEND_FROM é só o e-mail. Default "Gest Miles".

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** true quando há chave + remetente configurados. */
export function mailerConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

/** Monta o campo `from` no formato que o Resend espera. */
export function resendFrom() {
  const from = String(process.env.RESEND_FROM || "").trim();
  if (!from) return "";
  if (from.includes("<")) return from;
  const name = (process.env.RESEND_FROM_NAME || "Gest Miles").trim();
  return `${name} <${from}>`;
}

/**
 * Envia um e-mail via Resend. Best-effort: NUNCA lança.
 * @param {{ to: string|string[], subject: string, html: string, replyTo?: string }} params
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function sendEmail({ to, subject, html, replyTo } = {}) {
  if (!mailerConfigured()) return { ok: false, reason: "not-configured" };
  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom(),
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!r.ok) {
      return { ok: false, reason: (await r.text().catch(() => "")) || "resend-error" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "resend-exception" };
  }
}
