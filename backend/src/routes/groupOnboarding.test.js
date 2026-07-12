import test from "node:test";
import assert from "node:assert/strict";

// A orquestração de DB é coberta pela lib pura (groupClientMatch.test) + E2E real.
// Aqui: o que roda ANTES do DB — auth + validação de input. Padrão da casa
// (index.cors.test): importa o app, listen(0), fetch. Sem supertest.
process.env.VERCEL = "1"; // evita o app.listen(3000) automático fora da Vercel
process.env.AGENT_API_KEY = "chave-de-teste";

const { default: app } = await import("../index.js");

function listen(a) {
  return new Promise((r) => {
    const s = a.listen(0, () => r(s));
  });
}

test("group-onboarding: 401 com x-api-key errada (antes de tocar o DB)", async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/agent/group-onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "errada" },
      body: JSON.stringify({ tenant_id: 3, groups: [{ jid: "g1", nome: "x" }] }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("group-onboarding: 400 sem groups (key correta, antes do DB)", async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/agent/group-onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "chave-de-teste" },
      body: JSON.stringify({ tenant_id: 3, groups: [] }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});
