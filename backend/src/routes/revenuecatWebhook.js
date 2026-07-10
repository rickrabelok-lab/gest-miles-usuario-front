import express from "express";

import { assertSupabaseService } from "../lib/supabaseService.js";
import { mapRevenueCatEvent, webhookAuthOk } from "../lib/revenuecatHelpers.js";

const router = express.Router();

/**
 * Webhook do RevenueCat (config no dashboard RC: URL + valor do header
 * Authorization = REVENUECAT_WEBHOOK_SECRET, verbatim). JSON normal — a auth
 * é por header, não por assinatura do raw body como o Stripe.
 * Escreve APENAS as colunas de assinatura B2C do perfis; stripe_* e
 * plano_ativo (B2B) ficam intocados.
 */
router.post("/webhook", async (req, res) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "REVENUECAT_WEBHOOK_SECRET não configurada." });
  }
  if (!webhookAuthOk(req.headers.authorization, secret)) {
    return res.status(401).json({ error: "Não autorizado." });
  }

  const result = mapRevenueCatEvent(req.body?.event, Date.now());
  if (result.action === "skip") {
    console.log("[revenuecat] evento ignorado:", result.reason);
    return res.json({ received: true, skipped: result.reason });
  }

  try {
    const sb = assertSupabaseService();
    const { error } = await sb
      .from("perfis")
      .update(result.patch)
      .eq("usuario_id", result.usuarioId);
    if (error) throw error;
    return res.json({ received: true });
  } catch (e) {
    console.error("RevenueCat webhook:", e);
    return res.status(500).json({ error: "Webhook handler error" });
  }
});

export default router;
