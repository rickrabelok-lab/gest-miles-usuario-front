import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { mapBonusOfferRow } from "../lib/bonusOffersMap.js";

const router = Router();

/** GET /api/bonus-offers?program=Livelo — Supabase `bonus_offers` (ativo) */
router.get("/", async (_req, res) => {
  try {
    const program = _req.query.program;
    let query = supabase.from("bonus_offers").select("*").eq("active", true);
    if (program) {
      query = query.eq("program", String(program));
    }
    const { data, error } = await query.order("program", { ascending: true });
    if (error) {
      return res.status(500).json({ error: error.message || "Erro ao listar ofertas" });
    }
    const offers = (data ?? []).map(mapBonusOfferRow).filter(Boolean);
    return res.json(offers);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao listar ofertas" });
  }
});

export default router;
