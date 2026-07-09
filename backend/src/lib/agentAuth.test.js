import { test } from "node:test";
import assert from "node:assert/strict";
import { agentKeyStatus } from "./agentAuth.js";

// Guard do canal server-to-server (n8n → BFF): sem env configurada o endpoint
// fica fechado (503), chave errada é 401, chave certa passa.

test("sem AGENT_API_KEY no env: missing_env (endpoint fechado)", () => {
  assert.equal(agentKeyStatus("qualquer", undefined), "missing_env");
  assert.equal(agentKeyStatus("qualquer", ""), "missing_env");
  assert.equal(agentKeyStatus("qualquer", "   "), "missing_env");
});

test("chave errada, ausente ou com tamanho diferente: mismatch", () => {
  assert.equal(agentKeyStatus("errada", "certa"), "mismatch");
  assert.equal(agentKeyStatus(undefined, "certa"), "mismatch");
  assert.equal(agentKeyStatus("", "certa"), "mismatch");
});

test("chave certa (com espaços nas pontas tolerados): ok", () => {
  assert.equal(agentKeyStatus("chave-123", "chave-123"), "ok");
  assert.equal(agentKeyStatus(" chave-123 ", "chave-123"), "ok");
});
