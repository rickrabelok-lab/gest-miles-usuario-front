import { getAuthToken } from "./auth.js";
import { createSupabaseWithAuth } from "../lib/supabase.js";

/**
 * Como `requireAuth`, mas VALIDA o token no servidor (getUser) e expõe req.user.
 * Caminho seguro para rotas que agem com service role: o id vem de req.user.id
 * (validado pelo servidor), nunca do corpo/params.
 */
export async function requireUser(req, res, next) {
  try {
    const token = getAuthToken(req);
    if (!token) {
      return res.status(401).json({ error: "Não autorizado. Token ausente." });
    }
    const sb = createSupabaseWithAuth(token);
    const {
      data: { user },
      error: userErr,
    } = await sb.auth.getUser();
    if (userErr || !user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }
    req.accessToken = token;
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}
