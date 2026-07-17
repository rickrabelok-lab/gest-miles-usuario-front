/** Chave/valor que os workflows n8n 3-B filtram (não mudar). */
export const PROMO_OPTOUT_KEY = "promo_optout";
export const OPTOUT_VALUE = "true";

/** Habilitado (recebe) quando NENHUMA linha marca opt-out. */
export function isPromoWhatsappEnabled(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return !list.some((r) => r?.valor === OPTOUT_VALUE);
}

/** Valida o body do PUT: exige `enabled` booleano. */
export function parseEnabledInput(body) {
  if (!body || typeof body.enabled !== "boolean") {
    return { ok: false, error: "Campo 'enabled' (booleano) é obrigatório." };
  }
  return { ok: true, enabled: body.enabled };
}
