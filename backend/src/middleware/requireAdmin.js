import { createSupabaseWithAuth } from "../lib/supabase.js";

/** Apenas utilizadores com perfis.role = admin. Usar depois de `requireAuth`. */
export async function requireAdmin(req, res, next) {
  const token = req.accessToken;
  if (!token) {
    return res.status(401).json({ error: "Não autorizado. Token ausente." });
  }
  const supabase = createSupabaseWithAuth(token);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  const { data: perfil, error } = await supabase.from("perfis").select("role").eq("usuario_id", user.id).maybeSingle();
  if (error || perfil?.role !== "admin") {
    return res.status(403).json({ error: "Apenas administradores podem usar este recurso." });
  }
  req.adminUserId = user.id;
  next();
}
