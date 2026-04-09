export function mapBonusOfferRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    program: String(row.program),
    store: String(row.store),
    multiplier: Number(row.multiplier),
    validUntil:
      typeof row.valid_until === "string"
        ? row.valid_until
        : row.valid_until?.toISOString?.().slice(0, 10) ?? "",
    conditions: row.conditions ?? "",
    offerUrl: row.offer_url ?? "",
  };
}
