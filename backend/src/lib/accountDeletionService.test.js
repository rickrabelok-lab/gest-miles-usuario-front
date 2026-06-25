import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GRACE_DAYS,
  isDeletionEligibleRole,
  computeScheduledFor,
  decideRequestAction,
  buildDeletionRequestRow,
} from "./accountDeletionService.js";

test("isDeletionEligibleRole: só 'cliente'", () => {
  assert.equal(isDeletionEligibleRole("cliente"), true);
  for (const r of ["cliente_gestao", "gestor", "cs", "admin_equipe", "admin", null, undefined]) {
    assert.equal(isDeletionEligibleRole(r), false);
  }
});

test("computeScheduledFor: now + carência (default 7d)", () => {
  assert.equal(computeScheduledFor(0), "1970-01-08T00:00:00.000Z");
  assert.equal(computeScheduledFor(0, 1), "1970-01-02T00:00:00.000Z");
  assert.equal(GRACE_DAYS, 7);
});

test("decideRequestAction: pendente → return-existing; senão create", () => {
  assert.equal(decideRequestAction({ status: "pendente" }), "return-existing");
  assert.equal(decideRequestAction(null), "create");
  assert.equal(decideRequestAction({ status: "cancelada" }), "create");
  assert.equal(decideRequestAction({ status: "concluida" }), "create");
});

test("buildDeletionRequestRow: shape e agendamento", () => {
  const row = buildDeletionRequestRow({ userId: "u-1", email: "a@b.com", nowMs: 0 });
  assert.equal(row.usuario_id, "u-1");
  assert.equal(row.email, "a@b.com");
  assert.equal(row.status, "pendente");
  assert.equal(row.solicitado_em, "1970-01-01T00:00:00.000Z");
  assert.equal(row.agendado_para, "1970-01-08T00:00:00.000Z");
  assert.equal(row.cancelado_em, null);
  assert.equal(row.processado_em, null);
  // email ausente vira null
  assert.equal(buildDeletionRequestRow({ userId: "u-2", nowMs: 0 }).email, null);
});
