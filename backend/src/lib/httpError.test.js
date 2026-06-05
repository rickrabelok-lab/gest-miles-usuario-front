import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { serverError } from "./httpError.js";

const ORIGINAL_ERROR = console.error;
let logged;

beforeEach(() => { logged = []; console.error = (...a) => logged.push(a); });
afterEach(() => { console.error = ORIGINAL_ERROR; });

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test("serverError: responde 500 com a mensagem pública (não vaza err.message)", () => {
  const res = fakeRes();
  serverError(res, "Erro ao salvar.", new Error("coluna secreta xpto"), "[t]");
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Erro ao salvar." });
});

test("serverError: loga o erro real no servidor", () => {
  const res = fakeRes();
  serverError(res, "Erro ao salvar.", new Error("detalhe interno"), "[t]");
  assert.equal(logged.length, 1);
  assert.ok(String(logged[0].join(" ")).includes("detalhe interno"));
});

test("serverError: aceita não-Error sem quebrar", () => {
  const res = fakeRes();
  serverError(res, "Erro.", "string solta", "[t]");
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Erro." });
});
