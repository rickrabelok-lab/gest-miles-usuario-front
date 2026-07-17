import test from "node:test";
import assert from "node:assert/strict";
import {
  PROMO_OPTOUT_KEY,
  OPTOUT_VALUE,
  isPromoWhatsappEnabled,
  parseEnabledInput,
} from "./notificationPrefs.js";

test("chave e valor são os literais que o pipeline espera", () => {
  assert.equal(PROMO_OPTOUT_KEY, "promo_optout");
  assert.equal(OPTOUT_VALUE, "true");
});

test("sem linha de opt-out => habilitado", () => {
  assert.equal(isPromoWhatsappEnabled([]), true);
  assert.equal(isPromoWhatsappEnabled(undefined), true);
});

test("linha valor='true' => desabilitado", () => {
  assert.equal(isPromoWhatsappEnabled([{ valor: "true" }]), false);
});

test("linha com outro valor => habilitado", () => {
  assert.equal(isPromoWhatsappEnabled([{ valor: "false" }]), true);
});

test("parseEnabledInput aceita booleano", () => {
  assert.deepEqual(parseEnabledInput({ enabled: true }), { ok: true, enabled: true });
  assert.deepEqual(parseEnabledInput({ enabled: false }), { ok: true, enabled: false });
});

test("parseEnabledInput rejeita não-booleano", () => {
  assert.equal(parseEnabledInput({ enabled: "true" }).ok, false);
  assert.equal(parseEnabledInput({}).ok, false);
  assert.equal(parseEnabledInput(null).ok, false);
});
