import { apiFetch } from "@/services/api";

export type PromoWhatsappPref = { enabled: boolean };

/** Lê o estado do opt-out de promo WhatsApp do próprio cliente. */
export async function getPromoWhatsappPref(token: string): Promise<PromoWhatsappPref> {
  return apiFetch<PromoWhatsappPref>("/api/notifications/promo-whatsapp", { token });
}

/** Liga (enabled=true) ou desliga (false) as promoções no WhatsApp. */
export async function setPromoWhatsappPref(
  token: string,
  enabled: boolean,
): Promise<PromoWhatsappPref> {
  return apiFetch<PromoWhatsappPref>("/api/notifications/promo-whatsapp", {
    method: "PUT",
    body: JSON.stringify({ enabled }),
    token,
  });
}
