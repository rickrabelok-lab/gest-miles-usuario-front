import { Router } from "express";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { serverError, publicError } from "../lib/httpError.js";
import { buildDemandaInsert, buildDemandaUpdate } from "../lib/demandaPayload.js";

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
      return publicError(res, 400, "Não foi possível listar as demandas.", error, "[demandas]");
    }
    return res.json(data ?? []);
  } catch (err) {
    return serverError(res, "Erro ao listar demandas", err, "[demandas]");
  }
});

/** POST /api/demandas - Cria demanda */
router.post("/", requireAuth, async (req, res) => {
  try {
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    // Allowlist: só colunas de negócio entram (sem spread cego de req.body).
    const insertPayload = buildDemandaInsert(req.body, user.id);
    if (!insertPayload.tipo) {
      return res.status(400).json({ error: "tipo é obrigatório." });
    }
    const { data, error } = await supabase
      .from("demandas_cliente")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      return publicError(res, 400, "Não foi possível criar a demanda.", error, "[demandas]");
    }
    return res.json(data);
  } catch (err) {
    return serverError(res, "Erro ao criar demanda", err, "[demandas]");
  }
});

/** PATCH /api/demandas/:id - Atualiza demanda (ex: status) */
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    // Allowlist: só campos mutáveis de negócio; nunca cliente_id/id/timestamps.
    const updatePayload = buildDemandaUpdate(req.body);
    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: "Nenhum campo válido para atualizar." });
    }
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data, error } = await supabase
      .from("demandas_cliente")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return publicError(res, 400, "Não foi possível atualizar a demanda.", error, "[demandas]");
    }
    return res.json(data);
  } catch (err) {
    return serverError(res, "Erro ao atualizar demanda", err, "[demandas]");
  }
});

export default router;
