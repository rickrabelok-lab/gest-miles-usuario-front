import { apiFetch } from "@/services/api";

export type ContatoInput = {
  assunto: string;
  mensagem: string;
  token: string;
};

export type ContatoResult = {
  ok: boolean;
  id?: string;
};

/**
 * Envia a mensagem do "Fale Conosco" para o backend (POST /api/contact).
 * Validação de presença aqui é só UX — o backend revalida e é a autoridade.
 */
export async function submitContato(input: ContatoInput): Promise<ContatoResult> {
  const assunto = (input.assunto ?? "").trim();
  const mensagem = (input.mensagem ?? "").trim();
  if (!assunto || !mensagem) {
    throw new Error("Preencha o assunto e a mensagem.");
  }
  return apiFetch<ContatoResult>("/api/contact", {
    method: "POST",
    body: JSON.stringify({ assunto, mensagem }),
    token: input.token,
  });
}
