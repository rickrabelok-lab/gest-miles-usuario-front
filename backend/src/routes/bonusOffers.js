import { Router } from "express";
import { BONUS_OFFERS_MOCK } from "../data/bonusOffersMock.js";

const router = Router();

/** GET /api/bonus-offers?program=Livelo - Lista ofertas de bônus (mock) */
router.get("/", async (req, res) => {
  try {
    await new Promise((r) => setTimeout(r, 260));
    const program = req.query.program;
    let offers = BONUS_OFFERS_MOCK;
    if (program) {
      offers = offers.filter((o) => o.program === program);
    }
    return res.json(offers);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao listar ofertas" });
  }
});

export default router;
