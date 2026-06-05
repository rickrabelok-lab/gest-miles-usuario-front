import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sendEmail, mailerConfigured, resendFrom } from "./mailer.js";

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM = "no-reply@gestmiles.com.br";
  delete process.env.RESEND_FROM_NAME;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  delete process.env.RESEND_FROM_NAME;
});

test("mailerConfigured: false sem chave ou sem remetente", () => {
  delete process.env.RESEND_API_KEY;
  assert.equal(mailerConfigured(), false);
  process.env.RESEND_API_KEY = "re_test_key";
  delete process.env.RESEND_FROM;
  assert.equal(mailerConfigured(), false);
});

test("resendFrom: envolve e-mail puro com nome default; respeita formato completo", () => {
  assert.equal(resendFrom(), "Gest Miles <no-reply@gestmiles.com.br>");
  process.env.RESEND_FROM = "Time <ola@gestmiles.com.br>";
  assert.equal(resendFrom(), "Time <ola@gestmiles.com.br>");
});

test("sendEmail: não chama fetch quando não-configurado", async () => {
  delete process.env.RESEND_API_KEY;
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, text: async () => "" }; };
  const res = await sendEmail({ to: "a@b.com", subject: "x", html: "<p>x</p>" });
  assert.deepEqual(res, { ok: false, reason: "not-configured" });
  assert.equal(called, false);
});

test("sendEmail: POST no Resend com Bearer + corpo correto", async () => {
  let captured = null;
  globalThis.fetch = async (url, opts) => {
    captured = { url, opts };
    return { ok: true, text: async () => "" };
  };
  const res = await sendEmail({
    to: "cliente@b.com",
    subject: "Assunto",
    html: "<p>oi</p>",
    replyTo: "resp@b.com",
  });
  assert.deepEqual(res, { ok: true });
  assert.equal(captured.url, "https://api.resend.com/emails");
  assert.equal(captured.opts.method, "POST");
  assert.equal(captured.opts.headers.Authorization, "Bearer re_test_key");
  const body = JSON.parse(captured.opts.body);
  assert.equal(body.from, "Gest Miles <no-reply@gestmiles.com.br>");
  assert.deepEqual(body.to, ["cliente@b.com"]);
  assert.equal(body.subject, "Assunto");
  assert.equal(body.html, "<p>oi</p>");
  assert.equal(body.reply_to, "resp@b.com");
});

test("sendEmail: resposta não-ok retorna ok:false com o texto do erro", async () => {
  globalThis.fetch = async () => ({ ok: false, text: async () => "dominio nao verificado" });
  const res = await sendEmail({ to: "a@b.com", subject: "x", html: "<p>x</p>" });
  assert.equal(res.ok, false);
  assert.equal(res.reason, "dominio nao verificado");
});

test("sendEmail: nunca lança quando fetch estoura", async () => {
  globalThis.fetch = async () => { throw new Error("network down"); };
  const res = await sendEmail({ to: "a@b.com", subject: "x", html: "<p>x</p>" });
  assert.deepEqual(res, { ok: false, reason: "network down" });
});
