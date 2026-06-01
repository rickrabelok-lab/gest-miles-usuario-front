import { apiFetch } from "@/services/api";

export type ConviteIndicacaoInput = {
  email: string;
  token: string;
};

export type ConviteIndicacaoResult = {
  ok: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Dispara o convite de indicação ("Convide Amigos") para o backend
 * (POST /api/referrals/invite). A validação aqui é só UX — o backend
 * revalida o e-mail e o token e é a autoridade.
 */
export async function enviarConviteIndicacao(
  input: ConviteIndicacaoInput,
): Promise<ConviteIndicacaoResult> {
  const email = (input.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    throw new Error("Informe um e-mail válido.");
  }
  return apiFetch<ConviteIndicacaoResult>("/api/referrals/invite", {
    method: "POST",
    body: JSON.stringify({ email }),
    token: input.token,
  });
}
