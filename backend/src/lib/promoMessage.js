import { moderationToken } from "./promoModeration.js";

const CATEGORY_LABEL = {
  transfer: "🔄 Transferência",
  shopping: "🛍 Compras",
  miles: "✈️ Milhas",
  cards: "💳 Cartão",
};

function formatDateBr(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
}

/** Card de curadoria enviado ao grupo interno. Formato aprovado na Fase C:
 *  negrito com *, uma informação por linha, links completos (WhatsApp não tem botão). */
export function buildPromoModerationMessage(promo, { apiBaseUrl, secret }) {
  const base = String(apiBaseUrl ?? "").replace(/\/$/, "");
  const lines = ["🔔 *Nova promoção detectada*", ""];
  lines.push(`*${promo.title}*`);

  const cat = CATEGORY_LABEL[promo.category] ?? promo.category;
  const route = [promo.source_program, promo.target_program].filter(Boolean).join(" → ");
  lines.push(route ? `${cat} · ${route}` : cat);

  if (promo.bonus_value) lines.push(`Bônus: ${promo.bonus_value}`);
  const until = formatDateBr(promo.valid_until);
  if (until) lines.push(`Válida até: ${until}`);
  if (typeof promo.confidence === "number") {
    lines.push(`Confiança: ${promo.confidence.toFixed(2)}`);
  }
  if (promo.details) lines.push(`Regras: ${promo.details}`);

  // O moderador valida o link de participação ANTES de aprovar (é o que o cliente clica).
  lines.push(
    promo.cta_url
      ? `Link de participação: ${promo.cta_url}`
      : "⚠️ SEM link de participação — o cliente cairá no post da fonte",
  );

  const sources = Array.isArray(promo.source_links) ? promo.source_links : [];
  if (sources.length > 0) {
    lines.push(`Fontes: ${sources.map((s) => s.name).filter(Boolean).join(", ")}`);
  }

  const link = (action) =>
    `${base}/api/promo-alerts/moderate/${promo.id}?action=${action}&token=${moderationToken(promo.id, action, secret)}`;
  lines.push("", `✅ Aprovar: ${link("approve")}`, `❌ Rejeitar: ${link("reject")}`);
  return lines.join("\n");
}
