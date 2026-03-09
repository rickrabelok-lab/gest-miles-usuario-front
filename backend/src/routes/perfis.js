import { Router } from "express";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/** GET /api/perfis/me - Perfil do usuário atual */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    const { data, error } = await supabase
      .from("perfis")
      .select("*")
      .eq("usuario_id", user.id)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao obter perfil" });
  }
});

/** GET /api/perfis/role - Role do usuário (para AuthContext) */
router.get("/role", requireAuth, async (req, res) => {
  try {
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    const { data, error } = await supabase
      .from("perfis")
      .select("role")
      .eq("usuario_id", user.id)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({ role: data?.role ?? "user" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao obter role" });
  }
});

/** GET /api/perfis/:usuarioId - Perfil de um usuário (gestor vendo cliente) */
router.get("/:usuarioId", requireAuth, async (req, res) => {
  try {
    const usuarioId = req.params.usuarioId;
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data, error } = await supabase
      .from("perfis")
      .select("*")
      .eq("usuario_id", usuarioId)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao obter perfil" });
  }
});

/** PUT /api/perfis - Upsert perfil */
router.put("/", requireAuth, async (req, res) => {
  try {
    const payload = req.body;
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    const { error } = await supabase
      .from("perfis")
      .upsert(
        { ...payload, usuario_id: payload.usuario_id ?? user.id },
        { onConflict: "usuario_id" }
      );

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao salvar perfil" });
  }
});

export default router;
