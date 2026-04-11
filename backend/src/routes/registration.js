import { Router } from "express";
import { createSupabaseAdmin } from "../lib/supabaseAdmin.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = Router();

function normalizeCnpj(c) {
  return String(c || "").replace(/\D/g, "");
}

/** POST /api/registration/check-cnpj — apenas admin (painel / ferramenta interna) */
router.post("/check-cnpj", requireAuth, requireAdmin, async (req, res) => {
  try {
    const digits = normalizeCnpj(req.body?.cnpj);
    if (digits.length < 8) {
      return res.status(400).json({ error: "CNPJ inválido" });
    }

    const admin = createSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: "Servidor sem service role" });
    }

    const { data, error } = await admin
      .from("organizacoes_cliente")
      .select("id")
      .eq("cnpj", digits)
      .maybeSingle();

    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Erro ao verificar" });
    }

    return res.json({ available: !data, cnpj: digits });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/registration/attach-organizacao — apenas admin.
 * Corpo: { cnpj, nomeFantasia, usuarioId } — usuarioId = auth.users.id do perfil a associar à organização.
 */
router.post("/attach-organizacao", requireAuth, requireAdmin, async (req, res) => {
  try {
    const nomeFantasia = String(req.body?.nomeFantasia || "").trim();
    const cnpjDigits = normalizeCnpj(req.body?.cnpj);
    const targetUserId = String(req.body?.usuarioId || "").trim();

    if (cnpjDigits.length < 8 || nomeFantasia.length < 2) {
      return res.status(400).json({ error: "CNPJ e nome da empresa são obrigatórios" });
    }
    if (!/^[0-9a-f-]{36}$/i.test(targetUserId)) {
      return res.status(400).json({ error: "usuarioId (UUID do utilizador) é obrigatório" });
    }

    const admin = createSupabaseAdmin();
    if (!admin) return res.status(503).json({ error: "Servidor indisponível" });

    const { data: existing } = await admin.from("organizacoes_cliente").select("id").eq("cnpj", cnpjDigits).maybeSingle();
    if (existing) {
      return res.status(409).json({
        error: "Já existe uma organização com este CNPJ.",
      });
    }

    const { data: org, error: oe } = await admin
      .from("organizacoes_cliente")
      .insert({
        cnpj: cnpjDigits,
        nome_fantasia: nomeFantasia,
        created_by: req.adminUserId,
      })
      .select("id")
      .single();

    if (oe) {
      console.error(oe);
      return res.status(400).json({ error: oe.message });
    }

    const { error: ue } = await admin
      .from("perfis")
      .update({ organizacao_id: org.id })
      .eq("usuario_id", targetUserId);

    if (ue) {
      console.error(ue);
      return res.status(500).json({ error: "Erro ao associar organização ao utilizador" });
    }

    return res.json({ ok: true, organizacao_id: org.id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
