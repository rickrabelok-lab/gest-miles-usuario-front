import { getStripe } from "../lib/stripeClient.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { resolvePeriodEnd, resolvePeriodStart, resolveSubscriptionIdFromInvoice, isB2BSubscription } from "../lib/billingHelpers.js";

async function syncPerfilFromSubscription(subscription) {
  const sb = assertSupabaseService();
  const sub = subscription;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const usuarioId = sub.metadata?.usuario_id;
  const status = sub.status;
  const periodEnd = resolvePeriodEnd(sub);

  const priceId = sub.items?.data?.[0]?.price?.id;
  let planSlug = sub.metadata?.plan_slug ?? null;
  if (!planSlug && priceId) {
    const { data: planRow } = await sb
      .from("subscription_plans")
      .select("slug")
      .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
      .maybeSingle();
    planSlug = planRow?.slug ?? null;
  }

  const patch = {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    subscription_status: status,
    subscription_plan_slug: planSlug,
    subscription_current_period_end: periodEnd,
  };

  if (usuarioId) {
    await sb.from("perfis").update(patch).eq("usuario_id", usuarioId);
    return;
  }
  if (customerId) {
    await sb.from("perfis").update(patch).eq("stripe_customer_id", customerId);
  }
}

async function clearSubscriptionForCustomer(customerId) {
  const sb = assertSupabaseService();
  await sb
    .from("perfis")
    .update({
      stripe_subscription_id: null,
      subscription_status: "canceled",
      subscription_current_period_end: null,
    })
    .eq("stripe_customer_id", customerId);
}

/**
 * Sincroniza a tabela `equipes` a partir de uma subscription B2B.
 * Retorna true se era B2B (metadata.equipe_id presente), false caso contrário.
 * Quando false, o caller deve cair no caminho B2C.
 */
async function syncEquipeFromSubscription(subscription) {
  if (!isB2BSubscription(subscription)) return false;
  const sb = assertSupabaseService();
  const equipeId = subscription.metadata.equipe_id;
  const status = subscription.status;
  const graceUntil = status === "past_due"
    ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;
  await sb.from("equipes").update({
    stripe_subscription_id: subscription.id,
    subscription_status: status,
    subscription_plan_slug: subscription.metadata?.plan_slug ?? null,
    subscription_current_period_end: resolvePeriodEnd(subscription),
    trial_ends_at: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    grace_until: graceUntil,
  }).eq("id", equipeId);
  return true;
}

/**
 * Express handler: use com `express.raw({ type: 'application/json' })`.
 */
export async function handleStripeWebhook(req, res) {
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret) {
    return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET não configurada." });
  }

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    const stripe = getStripe();
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (err) {
    console.error("Stripe webhook signature:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") break;
        const stripe = getStripe();
        const subId = session.subscription;
        if (subId) {
          const subRaw = await stripe.subscriptions.retrieve(subId);
          // B2B: rota por metadata.equipe_id (vem da subscription, injetado no checkout)
          if (await syncEquipeFromSubscription(subRaw)) break;
          // B2C: legado — injeta usuario_id do session.metadata
          const usuarioId = session.metadata?.usuario_id;
          if (usuarioId) {
            const merged = {
              ...subRaw,
              metadata: {
                ...(subRaw.metadata || {}),
                usuario_id: usuarioId,
                plan_slug: session.metadata?.plan_slug || subRaw.metadata?.plan_slug || "",
              },
            };
            await syncPerfilFromSubscription(merged);
          }
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        if (await syncEquipeFromSubscription(sub)) break; // B2B
        await syncPerfilFromSubscription(sub);            // B2C
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        if (isB2BSubscription(sub)) {
          // B2B: marca a equipe como cancelada
          const sb = assertSupabaseService();
          await sb.from("equipes").update({
            subscription_status: "canceled",
            subscription_current_period_end: null,
          }).eq("id", sub.metadata.equipe_id);
          break;
        }
        // B2C: legado
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        if (customerId) {
          const sb = assertSupabaseService();
          await sb
            .from("perfis")
            .update({
              stripe_subscription_id: null,
              subscription_status: "canceled",
              subscription_plan_slug: null,
              subscription_current_period_end: null,
            })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          const sb = assertSupabaseService();
          // B2B: verifica se o customer pertence a uma equipe
          const { data: equipe } = await sb.from("equipes").select("id").eq("stripe_customer_id", customerId).maybeSingle();
          if (equipe) {
            await sb.from("equipes").update({
              subscription_status: "past_due",
              grace_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            }).eq("id", equipe.id);
            break;
          }
          // B2C: legado
          await sb.from("perfis").update({ subscription_status: "past_due" }).eq("stripe_customer_id", customerId);
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subscriptionId = resolveSubscriptionIdFromInvoice(invoice);
        if (subscriptionId) {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          if (await syncEquipeFromSubscription(sub)) break; // B2B
          await syncPerfilFromSubscription(sub);            // B2C
        }
        break;
      }
      default:
        break;
    }
    return res.json({ received: true });
  } catch (e) {
    console.error("Stripe webhook handler:", e);
    return res.status(500).json({ error: e.message || "Webhook handler error" });
  }
}
