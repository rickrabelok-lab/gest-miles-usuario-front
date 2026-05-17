const SELF_PROFILE_FIELDS = new Set([
  "slug",
  "nome_completo",
  "nome",
  "email",
  "data_nascimento",
  "cpf",
  "numero_telefone",
  "endereco",
  "configuracao_tema",
]);

const BLOCKED_PROFILE_FIELDS = new Set([
  "id",
  "usuario_id",
  "created_at",
  "role",
  "equipe",
  "equipe_id",
  "organizacao_id",
  "email_boas_vindas_enviado_at",
  "stripe_customer_id",
  "stripe_subscription_id",
  "subscription_status",
  "subscription_plan_slug",
  "subscription_current_period_end",
  "cliente_status",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value, maxLength) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function sanitizeSlug(value, fallback) {
  const text = normalizeText(value, 80) ?? fallback;
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

export function buildSelfPerfilPayload(body, user) {
  if (!isPlainObject(body)) {
    const err = new Error("Payload inválido.");
    err.status = 400;
    err.code = "INVALID_PROFILE_PAYLOAD";
    throw err;
  }

  const requestedKeys = Object.keys(body);
  const blocked = requestedKeys.filter((key) => BLOCKED_PROFILE_FIELDS.has(key));
  const unsupported = requestedKeys.filter((key) => !SELF_PROFILE_FIELDS.has(key) && !BLOCKED_PROFILE_FIELDS.has(key));

  if (blocked.length || unsupported.length) {
    const err = new Error("Payload de perfil contém campos não permitidos.");
    err.status = 400;
    err.code = "PROFILE_FIELDS_NOT_ALLOWED";
    err.details = { blocked, unsupported };
    throw err;
  }

  const emailFallback = typeof user.email === "string" ? user.email : "";
  const fallbackSeed = emailFallback.split("@")[0] || user.id.slice(0, 8);
  const slugFallback = sanitizeSlug(fallbackSeed, "usuario-" + user.id.slice(0, 8));
  const payload = {
    usuario_id: user.id,
    role: "cliente_gestao",
    slug: sanitizeSlug(body.slug, slugFallback),
  };

  if ("nome_completo" in body) payload.nome_completo = normalizeText(body.nome_completo, 180);
  if ("nome" in body) payload.nome = normalizeText(body.nome, 180);
  if ("email" in body) payload.email = normalizeText(body.email, 254)?.toLowerCase() ?? null;
  if ("data_nascimento" in body) payload.data_nascimento = normalizeText(body.data_nascimento, 10);
  if ("cpf" in body) payload.cpf = normalizeText(body.cpf, 32);
  if ("numero_telefone" in body) payload.numero_telefone = normalizeText(body.numero_telefone, 32);
  if ("endereco" in body) payload.endereco = normalizeText(body.endereco, 500);
  if ("configuracao_tema" in body) {
    if (!isPlainObject(body.configuracao_tema)) {
      const err = new Error("configuracao_tema deve ser objeto JSON.");
      err.status = 400;
      err.code = "INVALID_PROFILE_CONFIG";
      throw err;
    }
    payload.configuracao_tema = body.configuracao_tema;
  }

  return payload;
}
