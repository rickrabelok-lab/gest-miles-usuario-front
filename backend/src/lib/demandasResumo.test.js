import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemandasResumo } from "./demandasResumo.js";

// Agregação por equipe + dupla do resumo diário (workflow gm-resumo-demandas).
// Só contagens, sem lista de demandas (pedido do owner). `agora` é injetado
// pra tornar as janelas de 24h/3d determinísticas.

const AGORA = new Date("2026-07-09T11:30:00Z");
const h = (horas) => new Date(AGORA.getTime() - horas * 3_600_000).toISOString();

function linha(extra) {
  return {
    id: 1,
    cliente_id: "c1",
    tipo: "emissao",
    status: "pendente",
    payload: { origem: "GRU", destino: "LIS" },
    created_at: h(2),
    updated_at: h(2),
    cliente_nome: "João",
    equipe_id: "eq-1",
    dupla_id: "d-1",
    dupla_nome: "Equipe 1 - A + B",
    ...extra,
  };
}

test("agrupa por equipe e calcula as 4 contagens totais", () => {
  const rows = [
    linha({ id: 1, created_at: h(2), updated_at: h(2) }), // nova + pendente
    linha({ id: 2, status: "em_andamento", created_at: h(30), updated_at: h(30) }),
    linha({ id: 3, status: "pendente", created_at: h(100), updated_at: h(100) }), // parada 3d+
    linha({ id: 4, equipe_id: "eq-2", created_at: h(1), updated_at: h(1) }),
  ];
  const out = buildDemandasResumo(rows, { agora: AGORA });
  assert.equal(out.equipes.length, 2);
  const eq1 = out.equipes.find((e) => e.equipe_id === "eq-1");
  assert.deepEqual(eq1.contagens, { novas_24h: 1, pendentes: 2, em_andamento: 1, paradas_3d: 1 });
  const eq2 = out.equipes.find((e) => e.equipe_id === "eq-2");
  assert.deepEqual(eq2.contagens, { novas_24h: 1, pendentes: 1, em_andamento: 0, paradas_3d: 0 });
});

test("agrupa por dupla dentro da equipe, com as mesmas contagens", () => {
  const rows = [
    linha({ id: 1, dupla_id: "d-1", dupla_nome: "Equipe 1 - A + B" }),
    linha({ id: 2, dupla_id: "d-1", dupla_nome: "Equipe 1 - A + B", status: "em_andamento", created_at: h(30), updated_at: h(100) }),
    linha({ id: 3, dupla_id: "d-2", dupla_nome: "Equipe 2 - C + D", status: "pendente", created_at: h(100), updated_at: h(100) }),
  ];
  const out = buildDemandasResumo(rows, { agora: AGORA });
  const eq = out.equipes[0];
  assert.equal(eq.duplas.length, 2);
  const d1 = eq.duplas.find((d) => d.dupla_id === "d-1");
  assert.deepEqual(d1.contagens, { novas_24h: 1, pendentes: 1, em_andamento: 1, paradas_3d: 1 });
  const d2 = eq.duplas.find((d) => d.dupla_id === "d-2");
  assert.deepEqual(d2.contagens, { novas_24h: 0, pendentes: 1, em_andamento: 0, paradas_3d: 1 });
  // soma das duplas = total da equipe
  assert.deepEqual(eq.contagens, { novas_24h: 1, pendentes: 2, em_andamento: 1, paradas_3d: 2 });
});

test("cliente sem dupla vai pro bucket null, sempre por último; duplas em ordem de nome", () => {
  const rows = [
    linha({ id: 1, dupla_id: null, dupla_nome: null }),
    linha({ id: 2, dupla_id: "d-9", dupla_nome: "Zulu" }),
    linha({ id: 3, dupla_id: "d-2", dupla_nome: "Alfa" }),
  ];
  const out = buildDemandasResumo(rows, { agora: AGORA });
  const nomes = out.equipes[0].duplas.map((d) => d.dupla_nome);
  assert.deepEqual(nomes, ["Alfa", "Zulu", null]);
  assert.equal(out.equipes[0].duplas.at(-1).dupla_id, null);
});

test("concluída recente conta em novas_24h (equipe e dupla) mas não nas ativas", () => {
  const rows = [linha({ id: 9, status: "concluida", created_at: h(3), updated_at: h(1) })];
  const out = buildDemandasResumo(rows, { agora: AGORA });
  const eq = out.equipes[0];
  assert.deepEqual(eq.contagens, { novas_24h: 1, pendentes: 0, em_andamento: 0, paradas_3d: 0 });
  assert.deepEqual(eq.duplas[0].contagens, { novas_24h: 1, pendentes: 0, em_andamento: 0, paradas_3d: 0 });
});

test("saída não carrega lista de demandas individuais", () => {
  const out = buildDemandasResumo([linha({})], { agora: AGORA });
  assert.equal(out.equipes[0].demandas, undefined);
});
