/**
 * Edge Function: concluir reset de senha (valida token + auth.admin.updateUserById).
 * Deploy: supabase functions deploy confirm-password-reset --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const { token, password } = await req.json();
    const raw = String(token || "").trim();
    const pwd = String(password || "");
    if (!raw || pwd.length < 6) {
      return new Response(JSON.stringify({ error: "Token e senha (mín. 6) obrigatórios" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    const tokenHash = await sha256Hex(raw);
    const { data: row, error: fe } = await admin
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, consumed_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (fe || !row || row.consumed_at || new Date(row.expires_at as string) < new Date()) {
      return new Response(JSON.stringify({ error: "Token inválido ou expirado" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { error: authErr } = await admin.auth.admin.updateUserById(row.user_id as string, { password: pwd });
    if (authErr) throw authErr;

    await admin.from("password_reset_tokens").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
