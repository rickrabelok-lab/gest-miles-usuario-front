import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeNome, matchGroupsToClients, planOnboarding } from "./groupClientMatch.js";

test("normalizeNome: acento, pontuação, espaços", () => {
  assert.equal(normalizeNome("Fulano Silva - Gestão!"), "fulano silva gestao");
  assert.equal(normalizeNome("  ÁÉÍ  óç  "), "aei oc");
  assert.equal(normalizeNome(null), "");
});

test("match: nome contido com borda de palavra", () => {
  const clients = [
    { cliente_id: "a", nome: "Fulano Silva" },
    { cliente_id: "b", nome: "Ana" },
  ];
  const r = matchGroupsToClients(
    [
      { jid: "g1", nome: "Fulano Silva - GestMiles" },
      { jid: "g2", nome: "Analeide Souza" }, // NÃO casa "Ana" (borda de palavra)
    ],
    clients,
  );
  assert.deepEqual(r[0].candidatos.map((c) => c.cliente_id), ["a"]);
  assert.deepEqual(r[1].candidatos, []);
});

test("planOnboarding: único auto-mapeia, 0/>1 vai pra revisar, jaMapeados", () => {
  const clients = [
    { cliente_id: "a", nome: "Fulano Silva" },
    { cliente_id: "b", nome: "Fulano" }, // contido em "Fulano Silva ..." => ambiguidade
  ];
  const groups = [
    { jid: "g1", nome: "Fulano Silva - GestMiles" }, // casa a e b => revisar
    { jid: "g2", nome: "Beltrano Souza" }, // 0 => revisar
    { jid: "g3", nome: "Fulano Silva já mapeado" },
  ];
  const plan = planOnboarding(groups, clients, ["g3"]);
  assert.equal(plan.descobertos, 3);
  assert.equal(plan.jaMapeados, 1);
  assert.equal(plan.autoMap.length, 0);
  assert.equal(plan.revisar.length, 2);
});

test("planOnboarding: match único auto-mapeia", () => {
  const plan = planOnboarding(
    [{ jid: "g1", nome: "Fulano Silva - GestMiles" }],
    [{ cliente_id: "a", nome: "Fulano Silva" }],
  );
  assert.equal(plan.autoMap.length, 1);
  assert.equal(plan.autoMap[0].cliente_id, "a");
});
