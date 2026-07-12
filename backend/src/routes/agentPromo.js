import { Router } from "express";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { serverError } from "../lib/httpError.js";
import { agentKeyStatus } from "../lib/agentAuth.js";
import { buildPromoModerationMessage } from "../lib/promoMessage.js";

const router = Router();

/**
 * GET /api/agent/promo-message/:id — server-to-server (workflow n8n gm-promo-ingest).
 * Auth: x-api-key === AGENT_API_KEY. Devolve a mensagem de curadoria PRONTA
 * (com links HMAC) — o segredo de moderação nunca entra no n8n.
 */
router.get("/promo-message/:id", async (req, res) => {
  try {
    const keyStatus = agentKeyStatus(req.get("x-api-key"), process.env.AGENT_API_KEY);
    if (keyStatus === "missing_env") {
      return res.status(503).json({ error: "AGENT_API_KEY não configurada no servidor." });
    }
    if (keyStatus === "mismatch") {
      return res.status(401).json({ error: "API key inválida." });
    }
    const secret = process.env.PROMO_MODERATION_SECRET;
    const apiBaseUrl = process.env.PUBLIC_API_URL;
    if (!(secret ?? "").trim() || !(apiBaseUrl ?? "").trim()) {
      return res.status(503).json({ error: "PROMO_MODERATION_SECRET/PUBLIC_API_URL não configuradas." });
    }

    const service = assertSupabaseService();
    const { data, error } = await service
      .from("promo_alerts")
      .select("id, category, source_program, target_program, title, bonus_value, valid_until, confidence, details, cta_url, source_links, milheiro_cost, milheiro_note")
      .eq("id", req.params.id)
      .maybeSingle();
    if (error) {
      return serverError(res, "Erro ao ler promoção", error, "[agent-promo]");
    }
    if (!data) {
      return res.status(404).json({ error: "Promoção não encontrada." });
    }
    return res.json({ message: buildPromoModerationMessage(data, { apiBaseUrl, secret }) });
  } catch (err) {
    return serverError(res, "Erro ao montar mensagem de promoção", err, "[agent-promo]");
  }
});

export default router;
