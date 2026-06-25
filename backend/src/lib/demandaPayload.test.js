import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemandaInsert, buildDemandaUpdate } from "./demandaPayload.js";

// Allowlist de demandas_cliente — defense-in-depth contra spread cego de req.body.

test("buildDemandaInsert: mantém só colunas de negócio e descarta o resto", () => {
  const out = buildDemandaInsert(
    {
      cliente_id: "cli-1",
      tipo: "emissao",
      status: "pendente",
      payload: { rota: "GRU-LIS" },
      target_gestor_id: "g-1",
      sub_status: "novo",
      // Lixo/colunas auto que NÃO podem ser setadas pelo cliente:
      id: 999,
      created_at: "2020-01-01",
      updated_at: "2020-01-01",
      hacker_field: true,
    },
    "user-fallback",
  );
  assert.deepEqual(out, {
    cliente_id: "cli-1",
    tipo: "emissao",
    status: "pendente",
    payload: { rota: "GRU-LIS" },
    target_gestor_id: "g-1",
    sub_status: "novo",
  });
});

test("buildDemandaInsert: cliente_id cai para o usuário autenticado quando ausente", () => {
  const out = buildDemandaInsert({ tipo: "outros" }, "user-7");
  assert.equal(out.cliente_id, "user-7");
  assert.equal(out.tipo, "outros");
});

test("buildDemandaInsert: corpo inválido vira só o cliente_id do usuário", () => {
  assert.deepEqual(buildDemandaInsert(null, "user-7"), { cliente_id: "user-7" });
  assert.deepEqual(buildDemandaInsert([], "user-7"), { cliente_id: "user-7" });
});

test("buildDemandaUpdate: só campos mutáveis; nunca cliente_id/id/timestamps", () => {
  const out = buildDemandaUpdate({
    status: "concluido",
    payload: { ok: true },
    sub_status: "fechado",
    tipo: "emissao",
    target_gestor_id: "g-2",
    cliente_id: "tentativa-de-trocar-dono",
    id: 1,
    created_at: "2020-01-01",
    updated_at: "2020-01-01",
  });
  assert.deepEqual(out, {
    tipo: "emissao",
    status: "concluido",
    payload: { ok: true },
    target_gestor_id: "g-2",
    sub_status: "fechado",
  });
  assert.equal("cliente_id" in out, false);
  assert.equal("id" in out, false);
});

test("buildDemandaUpdate: corpo sem campos válidos retorna objeto vazio", () => {
  assert.deepEqual(buildDemandaUpdate({ id: 1, foo: "bar" }), {});
  assert.deepEqual(buildDemandaUpdate(null), {});
});
