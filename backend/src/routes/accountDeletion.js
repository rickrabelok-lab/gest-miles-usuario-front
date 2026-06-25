import { Router } from "express";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireUser } from "../middleware/requireUser.js";
import { sendEmail, mailerConfigured } from "../lib/mailer.js";
import { serverError, publicError } from "../lib/httpError.js";
import {
  GRACE_DAYS,
  isDeletionEligibleRole,
  decideRequestAction,
  buildDeletionRequestRow,
} from "../lib/accountDeletionService.js";

const router = Router();
const PRIVACY_EMAIL = process.env.PRIVACY_CONTACT_EMAIL || "privacidade@gestmiles.com.br";

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** POST /api/account/deletion-request — registra a solicitação (carência) + e-mails. */
router.post("/deletion-request", requireUser, async (req, res) => {
  try {
    const user = req.user;
    const sb = assertSupabaseService();

    const { data: perfil } = await sb
      .from("perfis")
      .select("role, email")
      .eq("usuario_id", user.id)
      .maybeSingle();

    if (!isDeletionEligibleRole(perfil?.role)) {
      return publicError(
        res,
        403,
        "Este tipo de conta não pode ser excluído por aqui. Fale com seu gestor ou escreva para privacidade@gestmiles.com.br.",
        null,
        "[accountDeletion]",
      );
    }

    const { data: existing } = await sb
      .from("conta_exclusao_solicitacoes")
      .select("status, agendado_para")
      .eq("usuario_id", user.id)
      .maybeSingle();

    if (decideRequestAction(existing) === "return-existing") {
      return res.json({ status: "pendente", agendado_para: existing.agendado_para });
    }

    const email = (perfil?.email || user.email || "").trim() || null;
    const row = buildDeletionRequestRow({ userId: user.id, email, nowMs: Date.now(), graceDays: GRACE_DAYS });

    const { data: saved, error: upErr } = await sb
      .from("conta_exclusao_solicitacoes")
      .upsert(row, { onConflict: "usuario_id" })
      .select("status, agendado_para")
      .single();
    if (upErr) {
      return serverError(res, "Não foi possível registrar a solicitação.", upErr, "[accountDeletion]");
    }

    // E-mails best-effort: nunca derrubam a solicitação (já gravada).
    try {
      if (mailerConfigured()) {
        const dataFmt = new Date(saved.agendado_para).toLocaleDateString("pt-BR");
        await sendEmail({
          to: PRIVACY_EMAIL,
          subject: "Solicitação de exclusão de conta (LGPD)",
          html: `<p>O usuário <strong>${escapeHtml(email || user.id)}</strong> (id ${escapeHtml(user.id)}) solicitou a exclusão da conta.</p><p>Agendada para <strong>${escapeHtml(dataFmt)}</strong>. Processar via runbook (docs/account-deletion-runbook.md).</p>`,
        });
        if (email) {
          await sendEmail({
            to: email,
            subject: "Recebemos sua solicitação de exclusão de conta",
            html: `<p>Recebemos seu pedido para excluir sua conta da Gest Miles.</p><p>Ela será excluída em <strong>${escapeHtml(dataFmt)}</strong>. Se mudar de ideia, entre no app e clique em "Cancelar exclusão" antes dessa data.</p>`,
          });
        }
      } else {
        console.warn("[accountDeletion] e-mail não configurado; solicitação registrada sem envio.");
      }
    } catch (mailErr) {
      console.warn("[accountDeletion] e-mail falhou:", mailErr?.message ?? mailErr);
    }

    return res.json({ status: saved.status, agendado_para: saved.agendado_para });
  } catch (err) {
    return serverError(res, "Erro ao solicitar exclusão.", err, "[accountDeletion]");
  }
});

/** POST /api/account/deletion-request/cancel — cancela a própria solicitação pendente. */
router.post("/deletion-request/cancel", requireUser, async (req, res) => {
  try {
    const user = req.user;
    const sb = assertSupabaseService();
    const { data: updated, error } = await sb
      .from("conta_exclusao_solicitacoes")
      .update({ status: "cancelada", cancelado_em: new Date().toISOString() })
      .eq("usuario_id", user.id)
      .eq("status", "pendente")
      .select("status")
      .maybeSingle();
    if (error) {
      return serverError(res, "Não foi possível cancelar a solicitação.", error, "[accountDeletion]");
    }
    return res.json({ status: updated?.status ?? "sem_pendente" });
  } catch (err) {
    return serverError(res, "Erro ao cancelar exclusão.", err, "[accountDeletion]");
  }
});

export default router;
