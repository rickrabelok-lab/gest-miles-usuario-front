/**
 * Resolve auth.users id por e-mail (service role).
 * 1) RPC get_user_id_by_email_for_service — rápido quando a migration está aplicada.
 * 2) Fallback: auth.admin.listUsers (evita 500 se a função SQL ainda não existir no projeto).
 */
export async function getUserIdByEmail(admin, email) {
  const normalized = String(email).trim().toLowerCase();

  const { data: uidFromRpc, error: rpcErr } = await admin.rpc("get_user_id_by_email_for_service", {
    p_email: normalized,
  });

  if (!rpcErr && uidFromRpc) {
    return { userId: uidFromRpc, error: null };
  }
  if (!rpcErr && !uidFromRpc) {
    return { userId: null, error: null };
  }

  console.warn(
    "[auth] get_user_id_by_email_for_service:",
    rpcErr?.message || rpcErr,
    "— a usar listUsers como fallback.",
  );

  let page = 1;
  const perPage = 1000;
  const maxPages = 50;

  while (page <= maxPages) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return { userId: null, error };
    }
    const user = data.users.find((u) => (u.email || "").toLowerCase() === normalized);
    if (user) {
      return { userId: user.id, error: null };
    }
    if (data.users.length < perPage) {
      break;
    }
    page += 1;
  }

  return { userId: null, error: null };
}
