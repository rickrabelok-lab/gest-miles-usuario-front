import { Router } from "express";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/** GET /api/demandas?clientIds=id1,id2 - Lista demandas */
router.get("/", requireAuth, async (req, res) => {
  try {
    const ids = req.query.clientIds;
    if (!ids) {
      return res.status(400).json({ error: "clientIds é obrigatório" });
    }
    const idList = String(ids).split(",").filter(Boolean);
    if (idList.length === 0) {
      return res.json([]);
    }
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data, error } = await supabase
      .from("demandas_cliente")
      .select("id, cliente_id, tipo, status, payload, created_at")
      .in("cliente_id", idList)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json(data ?? []);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao listar demandas" });
  }
});

/** POST /api/demandas - Cria demanda */
router.post("/", requireAuth, async (req, res) => {
  try {
    const payload = req.body;
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    const { data, error } = await supabase
      .from("demandas_cliente")
      .insert({
        ...payload,
        cliente_id: payload.cliente_id ?? user.id,
      })
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao criar demanda" });
  }
});

/** PATCH /api/demandas/:id - Atualiza demanda (ex: status) */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const payload = req.body;
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data, error } = await supabase
      .from("demandas_cliente")
      .update(payload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao atualizar demanda" });
  }
});

export default router;
