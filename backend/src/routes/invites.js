import { Router } from "express";
import { createSupabaseAdmin } from "../lib/supabaseAdmin.js";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { sendTransactionalEmail } from "../lib/brevo.js";
import { templateConviteClienteGestao, templateConviteAceito, templateBoasVindas } from "../lib/emailTemplates.js";
import { generateUrlToken, hashToken } from "../lib/tokens.js";

const router = Router();

const appUrl = () => (process.env.PUBLIC_APP_URL || "http://localhost:3080").replace(/\/$/, "");

/** GET /api/invites/preview?token= — público: valida token e devolve e-mail mascarado (para UI) */
router.get("/preview", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ error: "token obrigatório" });

    const admin = createSupabaseAdmin();
    if (!admin) return res.status(503).json({ error: "Servidor indisponível" });

    const { data, error } = await admin
      .from("convites_cliente_gestao")
      .select("email, equipe_id, expires_at, consumed_at")
      .eq("token_hash", hashToken(token))
      .maybeSingle();

    if (error || !data || data.consumed_at || new Date(data.expires_at) < new Date()) {
      return res.status(404).json({ error: "Convite inválido ou expirado" });
    }

    const [u, dom] = data.email.split("@");
    const masked = `${u.slice(0, 2)}***@${dom}`;
    return res.json({ email: data.email, emailMasked: masked, equipe_id: data.equipe_id });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** POST /api/invites/convidar — gestor envia convite */
router.post("/convidar", requireAuth, async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "E-mail inválido" });
    }

    const supabase = createSupabaseWithAuth(req.accessToken);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return res.status(401).json({ error: "Não autenticado" });

    const { data: perfil, error: pe } = await supabase
      .from("perfis")
      .select("role, equipe_id, nome_completo")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (pe || !perfil?.role || !["gestor", "admin", "cs"].includes(perfil.role)) {
      return res.status(403).json({ error: "Apenas gestores ou equipa podem convidar" });
    }

    const admin = createSupabaseAdmin();
    if (!admin) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada" });

    const rawToken = generateUrlToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const { error: ins } = await admin.from("convites_cliente_gestao").insert({
      token_hash: tokenHash,
      email,
      equipe_id: perfil.equipe_id ?? null,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    });
    if (ins) {
      console.error(ins);
      return res.status(400).json({ error: ins.message });
    }

    const link = `${appUrl()}/auth/accept-invite?token=${encodeURIComponent(rawToken)}`;
    const html = templateConviteClienteGestao({
      nomeConvidado: "",
      nomeGestor: perfil.nome_completo || user.email,
      linkAceitar: link,
    });

    await sendTransactionalEmail({
      toEmail: email,
      subject: "Convite — Gest Miles (cliente gestão)",
      htmlContent: html,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Erro ao convidar" });
  }
});

/** POST /api/invites/accept — utilizador autenticado aceita convite (após signup) */
router.post("/accept", requireAuth, async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "token obrigatório" });

    const supabase = createSupabaseWithAuth(req.accessToken);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id || !user.email) return res.status(401).json({ error: "Não autenticado" });

    const admin = createSupabaseAdmin();
    if (!admin) return res.status(503).json({ error: "Servidor indisponível" });

    const tokenHash = hashToken(token);
    const { data: inv, error: ie } = await admin
      .from("convites_cliente_gestao")
      .select("id, email, equipe_id, expires_at, consumed_at, invited_by")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (ie || !inv || inv.consumed_at || new Date(inv.expires_at) < new Date()) {
      return res.status(400).json({ error: "Convite inválido ou expirado" });
    }
    if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
      return res.status(400).json({ error: "Este convite é para outro e-mail" });
    }

    const { error: up } = await admin
      .from("perfis")
      .update({
        role: "cliente_gestao",
        equipe_id: inv.equipe_id,
      })
      .eq("usuario_id", user.id);

    if (up) {
      console.error(up);
      return res.status(500).json({ error: "Erro ao atualizar perfil" });
    }

    await admin
      .from("convites_cliente_gestao")
      .update({ consumed_at: new Date().toISOString(), consumed_by: user.id })
      .eq("id", inv.id);

    const gestorId = inv.invited_by;
    if (gestorId) {
      const { error: gcErr } = await admin.from("gestor_clientes").upsert(
        { gestor_id: gestorId, cliente_id: user.id },
        { onConflict: "cliente_id" }
      );
      if (gcErr) console.warn("gestor_clientes:", gcErr.message);
    }

    const { data: gp } = await admin.from("perfis").select("nome_completo").eq("usuario_id", gestorId).maybeSingle();
    if (gestorId && user.email) {
      try {
        const html = templateConviteAceito({
          nomeGestor: gp?.nome_completo,
          emailNovoUsuario: user.email,
        });
        const { data: gu } = await admin.auth.admin.getUserById(gestorId);
        const gEmail = gu?.user?.email;
        if (gEmail) {
          await sendTransactionalEmail({
            toEmail: gEmail,
            subject: "Convite aceite — Gest Miles",
            htmlContent: html,
          });
        }
      } catch (e) {
        console.warn("email gestor convite aceito:", e.message);
      }
    }

    return res.json({ ok: true, role: "cliente_gestao" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Erro ao aceitar convite" });
  }
});

/** POST /api/invites/welcome — envia boas-vindas uma vez (sessão) */
router.post("/welcome", requireAuth, async (req, res) => {
  try {
    const supabase = createSupabaseWithAuth(req.accessToken);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return res.status(401).json({ error: "Não autenticado" });

    const admin = createSupabaseAdmin();
    if (!admin) return res.status(503).json({ error: "Servidor indisponível" });

    const { data: p } = await admin.from("perfis").select("email_boas_vindas_enviado_at, nome_completo").eq("usuario_id", user.id).maybeSingle();
    if (p?.email_boas_vindas_enviado_at) {
      return res.json({ ok: true, skipped: true });
    }

    if (!user.email) return res.status(400).json({ error: "Sem e-mail" });

    const html = templateBoasVindas({ nome: p?.nome_completo, appUrl: appUrl() });
    await sendTransactionalEmail({
      toEmail: user.email,
      subject: "Bem-vindo ao Gest Miles",
      htmlContent: html,
    });

    await admin.from("perfis").update({ email_boas_vindas_enviado_at: new Date().toISOString() }).eq("usuario_id", user.id);

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
