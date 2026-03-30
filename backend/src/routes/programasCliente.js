import { Router } from "express";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/** GET /api/programas-cliente?clientId=xxx - Lista programas do cliente */
router.get("/", requireAuth, async (req, res) => {
  try {
    const clientId = req.query.clientId;
    if (!clientId) {
      return res.status(400).json({ error: "clientId é obrigatório" });
    }
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data, error } = await supabase
      .from("programas_cliente")
      .select("*")
      .eq("cliente_id", clientId)
      .order("updated_at", { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    const rows = (data ?? []).filter((row) => row.cliente_id === clientId);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao listar programas" });
  }
});

/** POST /api/programas-cliente - Upsert programa do cliente */
router.post("/", requireAuth, async (req, res) => {
  try {
    const payload = req.body;
    if (!payload?.cliente_id) {
      return res.status(400).json({ error: "cliente_id é obrigatório" });
    }
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { error } = await supabase
      .from("programas_cliente")
      .upsert(
        {
          ...payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cliente_id,program_id" }
      );

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao salvar programa" });
  }
});

export default router;
