// Resposta de erro 500 que NÃO vaza detalhe interno: loga o erro real no servidor
// (única visibilidade até o Sentry entrar — WS3) e responde mensagem pública genérica.
// Usar em catch/guards de 500. Respostas 4xx (validação) seguem com mensagem própria.
export function serverError(res, publicMessage, err, tag = "[backend]") {
  console.error(`${tag} ${publicMessage}:`, err?.message ?? err);
  return res.status(500).json({ error: publicMessage });
}
