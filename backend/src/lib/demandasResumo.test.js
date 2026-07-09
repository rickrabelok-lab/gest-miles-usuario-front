import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemandasResumo } from "./demandasResumo.js";

// Agregação por equipe do resumo diário (workflow gm-resumo-demandas).
// `agora` é injetado pra tornar as janelas de 24h/3d determinísticas.

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
    ...extra,
  };
}

test("agrupa por equipe e calcula as 4 contagens", () => {
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

test("concluída recente conta em novas_24h mas não entra na lista de demandas", () => {
  const rows = [linha({ id: 9, status: "concluida", created_at: h(3), updated_at: h(1) })];
  const out = buildDemandasResumo(rows, { agora: AGORA });
  assert.equal(out.equipes[0].contagens.novas_24h, 1);
  assert.equal(out.equipes[0].contagens.pendentes, 0);
  assert.deepEqual(out.equipes[0].demandas, []);
});

test("resumo_curto: emissão vira rota; outros vira categoria; fallbacks sem null", () => {
  const rows = [
    linha({ id: 1 }),
    linha({ id: 2, tipo: "outros", payload: { categoria: "hotel" } }),
    linha({ id: 3, tipo: "outros", payload: {} }),
    linha({ id: 4, payload: {} }),
  ];
  const out = buildDemandasResumo(rows, { agora: AGORA });
  const curtos = out.equipes[0].demandas.map((d) => d.resumo_curto).sort();
  assert.deepEqual(curtos, ["GRU → LIS", "emissão", "hotel", "outros"]);
});

test("demandas ordenadas por dias_parada desc e equipe_id null agrupa junto", () => {
  const rows = [
    linha({ id: 1, equipe_id: null, updated_at: h(1) }),
    linha({ id: 2, equipe_id: null, updated_at: h(120) }),
  ];
  const out = buildDemandasResumo(rows, { agora: AGORA });
  assert.equal(out.equipes.length, 1);
  assert.equal(out.equipes[0].equipe_id, null);
  assert.deepEqual(out.equipes[0].demandas.map((d) => d.id), [2, 1]);
  assert.equal(out.equipes[0].demandas[0].dias_parada, 5);
});
