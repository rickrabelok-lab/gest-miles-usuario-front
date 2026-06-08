import { getStripe } from "../lib/stripeClient.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { resolvePeriodStart } from "../lib/billingHelpers.js";

/**
 * Reconcile diário do billing B2B. Autenticação:
 * - Vercel Cron envia `Authorization: Bearer <CRON_SECRET>` (quando CRON_SECRET está no env).
 * - Fallback `x-cron-secret: <CRON_SECRET>` para disparo manual (curl/scheduler externo).
 */
export async function reconcileEquipeBilling(req, res) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers["authorization"] || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const provided = bearer ?? req.headers["x-cron-secret"];
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: "não autorizado" });
  }
  const sb = assertSupabaseService();
  const stripe = getStripe();
  const { data: equipes } = await sb.from("equipes")
    .select("id, stripe_subscription_id, subscription_plan_slug")
    .in("subscription_status", ["trialing", "active", "past_due"]);
  let synced = 0;
  for (const eq of equipes ?? []) {
    if (!eq.stripe_subscription_id) continue;
    try {
      const sub = await stripe.subscriptions.retrieve(eq.stripe_subscription_id);
      const periodStart = resolvePeriodStart(sub);
      const { data: plan } = await sb.from("subscription_plans").select("stripe_per_client_price_id").eq("slug", eq.subscription_plan_slug).maybeSingle();
      const item = sub.items?.data?.find((it) => it.price?.id === plan?.stripe_per_client_price_id);
      // virada de ciclo: limpa o conjunto faturável de períodos anteriores
      await sb.from("equipe_ciclo_faturavel").delete().eq("equipe_id", eq.id).neq("period_start", periodStart);
      // qty alvo = nº de ativos atuais
      const { count } = await sb.from("perfis").select("usuario_id", { count: "exact", head: true }).eq("equipe_id", eq.id).eq("plano_ativo", true);
      const target = count || 0;
      if (item && item.quantity !== target && target > 0) {
        await stripe.subscriptionItems.update(item.id, { quantity: target, proration_behavior: "none" });
      }
      synced++;
    } catch { /* erros por equipe não param o loop; Sentry captura via error-handler global se relançar */ }
  }
  return res.json({ ok: true, synced });
}
