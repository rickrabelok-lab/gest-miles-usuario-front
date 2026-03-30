import { Router } from "express";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/** GET /api/gestor/clientes - Lista cliente_ids vinculados ao gestor */
router.get("/clientes", requireAuth, async (req, res) => {
  try {
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    const { data, error } = await supabase
      .from("gestor_clientes")
      .select("cliente_id")
      .eq("gestor_id", user.id);

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json((data ?? []).map((r) => r.cliente_id));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao listar clientes" });
  }
});

/** POST /api/gestor/vincular - Vincula cliente ao gestor */
router.post("/vincular", requireAuth, async (req, res) => {
  try {
    const { clienteId } = req.body || {};
    if (!clienteId) {
      return res.status(400).json({ error: "clienteId é obrigatório" });
    }
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    const { error } = await supabase.from("gestor_clientes").insert({
      gestor_id: user.id,
      cliente_id: clienteId.trim(),
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao vincular" });
  }
});

/** DELETE /api/gestor/desvincular/:clienteId */
router.delete("/desvincular/:clienteId", requireAuth, async (req, res) => {
  try {
    const clienteId = req.params.clienteId;
    if (!clienteId) {
      return res.status(400).json({ error: "clienteId é obrigatório" });
    }
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }
    const { data, error } = await supabase
      .from("gestor_clientes")
      .delete()
      .eq("gestor_id", user.id)
      .eq("cliente_id", clienteId)
      .select("cliente_id");

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json({ deleted: (data ?? []).length > 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao desvincular" });
  }
});

/** GET /api/gestor/perfis?ids=id1,id2 - Perfis dos clientes */
router.get("/perfis", requireAuth, async (req, res) => {
  try {
    const ids = req.query.ids;
    if (!ids) {
      return res.status(400).json({ error: "ids é obrigatório (ids=id1,id2)" });
    }
    const idList = String(ids).split(",").filter(Boolean);
    if (idList.length === 0) {
      return res.json([]);
    }
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data, error } = await supabase
      .from("perfis")
      .select("usuario_id, nome_completo, configuracao_tema")
      .in("usuario_id", idList);

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json(data ?? []);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao listar perfis" });
  }
});

/** GET /api/gestor/programas?ids=id1,id2 - Programas dos clientes */
router.get("/programas", requireAuth, async (req, res) => {
  try {
    const ids = req.query.ids;
    if (!ids) {
      return res.status(400).json({ error: "ids é obrigatório" });
    }
    const idList = String(ids).split(",").filter(Boolean);
    if (idList.length === 0) {
      return res.json([]);
    }
    const supabase = createSupabaseWithAuth(req.accessToken);
    const { data, error } = await supabase
      .from("programas_cliente")
      .select("cliente_id, program_id, program_name, saldo, custo_medio_milheiro, updated_at, state")
      .in("cliente_id", idList);

    if (error) {
      return res.status(400).json({ error: error.message });
    }
    return res.json(data ?? []);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao listar programas" });
  }
});

/** GET /api/gestor/demandas?ids=id1,id2 - Demandas dos clientes */
router.get("/demandas", requireAuth, async (req, res) => {
  try {
    const ids = req.query.ids;
    if (!ids) {
      return res.status(400).json({ error: "ids é obrigatório" });
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

export default router;
