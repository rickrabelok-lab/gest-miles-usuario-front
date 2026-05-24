/**
 * Edge Function: concluir reset de senha (valida token + auth.admin.updateUserById).
 * Deploy: supabase functions deploy confirm-password-reset --no-verify-jwt
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

function getAllowedOrigins(): string[] {
  const appUrl = Deno.env.get("PUBLIC_APP_URL");
  const configured = Deno.env.get("PASSWORD_RESET_ALLOWED_ORIGINS");
  return [appUrl, configured, "http://localhost:3080"]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin")?.replace(/\/$/, "");
  const allowed = getAllowedOrigins();
  const allowOrigin =
    origin && allowed.includes(origin) ? origin : allowed[0] || "";
  return allowOrigin
    ? { ...cors, "Access-Control-Allow-Origin": allowOrigin }
    : cors;
}

async function sha256Hex(token: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { token, password } = await req.json();
    const raw = String(token || "").trim();
    const pwd = String(password || "");
    if (!raw || pwd.length < 6) {
      return new Response(
        JSON.stringify({ error: "Token e senha (mín. 6) obrigatórios" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const tokenHash = await sha256Hex(raw);
    const { data: row, error: fe } = await admin
      .from("password_reset_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("id, user_id")
      .maybeSingle();

    if (fe || !row) {
      return new Response(
        JSON.stringify({ error: "Token inválido ou expirado" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: authErr } = await admin.auth.admin.updateUserById(
      row.user_id as string,
      { password: pwd },
    );
    if (authErr) throw authErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[confirm-password-reset]", e);
    return new Response(
      JSON.stringify({ error: "Não foi possível redefinir a senha agora." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
