/**
 * Mapeia linha `bonus_offers` (Supabase) para o contrato da API.
 * @param {Record<string, unknown>} row
 */
export function mapBonusOfferRow(row) {
  if (!row || typeof row !== "object") return null;
  const id = row.id != null ? String(row.id) : "";
  if (!id) return null;
  return {
    id,
    program: row.program != null ? String(row.program) : "",
    store: row.store != null ? String(row.store) : "",
    multiplier: Number(row.multiplier ?? 0),
    validUntil:
      row.valid_until != null
        ? String(row.valid_until)
        : row.validUntil != null
          ? String(row.validUntil)
          : "",
    conditions: row.conditions != null ? String(row.conditions) : "",
    offerUrl:
      row.offer_url != null
        ? String(row.offer_url)
        : row.offerUrl != null
          ? String(row.offerUrl)
          : "",
  };
}
