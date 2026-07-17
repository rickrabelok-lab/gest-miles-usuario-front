import { Router } from "express";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireUser } from "../middleware/requireUser.js";
import { serverError } from "../lib/httpError.js";
import {
  PROMO_OPTOUT_KEY,
  OPTOUT_VALUE,
  isPromoWhatsappEnabled,
  parseEnabledInput,
} from "../lib/notificationPrefs.js";

const router = Router();

/** GET /api/notifications/promo-whatsapp — estado do opt-out do próprio cliente. */
router.get("/promo-whatsapp", requireUser, async (req, res) => {
  try {
    const sb = assertSupabaseService();
    const { data, error } = await sb
      .from("agent_preferencias")
      .select("valor")
      .eq("cliente_id", req.user.id)
      .eq("chave", PROMO_OPTOUT_KEY);
    if (error) {
      return serverError(res, "Erro ao carregar preferências.", error, "[notifications]");
    }
    return res.json({ enabled: isPromoWhatsappEnabled(data) });
  } catch (err) {
    return serverError(res, "Erro ao carregar preferências.", err, "[notifications]");
  }
});

/**
 * PUT /api/notifications/promo-whatsapp body { enabled } — liga/desliga.
 * Idempotente e independente de constraint: sempre apaga as linhas do opt-out;
 * se enabled=false, insere exatamente uma linha valor='true'.
 */
router.put("/promo-whatsapp", requireUser, async (req, res) => {
  try {
    const parsed = parseEnabledInput(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    const sb = assertSupabaseService();
    const clienteId = req.user.id;

    const { error: delErr } = await sb
      .from("agent_preferencias")
      .delete()
      .eq("cliente_id", clienteId)
      .eq("chave", PROMO_OPTOUT_KEY);
    if (delErr) {
      return serverError(res, "Erro ao salvar preferência.", delErr, "[notifications]");
    }

    if (!parsed.enabled) {
      const { error: insErr } = await sb
        .from("agent_preferencias")
        .insert({ cliente_id: clienteId, chave: PROMO_OPTOUT_KEY, valor: OPTOUT_VALUE });
      if (insErr) {
        return serverError(res, "Erro ao salvar preferência.", insErr, "[notifications]");
      }
    }

    return res.json({ enabled: parsed.enabled });
  } catch (err) {
    return serverError(res, "Erro ao salvar preferência.", err, "[notifications]");
  }
});

export default router;
