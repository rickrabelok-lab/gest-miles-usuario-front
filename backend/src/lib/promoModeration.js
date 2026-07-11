import { createHmac, timingSafeEqual } from "node:crypto";

// Links de moderação clicados a partir do WhatsApp: o token amarra (id, ação) ao
// segredo do servidor. Segredo vive SÓ em env do backend — o n8n recebe a
// mensagem pronta (rota /api/agent/promo-message) e nunca vê o segredo.
const ACTIONS = new Set(["approve", "reject"]);

export function moderationToken(id, action, secret) {
  return createHmac("sha256", secret).update(`${id}:${action}`).digest("hex");
}

export function verifyModeration({ id, action, token, secret }) {
  if (!(secret ?? "").trim()) return "missing_env";
  if (!ACTIONS.has(action)) return "bad_action";
  const expected = Buffer.from(moderationToken(id, action, secret));
  const provided = Buffer.from(String(token ?? ""));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return "mismatch";
  }
  return "ok";
}
