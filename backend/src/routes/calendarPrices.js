import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { generateEstimatedMonthPrices } from "../lib/calendarEstimate.js";

const router = Router();

const monthKeyFromDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

/** GET /api/calendar-prices?origin=SAO&destination=RIO&mode=money&month=2026-04 */
router.get("/", async (req, res) => {
  try {
    const originCode = String(req.query.origin || "SAO").toUpperCase();
    const destinationCode = String(req.query.destination || "RIO").toUpperCase();
    const mode = req.query.mode === "points" ? "points" : "money";
    const monthStr = req.query.month || new Date().toISOString().slice(0, 7);
    const [year, month] = monthStr.split("-").map(Number);
    const monthDate = new Date(year, (month || 1) - 1, 1);
    const yearMonth = monthStr;

    const { data, error } = await supabase
      .from("calendar_prices")
      .select("prices")
      .eq("origin_code", originCode)
      .eq("destination_code", destinationCode)
      .eq("mode", mode)
      .eq("year_month", yearMonth)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message || "Erro ao obter preços" });
    }

    const raw = data?.prices;
    const fromDb =
      raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).length > 0;

    if (fromDb) {
      const out = {};
      for (const [k, v] of Object.entries(raw)) {
        const day = Number(k);
        const num = Number(v);
        if (Number.isFinite(day) && day >= 1 && day <= 31 && Number.isFinite(num)) {
          out[day] = num;
        }
      }
      return res.json(out);
    }

    const estimated = generateEstimatedMonthPrices({
      originCode,
      destinationCode,
      mode,
      month: monthDate,
    });
    return res.json(estimated);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao obter preços" });
  }
});

export default router;
