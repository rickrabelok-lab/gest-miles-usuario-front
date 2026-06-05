import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { mapBonusOfferRow } from "../lib/bonusOffersMap.js";
import { serverError } from "../lib/httpError.js";

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
      return serverError(res, "Erro ao listar ofertas", error, "[bonus-offers]");
    }
    const offers = (data ?? []).map(mapBonusOfferRow).filter(Boolean);
    return res.json(offers);
  } catch (err) {
    return serverError(res, "Erro ao listar ofertas", err, "[bonus-offers]");
  }
});

export default router;
