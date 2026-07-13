import { test } from "node:test";
import assert from "node:assert/strict";
import { isUuid, mapRevenueCatEvent, webhookAuthOk } from "./revenuecatHelpers.js";

const NOW = 1_800_000_000_000; // fixo p/ determinismo
const FUTURO = NOW + 30 * 24 * 60 * 60 * 1000;
const PASSADO = NOW - 1000;
const UID = "3bac3bf0-2e66-4161-bc91-e107e443e8ba";

const evento = (extra) => ({
  type: "INITIAL_PURCHASE",
  app_user_id: UID,
  product_id: "gm_plus_mensal",
  expiration_at_ms: FUTURO,
  period_type: "NORMAL",
  store: "PLAY_STORE",
  environment: "PRODUCTION",
  ...extra,
});

test("compra inicial com expiração futura vira active", () => {
  const r = mapRevenueCatEvent(evento(), NOW);
  assert.equal(r.action, "update");
  assert.equal(r.usuarioId, UID);
  assert.equal(r.patch.subscription_status, "active");
  assert.equal(r.patch.subscription_plan_slug, "gm_plus_mensal");
  assert.equal(r.patch.subscription_provider, "play");
  assert.equal(r.patch.subscription_current_period_end, new Date(FUTURO).toISOString());
});

test("period_type TRIAL vira trialing", () => {
  const r = mapRevenueCatEvent(evento({ period_type: "TRIAL" }), NOW);
  assert.equal(r.patch.subscription_status, "trialing");
});

test("CANCELLATION com expiração futura mantém active (acesso até expirar)", () => {
  const r = mapRevenueCatEvent(evento({ type: "CANCELLATION" }), NOW);
  assert.equal(r.patch.subscription_status, "active");
});

test("BILLING_ISSUE com expiração futura mantém active (grace da loja)", () => {
  const r = mapRevenueCatEvent(evento({ type: "BILLING_ISSUE" }), NOW);
  assert.equal(r.patch.subscription_status, "active");
});

test("expiração no passado vira canceled", () => {
  const r = mapRevenueCatEvent(evento({ expiration_at_ms: PASSADO }), NOW);
  assert.equal(r.patch.subscription_status, "canceled");
});

test("EXPIRATION vira canceled mesmo com timestamp estranho", () => {
  const r = mapRevenueCatEvent(evento({ type: "EXPIRATION", expiration_at_ms: FUTURO }), NOW);
  assert.equal(r.patch.subscription_status, "canceled");
});

test("store APP_STORE vira provider apple", () => {
  const r = mapRevenueCatEvent(evento({ store: "APP_STORE" }), NOW);
  assert.equal(r.patch.subscription_provider, "apple");
});

test("app_user_id anônimo do RC é ignorado", () => {
  const r = mapRevenueCatEvent(evento({ app_user_id: "$RCAnonymousID:abc123" }), NOW);
  assert.equal(r.action, "skip");
});

test("evento TEST é ignorado", () => {
  assert.equal(mapRevenueCatEvent(evento({ type: "TEST" }), NOW).action, "skip");
});

test("environment SANDBOX é ignorado (tester não vira acesso em prod)", () => {
  const r = mapRevenueCatEvent(evento({ environment: "SANDBOX" }), NOW);
  assert.equal(r.action, "skip");
});

test("environment ausente é ignorado (fail-closed)", () => {
  const r = mapRevenueCatEvent(evento({ environment: undefined }), NOW);
  assert.equal(r.action, "skip");
});

test("TRANSFER revoga as contas de origem (transferred_from)", () => {
  const OUTRO = "9f1e2d3c-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
  const r = mapRevenueCatEvent(
    evento({ type: "TRANSFER", app_user_id: undefined, transferred_from: [UID, OUTRO], transferred_to: ["x"] }),
    NOW,
  );
  assert.equal(r.action, "revoke");
  assert.deepEqual(r.usuarioIds, [UID, OUTRO]);
  assert.equal(r.patch.subscription_status, "canceled");
});

test("TRANSFER filtra app_user_id inválido/anônimo do transferred_from", () => {
  const r = mapRevenueCatEvent(
    evento({ type: "TRANSFER", app_user_id: undefined, transferred_from: [UID, "$RCAnonymousID:z", ""] }),
    NOW,
  );
  assert.equal(r.action, "revoke");
  assert.deepEqual(r.usuarioIds, [UID]);
});

test("TRANSFER sem transferred_from válido é ignorado", () => {
  const r = mapRevenueCatEvent(
    evento({ type: "TRANSFER", app_user_id: undefined, transferred_from: ["$RCAnonymousID:z"] }),
    NOW,
  );
  assert.equal(r.action, "skip");
});

test("TRANSFER em SANDBOX é ignorado (gate de environment vale antes)", () => {
  const r = mapRevenueCatEvent(
    evento({ type: "TRANSFER", environment: "SANDBOX", app_user_id: undefined, transferred_from: [UID] }),
    NOW,
  );
  assert.equal(r.action, "skip");
});

test("payload sem event é ignorado", () => {
  assert.equal(mapRevenueCatEvent(null, NOW).action, "skip");
  assert.equal(mapRevenueCatEvent(undefined, NOW).action, "skip");
});

test("sem expiration_at_ms numérico vira canceled (não dá acesso de graça)", () => {
  const r = mapRevenueCatEvent(evento({ expiration_at_ms: undefined }), NOW);
  assert.equal(r.patch.subscription_status, "canceled");
});

test("isUuid aceita uuid e rejeita lixo", () => {
  assert.equal(isUuid(UID), true);
  assert.equal(isUuid("$RCAnonymousID:x"), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid(null), false);
});

test("webhookAuthOk compara certo e nega vazios", () => {
  assert.equal(webhookAuthOk("segredo-x", "segredo-x"), true);
  assert.equal(webhookAuthOk("segredo-errado", "segredo-x"), false);
  assert.equal(webhookAuthOk(undefined, "segredo-x"), false);
  assert.equal(webhookAuthOk("segredo-x", undefined), false);
  assert.equal(webhookAuthOk("", ""), false);
});

test("EXPIRATION com expiração numérica traz guardPeriodEnd (protege re-assinatura de retry atrasado)", () => {
  const r = mapRevenueCatEvent(evento({ type: "EXPIRATION", expiration_at_ms: FUTURO }), NOW);
  assert.equal(r.guardPeriodEnd, new Date(FUTURO).toISOString());
});

test("INITIAL_PURCHASE/CANCELLATION não trazem guardPeriodEnd", () => {
  assert.equal(mapRevenueCatEvent(evento(), NOW).guardPeriodEnd, null);
  assert.equal(
    mapRevenueCatEvent(evento({ type: "CANCELLATION" }), NOW).guardPeriodEnd,
    null,
  );
});

test("EXPIRATION sem expiration_at_ms numérico não traz guardPeriodEnd", () => {
  const r = mapRevenueCatEvent(evento({ type: "EXPIRATION", expiration_at_ms: undefined }), NOW);
  assert.equal(r.guardPeriodEnd, null);
});
