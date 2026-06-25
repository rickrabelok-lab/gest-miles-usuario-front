// Allowlist de campos graváveis de `demandas_cliente`. Defense-in-depth: mesmo com
// RLS bloqueando cross-tenant (using + with_check em cliente_id), o BFF não deve dar
// spread cego de req.body num INSERT/UPDATE — isso deixaria um cliente setar colunas
// que não são dele (id/created_at/updated_at) ou campos futuros sensíveis. Aqui só
// passam as colunas de negócio; o resto é descartado silenciosamente.
const INSERT_FIELDS = ["cliente_id", "tipo", "status", "payload", "target_gestor_id", "sub_status"];
const UPDATE_FIELDS = ["tipo", "status", "payload", "target_gestor_id", "sub_status"];

function pick(body, fields) {
  const out = {};
  if (body && typeof body === "object" && !Array.isArray(body)) {
    for (const field of fields) {
      if (field in body && body[field] !== undefined) out[field] = body[field];
    }
  }
  return out;
}

/**
 * Monta o payload de INSERT a partir do corpo da request, só com colunas permitidas.
 * `cliente_id` cai para o id do usuário autenticado quando ausente (RLS confirma o resto).
 */
export function buildDemandaInsert(body, userId) {
  const picked = pick(body, INSERT_FIELDS);
  picked.cliente_id = picked.cliente_id ?? userId;
  return picked;
}

/** Monta o payload de UPDATE só com colunas mutáveis de negócio (sem cliente_id/id/timestamps). */
export function buildDemandaUpdate(body) {
  return pick(body, UPDATE_FIELDS);
}
