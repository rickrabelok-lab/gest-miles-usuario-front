import test from "node:test";
import assert from "node:assert/strict";

// Bug real (2026-07-11): o POST do formulário de moderação vem do PRÓPRIO domínio
// da API (a página é servida por ela) e o browser SEMPRE manda Origin em POST —
// o domínio da API não estava na allowlist de CORS => 500 no clique do moderador.
// (GET passava porque navegação top-level não manda Origin; o curl do E2E também não.)

process.env.PUBLIC_API_URL = "https://api-teste.exemplo.com.br";
process.env.PROMO_MODERATION_SECRET = "segredo-de-teste";
// Evita o app.listen(3000) automático do index.js fora da Vercel.
process.env.VERCEL = "1";

const { default: app } = await import("./index.js");

function listen(appInstance) {
  return new Promise((resolve) => {
    const server = appInstance.listen(0, () => resolve(server));
  });
}

test("POST same-origin da página de moderação (Origin = PUBLIC_API_URL) não morre no CORS", async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/promo-alerts/moderate/abc?action=approve&token=x`,
      { method: "POST", headers: { Origin: process.env.PUBLIC_API_URL } },
    );
    // Token inválido => 401 (página "Link inválido"). O bug fazia o CORS estourar antes: 500.
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test("origem desconhecida continua bloqueada pelo CORS (não regrediu)", async () => {
  const server = await listen(app);
  try {
    const { port } = server.address();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/promo-alerts/moderate/abc?action=approve&token=x`,
      { method: "POST", headers: { Origin: "https://malicioso.exemplo.com" } },
    );
    assert.equal(res.status, 500);
  } finally {
    server.close();
  }
});
