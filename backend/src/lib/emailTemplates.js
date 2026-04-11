/**
 * HTML transacional — identidade Gest Miles:
 * cabeçalho em gradiente (#8A05BE → #9E2FD4 → #B56CFF), título em faixa, corpo branco tipográfico,
 * CTA centrado, notas em cinza / roxo suave, rodapé «Equipa Gest Miles» (alinhado às telas auth: fundo #F7F7F8, cartão claro).
 * Espelha docs/email-templates/*.html
 */

/** Data e hora em português para confirmação de alteração de senha. */
function formatarDataHoraAlteracaoSenha(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const data = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${data} às ${hora}`;
}

/** CTA centrado (tabelas ajudam em clientes de e-mail). */
const button = (href, label) => `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0 0 0;">
<tr><td align="center" style="padding:0;">
<a href="${href}" style="display:inline-block;padding:14px 32px;border-radius:14px;text-decoration:none;font-weight:700;font-size:16px;color:#ffffff;background-color:#8A05BE;background-image:linear-gradient(135deg,#8A05BE 0%,#9E2FD4 52%,#B56CFF 100%);box-shadow:0 4px 14px -2px rgba(138,5,190,0.45);">${label}</a>
</td></tr></table>`;

const defaultFooterDisclaimer =
  "E-mail automático — não responda a esta mensagem. Se não reconhece esta ação, ignore o e-mail.";

const shell = (documentTitle, headline, bodyHtml, footerDisclaimer) => `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${documentTitle}</title></head>
<body style="margin:0;background:#F7F7F8;font-family:'DM Sans',Segoe UI,system-ui,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F7F8;padding:28px 14px;">
<tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #e8e4ec;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px -12px rgba(106,0,163,0.18);">
<tr>
<td style="background:linear-gradient(135deg,#8A05BE 0%,#9E2FD4 48%,#B56CFF 100%);padding:32px 28px 28px 28px;text-align:center;">
<p style="margin:0 0 12px 0;font-family:'Space Grotesk',Segoe UI,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.03em;color:#ffffff;text-shadow:0 1px 2px rgba(0,0,0,0.12);">Gest Miles</p>
<p style="margin:0;display:inline-block;padding:10px 22px;background:rgba(15,0,28,0.22);border-radius:10px;font-size:15px;font-weight:600;color:#ffffff;line-height:1.3;">${headline}</p>
</td>
</tr>
<tr>
<td style="padding:28px 32px 8px 32px;background:#ffffff;color:#1f1f1f;font-size:16px;line-height:1.6;">
${bodyHtml}
</td>
</tr>
<tr>
<td style="padding:22px 32px 26px 32px;background:#faf8fc;border-top:1px solid #ece8f0;">
<p style="margin:0 0 6px 0;color:#1f1f1f;font-size:14px;line-height:1.5;">Atenciosamente,</p>
<p style="margin:0 0 14px 0;font-family:'Space Grotesk',Segoe UI,sans-serif;font-size:16px;font-weight:700;line-height:1.4;">
<span style="color:#6b6b6b;">Equipa </span><span style="color:#8A05BE;">Gest Miles</span>
</p>
<p style="margin:0;color:#8f8f8f;font-size:11px;line-height:1.45;">${footerDisclaimer ?? defaultFooterDisclaimer}</p>
</td>
</tr>
</table>
</td></tr></table>
</body></html>`;

export function templateBoasVindas({ nome, appUrl }) {
  const inner = `
<p style="margin:0 0 14px 0;font-size:17px;">Olá${nome ? `, <strong>${nome}</strong>` : ""}!</p>
<p style="margin:0 0 8px 0;">A sua conta no <strong style="color:#8A05BE;">Gest Miles</strong> está pronta. Explore milhas, alertas e a gestão da sua carteira num só lugar.</p>
${button(appUrl || "#", "Abrir o Gest Miles")}
<p style="margin:20px 0 0 0;color:#6b6b6b;font-size:13px;line-height:1.5;">Qualquer dúvida, use o apoio dentro da aplicação.</p>
`;
  return shell("Bem-vindo ao Gest Miles", "Bem-vindo", inner);
}

export function templateConviteClienteGestao({ nomeConvidado, nomeGestor, linkAceitar }) {
  const inner = `
<p style="margin:0 0 14px 0;font-size:17px;">Olá${nomeConvidado ? `, <strong>${nomeConvidado}</strong>` : ""}!</p>
<p style="margin:0 0 12px 0;"><strong>${nomeGestor || "O seu gestor"}</strong> convidou-o a aceder à carteira como <strong>cliente gestão</strong> na plataforma <strong style="color:#8A05BE;">Gest Miles</strong>.</p>
<p style="margin:0 0 8px 0;">Utilize o botão abaixo para criar a sua conta ou concluir o acesso. O convite expira em alguns dias.</p>
${button(linkAceitar, "Aceitar convite")}
<p style="margin:18px 0 0 0;color:#7a5a9a;font-size:13px;line-height:1.5;">Se não esperava este convite, pode ignorar este e-mail.</p>
`;
  return shell("Convite — Gest Miles", "Convite", inner);
}

export function templateConviteAceito({ nomeGestor, emailNovoUsuario }) {
  const inner = `
<p style="margin:0 0 14px 0;font-size:17px;">Olá${nomeGestor ? `, <strong>${nomeGestor}</strong>` : ""}!</p>
<p style="margin:0;">O convite enviado para <strong>${emailNovoUsuario}</strong> foi <strong>aceite</strong>. O utilizador já pode aceder como <strong>cliente gestão</strong>.</p>
`;
  return shell("Convite aceite — Gest Miles", "Convite aceite", inner);
}

export function templateRecuperacaoSenha({ linkReset, primeiroNome }) {
  const inner = `
<p style="margin:0 0 14px 0;font-size:17px;">Olá${primeiroNome ? `, <strong>${primeiroNome}</strong>` : ""}!</p>
<p style="margin:0 0 12px 0;">Recebemos um pedido para <strong>redefinir a senha</strong> da sua conta no <strong style="color:#8A05BE;">Gest Miles</strong>.</p>
<p style="margin:0 0 8px 0;">Clique no botão abaixo para criar uma nova senha. Por segurança, <strong>este link expira em 1 hora</strong>.</p>
${button(linkReset, "Redefinir senha")}
<p style="margin:20px 0 0 0;color:#7a5a9a;font-size:14px;line-height:1.55;">Se <strong>não</strong> solicitou esta alteração, ignore este e-mail — a sua senha permanece a mesma.</p>
`;
  return shell(
    "Recuperação de senha — Gest Miles",
    "Recuperação de senha",
    inner,
    "Este é um email automático, por favor não responda.",
  );
}

export function templateSenhaAlterada({ primeiroNome, loginUrl, alteradoEm }) {
  const quando = formatarDataHoraAlteracaoSenha(alteradoEm ?? new Date());
  const inner = `
<p style="margin:0 0 14px 0;font-size:17px;">Olá${primeiroNome ? `, <strong>${primeiroNome}</strong>` : ""},</p>
<p style="margin:0 0 12px 0;">A sua <strong>senha</strong> foi alterada com sucesso em <strong>${quando}</strong>.</p>
${button(loginUrl || "#", "Fazer login")}
<p style="margin:20px 0 0 0;color:#7a5a9a;font-size:14px;line-height:1.55;">Se <strong>não</strong> foi você, contacte o suporte de imediato.</p>
`;
  return shell(
    "Senha alterada — Gest Miles",
    "Senha alterada com sucesso",
    inner,
    "Este é um email automático, por favor não responda.",
  );
}
