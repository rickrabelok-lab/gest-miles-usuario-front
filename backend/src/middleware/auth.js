/** Extrai o Bearer token do header Authorization */
export function getAuthToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/**
 * Middleware: 401 se NÃO houver token. ATENÇÃO: só checa PRESENÇA do token —
 * NÃO valida assinatura/expiração. Toda rota atrás de `requireAuth` PRECISA, por
 * conta própria, ou (a) chamar `sb.auth.getUser()`, ou (b) usar um client
 * token-scoped (`createSupabaseWithAuth`) e deixar a RLS barrar.
 * Se a rota for agir com SERVICE ROLE confiando num id, use `requireUser`
 * (valida no servidor e expõe req.user) em vez deste — nunca confie em id do corpo.
 */
export function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: "Não autorizado. Token ausente." });
  }
  req.accessToken = token;
  next();
}
