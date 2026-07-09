import { Router } from "express";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { serverError } from "../lib/httpError.js";
import { agentKeyStatus } from "../lib/agentAuth.js";
import { buildDemandasResumo } from "../lib/demandasResumo.js";

const router = Router();

/**
 * GET /api/agent/demandas-resumo — consumo server-to-server (workflow n8n
 * gm-resumo-demandas). Auth: header x-api-key === AGENT_API_KEY (sem sessão
 * de usuário). Lê via service role: demandas ativas + criadas nas últimas 24h.
 */
router.get("/demandas-resumo", async (req, res) => {
  try {
    const keyStatus = agentKeyStatus(req.get("x-api-key"), process.env.AGENT_API_KEY);
    if (keyStatus === "missing_env") {
      return res.status(503).json({ error: "AGENT_API_KEY não configurada no servidor." });
    }
    if (keyStatus === "mismatch") {
      return res.status(401).json({ error: "API key inválida." });
    }

    const supabase = assertSupabaseService();
    const cutoff = new Date(Date.now() - 86_400_000).toISOString();
    const { data: demandas, error } = await supabase
      .from("demandas_cliente")
      .select("id, cliente_id, tipo, status, payload, created_at, updated_at")
      .or(`status.in.(pendente,em_andamento),created_at.gte.${cutoff}`)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      return serverError(res, "Erro ao ler demandas", error, "[agent-resumo]");
    }

    const clienteIds = [...new Set((demandas ?? []).map((d) => d.cliente_id))];
    let perfisById = new Map();
    if (clienteIds.length > 0) {
      const { data: perfis, error: perfisError } = await supabase
        .from("perfis")
        .select("usuario_id, nome, nome_completo, equipe_id")
        .in("usuario_id", clienteIds);
      if (perfisError) {
        return serverError(res, "Erro ao ler perfis", perfisError, "[agent-resumo]");
      }
      perfisById = new Map((perfis ?? []).map((p) => [p.usuario_id, p]));
    }

    const rows = (demandas ?? []).map((d) => {
      const perfil = perfisById.get(d.cliente_id);
      const nome = (perfil?.nome ?? "").trim() || perfil?.nome_completo || null;
      return { ...d, cliente_nome: nome, equipe_id: perfil?.equipe_id ?? null };
    });

    return res.json({ gerado_em: new Date().toISOString(), ...buildDemandasResumo(rows) });
  } catch (err) {
    return serverError(res, "Erro ao montar resumo de demandas", err, "[agent-resumo]");
  }
});

export default router;
