import crypto from "node:crypto";

/** Eventos que geram escrita no perfis; o resto é ignorado com 200 (RC retenta em não-2xx). */
const UPDATE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "BILLING_ISSUE",
  "CANCELLATION",
  "EXPIRATION",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Comparação constante-time do header Authorization com o secret (hash iguala tamanhos). */
export function webhookAuthOk(headerValue, secret) {
  if (!headerValue || !secret) return false;
  const a = crypto.createHash("sha256").update(String(headerValue)).digest();
  const b = crypto.createHash("sha256").update(String(secret)).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Mapeia um evento de webhook do RevenueCat pro patch de `perfis`.
 * Regra dirigida por expiração: acesso enquanto `expiration_at_ms` no futuro
 * (cobre CANCELLATION que mantém acesso e BILLING_ISSUE em grace); EXPIRATION
 * corta. Nunca toca stripe_* nem plano_ativo — isso é decisão do caller também.
 *
 * `guardPeriodEnd`: só preenchido pra EXPIRATION com expiração numérica.
 * O RC retenta entrega de webhook em falha; se um EXPIRATION antigo for
 * reentregue DEPOIS que o usuário já re-comprou (nova `subscription_current_
 * period_end` mais no futuro), o caller deve aplicar o update só em linhas
 * cujo período vigente seja <= esse timestamp — senão o retry atrasado
 * clobbera a re-assinatura e derruba o acesso de quem já pagou de novo.
 */
export function mapRevenueCatEvent(event, nowMs) {
  if (!event || typeof event !== "object") return { action: "skip", reason: "payload sem event" };
  const type = event.type;
  if (!UPDATE_EVENTS.has(type)) {
    return { action: "skip", reason: `evento ${type ?? "desconhecido"} ignorado` };
  }
  if (!isUuid(event.app_user_id)) {
    return { action: "skip", reason: "app_user_id não é usuario_id (anônimo/inválido)" };
  }

  const expMs = typeof event.expiration_at_ms === "number" ? event.expiration_at_ms : null;
  const ativo = type !== "EXPIRATION" && expMs !== null && expMs > nowMs;
  const status = ativo ? (event.period_type === "TRIAL" ? "trialing" : "active") : "canceled";
  const guardPeriodEnd = type === "EXPIRATION" && expMs !== null ? new Date(expMs).toISOString() : null;

  return {
    action: "update",
    usuarioId: event.app_user_id,
    patch: {
      subscription_status: status,
      subscription_plan_slug: event.product_id ?? null,
      subscription_current_period_end: expMs !== null ? new Date(expMs).toISOString() : null,
      subscription_provider: event.store === "APP_STORE" ? "apple" : "play",
    },
    guardPeriodEnd,
  };
}
