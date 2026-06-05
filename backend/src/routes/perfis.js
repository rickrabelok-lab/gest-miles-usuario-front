import { Router } from "express";
import { buildSelfPerfilPayload } from "../lib/perfisPayload.js";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { serverError } from "../lib/httpError.js";

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
    return serverError(res, "Erro ao obter perfil", err, "[perfis]");
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
    return serverError(res, "Erro ao obter role", err, "[perfis]");
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
    return serverError(res, "Erro ao obter perfil", err, "[perfis]");
  }
});

/** PUT /api/perfis - Upsert seguro do perfil próprio */
router.put("/", requireAuth, async (req, res) => {
  try {
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    const payload = buildSelfPerfilPayload(req.body, user);
    const { error } = await supabase
      .from("perfis")
      .upsert(payload, { onConflict: "usuario_id" });

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({ ok: true });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    }
    return serverError(res, "Erro ao salvar perfil", err, "[perfis]");
  }
});

export default router;
