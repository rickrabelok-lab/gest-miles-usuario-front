import test from "node:test";
import assert from "node:assert/strict";
import { moderationToken, verifyModeration } from "./promoModeration.js";

const SECRET = "segredo-de-teste";
const ID = "5f0c6c1e-0000-4000-8000-000000000001";

test("token é determinístico e valida com os mesmos parâmetros", () => {
  const token = moderationToken(ID, "approve", SECRET);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(verifyModeration({ id: ID, action: "approve", token, secret: SECRET }), "ok");
});

test("token de approve não vale pra reject (ação entra no HMAC)", () => {
  const token = moderationToken(ID, "approve", SECRET);
  assert.equal(verifyModeration({ id: ID, action: "reject", token, secret: SECRET }), "mismatch");
});

test("token errado, ausente ou de outro id => mismatch", () => {
  const token = moderationToken(ID, "approve", SECRET);
  assert.equal(verifyModeration({ id: ID, action: "approve", token: "x", secret: SECRET }), "mismatch");
  assert.equal(verifyModeration({ id: ID, action: "approve", token: undefined, secret: SECRET }), "mismatch");
  assert.equal(verifyModeration({ id: "outro-id", action: "approve", token, secret: SECRET }), "mismatch");
});

test("ação desconhecida => bad_action; sem secret => missing_env", () => {
  assert.equal(verifyModeration({ id: ID, action: "delete", token: "x", secret: SECRET }), "bad_action");
  assert.equal(verifyModeration({ id: ID, action: "approve", token: "x", secret: "" }), "missing_env");
  assert.equal(verifyModeration({ id: ID, action: "approve", token: "x", secret: undefined }), "missing_env");
});
