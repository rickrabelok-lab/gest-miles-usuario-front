/**
 * Envio transacional via Brevo API v3 (SMTP).
 * @see https://developers.brevo.com/reference/sendtransacemail
 */

const BREVO_API = "https://api.brevo.com/v3/smtp/email";

export async function sendTransactionalEmail({ toEmail, toName, subject, htmlContent, textContent }) {
  const key = process.env.BREVO_API_KEY?.trim();
  if (!key) {
    throw new Error("BREVO_API_KEY não configurada no backend");
  }
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName = (process.env.BREVO_SENDER_NAME || "Gest Miles").trim();
  if (!senderEmail) {
    throw new Error("BREVO_SENDER_EMAIL não configurado (remetente verificado na Brevo)");
  }

  const body = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email: toEmail, name: toName || toEmail }],
    subject,
    htmlContent,
    ...(textContent ? { textContent } : {}),
  };

  const res = await fetch(BREVO_API, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Brevo]", res.status, errText);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Chave API Brevo inválida ou em falta. Crie uma chave em app.brevo.com → SMTP & API → API Keys e defina BREVO_API_KEY no backend/.env (reinicie o servidor Node).",
      );
    }
    throw new Error("Não foi possível enviar o e-mail neste momento. Tente mais tarde.");
  }

  return res.json();
}
