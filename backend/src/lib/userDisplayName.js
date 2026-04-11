/** Escapa texto para HTML em e-mails transacionais. */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Primeiro nome para saudação em e-mails (perfis.nome_completo, depois user_metadata).
 * @returns {Promise<string|null>}
 */
export async function getPrimeiroNomeCliente(admin, userId) {
  const { data: perfil } = await admin.from("perfis").select("nome_completo").eq("usuario_id", userId).maybeSingle();
  const full = perfil?.nome_completo?.trim();
  if (full) {
    const first = full.split(/\s+/)[0];
    if (first) return escapeHtml(first);
  }
  const { data: authData, error } = await admin.auth.admin.getUserById(userId);
  if (error || !authData?.user) return null;
  const meta = authData.user.user_metadata || {};
  const raw = meta.full_name || meta.name || meta.given_name;
  if (typeof raw === "string" && raw.trim()) {
    const first = raw.trim().split(/\s+/)[0];
    if (first) return escapeHtml(first);
  }
  return null;
}
