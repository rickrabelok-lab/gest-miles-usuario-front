/** Extrai o Bearer token do header Authorization */
export function getAuthToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/** Middleware: retorna 401 se não houver token */
export function requireAuth(req, res, next) {
  const token = getAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: "Não autorizado. Token ausente." });
  }
  req.accessToken = token;
  next();
}
