import { getAuthToken } from "./auth.js";
import { createSupabaseWithAuth } from "../lib/supabase.js";

function isAllowedAdminRole(role, equipeId) {
  if (role === "admin_master") return true;
  if (role === "admin") {
    return equipeId == null || String(equipeId).trim() === "";
  }
  return false;
}

/**
 * Depois de `requireAuth`: garante administração global no painel.
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
      .select("role, equipe_id")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (pErr) {
      return res.status(500).json({ error: pErr.message });
    }
    if (!isAllowedAdminRole(perfil?.role, perfil?.equipe_id)) {
      return res.status(403).json({ error: "Apenas administradores globais." });
    }
    req.adminUser = user;
    next();
  } catch (e) {
    next(e);
  }
}
