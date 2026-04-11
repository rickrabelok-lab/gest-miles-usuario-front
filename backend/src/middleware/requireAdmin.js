import { getAuthToken } from "./auth.js";
import { createSupabaseWithAuth } from "../lib/supabase.js";

/**
 * Depois de `requireAuth`: garante `perfis.role === 'admin'`.
 */
export async function requireAdmin(req, res, next) {
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
    const { data: perfil, error: pErr } = await sb
      .from("perfis")
      .select("role")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (pErr) {
      return res.status(500).json({ error: pErr.message });
    }
    if (perfil?.role !== "admin") {
      return res.status(403).json({ error: "Apenas administradores." });
    }
    req.adminUser = user;
    next();
  } catch (e) {
    next(e);
  }
}
