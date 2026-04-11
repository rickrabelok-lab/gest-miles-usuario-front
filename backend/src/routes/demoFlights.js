import { Router } from "express";
import { supabase } from "../lib/supabase.js";

const router = Router();

/** @param {Record<string, unknown>} row */
function mapDemoFlightRow(row) {
  return {
    id: String(row.external_id ?? row.id ?? ""),
    originCode: String(row.origin_code ?? ""),
    destinationCode: String(row.destination_code ?? ""),
    origin: String(row.origin_name ?? ""),
    destination: String(row.destination_name ?? ""),
    airline: String(row.airline ?? ""),
    points: Number(row.points ?? 0),
    money: Number(row.money ?? 0),
  };
}

/** GET /api/demo-flights?destination=RIO */
router.get("/", async (req, res) => {
  try {
    const destinationCode = req.query.destination ? String(req.query.destination).toUpperCase() : null;
    const { data, error } = await supabase.from("demo_flights").select("*").order("external_id");
    if (error) {
      return res.status(500).json({ error: error.message || "Erro ao listar voos demo" });
    }
    const rows = data ?? [];
    const mapped = rows.map((r) => mapDemoFlightRow(r));
    let out = mapped;
    if (destinationCode) {
      const matches = mapped.filter((f) => f.destinationCode.toUpperCase() === destinationCode);
      out = matches.length > 0 ? matches : mapped;
    }
    return res.json(out.slice(0, 6));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "Erro ao listar voos demo" });
  }
});

export default router;
