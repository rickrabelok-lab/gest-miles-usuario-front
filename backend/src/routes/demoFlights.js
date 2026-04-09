import { Router } from "express";
import { supabase } from "../lib/supabase.js";

const router = Router();

function mapRow(row) {
  return {
    id: row.external_id || row.id,
    originCode: row.origin_code,
    destinationCode: row.destination_code,
    origin: row.origin_name,
    destination: row.destination_name,
    airline: row.airline,
    points: Number(row.points),
    money: Number(row.money),
  };
}

/** GET /api/demo-flights?destination=CWB — sugestões para fluxo de busca (tabela `demo_flights`) */
router.get("/", async (req, res) => {
  try {
    const dest = req.query.destination ? String(req.query.destination).toUpperCase() : null;

    const { data: allRows, error: allErr } = await supabase
      .from("demo_flights")
      .select("*")
      .order("external_id");
    if (allErr) {
      return res.status(500).json({ error: allErr.message || "Erro ao listar voos" });
    }
    const all = allRows ?? [];

    let picked = all;
    if (dest) {
      const matches = all.filter((r) => String(r.destination_code).toUpperCase() === dest);
      picked = matches.length > 0 ? matches : all;
    }

    const flights = picked.slice(0, 6).map(mapRow);
    return res.json(flights);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Erro ao listar voos" });
  }
});

export default router;
