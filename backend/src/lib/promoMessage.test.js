import test from "node:test";
import assert from "node:assert/strict";
import { buildPromoModerationMessage } from "./promoMessage.js";
import { moderationToken } from "./promoModeration.js";

const SECRET = "segredo-de-teste";
const BASE = "https://api.exemplo.com.br";
const promo = {
  id: "5f0c6c1e-0000-4000-8000-000000000001",
  category: "transfer",
  source_program: "Livelo",
  target_program: "Smiles",
  title: "Livelo dá 100% de bônus pra Smiles",
  bonus_value: "100%",
  valid_until: "2026-07-20",
  confidence: 0.92,
  details: "Bônus para transferências até 20/07.",
  cta_url: "https://www.livelo.com.br/promo-smiles",
  source_links: [{ name: "Melhores Cartões", url: "https://exemplo.com/post" }],
};

test("mensagem traz título, categoria, bônus, validade, fonte e os 2 links de moderação", () => {
  const msg = buildPromoModerationMessage(promo, { apiBaseUrl: BASE, secret: SECRET });
  assert.match(msg, /Livelo dá 100% de bônus pra Smiles/);
  assert.match(msg, /Transferência/);
  assert.match(msg, /Livelo → Smiles/);
  assert.match(msg, /100%/);
  assert.match(msg, /20\/07\/2026/);
  assert.match(msg, /Link de participação: https:\/\/www\.livelo\.com\.br\/promo-smiles/);
  assert.match(msg, /Melhores Cartões/);
  const approve = moderationToken(promo.id, "approve", SECRET);
  const reject = moderationToken(promo.id, "reject", SECRET);
  assert.ok(msg.includes(`${BASE}/api/promo-alerts/moderate/${promo.id}?action=approve&token=${approve}`));
  assert.ok(msg.includes(`${BASE}/api/promo-alerts/moderate/${promo.id}?action=reject&token=${reject}`));
});

test("campos opcionais ausentes não quebram nem deixam 'undefined' no texto", () => {
  const msg = buildPromoModerationMessage(
    { id: "abc", category: "miles", title: "Compra de milhas com desconto", source_links: [] },
    { apiBaseUrl: BASE, secret: SECRET },
  );
  assert.match(msg, /Compra de milhas com desconto/);
  assert.match(msg, /SEM link de participação/);
  assert.doesNotMatch(msg, /undefined/);
  assert.doesNotMatch(msg, /null/);
});

test("milheiro efetivo entra no card com valor pt-BR e nota (moderador valida o número)", () => {
  const msg = buildPromoModerationMessage(
    { ...promo, milheiro_cost: 15.58, milheiro_note: "Carrinho Esfera + transferência com 70%" },
    { apiBaseUrl: BASE, secret: SECRET },
  );
  assert.match(msg, /💰 Milheiro: R\$ 15,58 — Carrinho Esfera \+ transferência com 70%/);
});

test("milheiro sem nota mostra só o valor; sem milheiro não há linha", () => {
  const comCusto = buildPromoModerationMessage(
    { ...promo, milheiro_cost: "13.44" },
    { apiBaseUrl: BASE, secret: SECRET },
  );
  assert.match(comCusto, /💰 Milheiro: R\$ 13,44/);
  const sem = buildPromoModerationMessage(promo, { apiBaseUrl: BASE, secret: SECRET });
  assert.doesNotMatch(sem, /Milheiro/);
});
