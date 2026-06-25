// Helpers para classificar erros de autenticação do Supabase/GoTrue de forma testável.

/**
 * True quando o login falhou porque o e-mail ainda não foi confirmado
 * (relevante quando o "Confirm email" do GoTrue está ligado). Usado para mostrar
 * uma mensagem acionável + a opção de reenviar a confirmação, em vez do erro genérico.
 */
export function isEmailNotConfirmedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code = (error as { code?: string } | null)?.code ?? "";
  return /email[\s_-]*not[\s_-]*confirmed/i.test(`${message} ${code}`);
}
