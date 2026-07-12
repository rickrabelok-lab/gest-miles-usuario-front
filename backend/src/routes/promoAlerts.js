import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { serverError } from "../lib/httpError.js";
import { verifyModeration } from "../lib/promoModeration.js";

const router = Router();

/** GET /api/promo-alerts — client anon: a RLS entrega só approved + vigente. */
router.get("/", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("promo_alerts")
      .select(
        "id, category, source_program, source_program_id, target_program, title, bonus_value, bonus_numeric, tiers, valid_from, valid_until, details, cta_url, source_links, milheiro_cost, milheiro_note",
      )
      .order("bonus_numeric", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) {
      return serverError(res, "Erro ao listar promoções", error, "[promo-alerts]");
    }
    return res.json(data ?? []);
  } catch (err) {
    return serverError(res, "Erro ao listar promoções", err, "[promo-alerts]");
  }
});

const ACTION_LABEL = { approve: "Aprovar", reject: "Rejeitar" };
const DONE_LABEL = { approve: "aprovada ✅", reject: "rejeitada ❌" };

/** Escapa caracteres HTML especiais para prevenir XSS em valores de banco/request. */
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function page(title, body) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#F7F7F8;color:#1F1F1F;margin:0;padding:24px;text-align:center}button{background:#8A05BE;color:#fff;border:0;border-radius:14px;padding:14px 32px;font-size:16px;font-weight:600;cursor:pointer}</style></head><body><div>${body}</div></body></html>`;
}

/** Valida o link e devolve 401/503 prontos; retorna null quando ok. */
function moderationGate(req, res) {
  const { action, token } = req.query;
  const status = verifyModeration({
    id: req.params.id,
    action,
    token,
    secret: process.env.PROMO_MODERATION_SECRET,
  });
  if (status === "missing_env") {
    res.status(503).send(page("Indisponível", "<p>Moderação não configurada no servidor.</p>"));
    return "handled";
  }
  if (status !== "ok") {
    res.status(401).send(page("Link inválido", "<p>Link de moderação inválido.</p>"));
    return "handled";
  }
  return null;
}

/** GET — só renderiza a confirmação. NUNCA executar aqui (prefetch do WhatsApp). */
router.get("/moderate/:id", (req, res) => {
  if (moderationGate(req, res)) return;
  const { action, token } = req.query;
  const verb = ACTION_LABEL[action];
  // action/token só são ecoados APÓS o verify (action ∈ allowlist, token hex conferido) — sem XSS.
  return res.send(
    page(
      `${verb} promoção`,
      `<h2>${verb} esta promoção?</h2><form method="POST" action="/api/promo-alerts/moderate/${esc(req.params.id)}?action=${action}&token=${token}"><button type="submit">${verb}</button></form>`,
    ),
  );
});

/** POST — executa. Idempotente: reclicar um link já executado só reafirma o estado. */
router.post("/moderate/:id", async (req, res) => {
  if (moderationGate(req, res)) return;
  try {
    const { action } = req.query;
    const status = action === "approve" ? "approved" : "rejected";
    const service = assertSupabaseService();
    const { data, error } = await service
      .from("promo_alerts")
      .update({ status, moderated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .in("status", ["pending", "approved", "rejected"])
      .select("id, title")
      .maybeSingle();
    if (error) {
      return serverError(res, "Erro ao moderar promoção", error, "[promo-alerts]");
    }
    if (!data) {
      return res.status(404).send(page("Não encontrada", "<p>Promoção não encontrada (ou já expirada).</p>"));
    }
    // action e token foram já verificados (action ∈ allowlist, token validado por HMAC) — sem XSS.
    // data.title escapa para prevenir injeção de HTML via valor de banco (LLM-extraído de posts externos).
    return res.send(page("Feito", `<h2>Promoção ${DONE_LABEL[action]}</h2><p>${esc(data.title)}</p>`));
  } catch (err) {
    return serverError(res, "Erro ao moderar promoção", err, "[promo-alerts]");
  }
});

export default router;
