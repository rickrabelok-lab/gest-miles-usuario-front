import test from "node:test";
import assert from "node:assert/strict";

// Padrão da casa (groupOnboarding.test): importa o app, listen(0), fetch.
// Aqui cobrimos o pré-DB: sem token => 401 (requireUser barra antes de tocar o banco).
process.env.VERCEL = "1"; // evita o app.listen(3000) automático fora da Vercel

const { default: app } = await import("../index.js");

function listen(a) {
  return new Promise((r) => {
    const s = a.listen(0, () => r(s));
  });
}

test("GET promo-whatsapp: 401 sem token", async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/notifications/promo-whatsapp`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("PUT promo-whatsapp: 401 sem token", async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/notifications/promo-whatsapp`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});
