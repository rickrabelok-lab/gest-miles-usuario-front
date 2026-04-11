import { getStripe } from "../lib/stripeClient.js";
import { assertSupabaseService } from "../lib/supabaseService.js";

async function syncPerfilFromSubscription(subscription) {
  const sb = assertSupabaseService();
  const sub = subscription;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const usuarioId = sub.metadata?.usuario_id;
  const status = sub.status;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

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
        const usuarioId = session.metadata?.usuario_id;
        if (subId && usuarioId) {
          const subRaw = await stripe.subscriptions.retrieve(subId);
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
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        await syncPerfilFromSubscription(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
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
          await sb
            .from("perfis")
            .update({ subscription_status: "past_due" })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (subscriptionId) {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await syncPerfilFromSubscription(sub);
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
