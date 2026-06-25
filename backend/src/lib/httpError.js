// Resposta de erro 500 que NÃO vaza detalhe interno: loga o erro real no servidor
// (única visibilidade até o Sentry entrar — WS3) e responde mensagem pública genérica.
// Usar em catch/guards de 500. Respostas 4xx (validação) seguem com mensagem própria.
export function serverError(res, publicMessage, err, tag = "[backend]") {
  console.error(`${tag} ${publicMessage}:`, err?.message ?? err);
  return res.status(500).json({ error: publicMessage });
}

// Resposta de erro com status explícito (tipicamente 4xx) que NÃO vaza detalhe
// interno: loga o erro real no servidor e responde só uma mensagem pública genérica.
// Use no lugar de devolver `error.message` cru de uma query Supabase/DB (detalhe de
// constraint/RLS/coluna vaza schema). Mensagens de validação próprias seguem inline.
export function publicError(res, status, publicMessage, err, tag = "[backend]") {
  console.error(`${tag} ${publicMessage}:`, err?.message ?? err);
  return res.status(status).json({ error: publicMessage });
}
