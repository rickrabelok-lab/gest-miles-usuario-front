import { Router } from "express";
import { getStripe } from "../lib/stripeClient.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { createSupabaseWithAuth } from "../lib/supabase.js";

const router = Router();

const publicUrl = () =>
  (process.env.PUBLIC_APP_URL || "http://localhost:3080").replace(/\/$/, "");

/** Planos ativos (público — para landing / pricing) */
router.get("/plans", async (_req, res) => {
  try {
    const sb = assertSupabaseService();
    const { data, error } = await sb
      .from("subscription_plans")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ plans: data ?? [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao listar planos." });
  }
});

/** Planos (admin — inclui inativos) */
router.get("/admin/plans", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const sb = assertSupabaseService();
    const { data, error } = await sb
      .from("subscription_plans")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ plans: data ?? [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao listar planos." });
  }
});

/**
 * Cria produto + preços no Stripe e linha em subscription_plans.
 * body: { slug, name, description?, monthlyAmountCents, yearlyAmountCents?, currency?, limits?, sortOrder? }
 */
router.post("/admin/plans", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      slug,
      name,
      description = "",
      monthlyAmountCents,
      yearlyAmountCents,
      currency = "brl",
      limits = {},
      sortOrder = 0,
    } = req.body || {};
    if (!slug || !name || typeof monthlyAmountCents !== "number") {
      return res.status(400).json({
        error: "slug, name e monthlyAmountCents (número, em centavos) são obrigatórios.",
      });
    }

    const stripe = getStripe();
    const product = await stripe.products.create({
      name,
      description: description || undefined,
      metadata: { slug },
    });

    const priceMonthly = await stripe.prices.create({
      product: product.id,
      unit_amount: monthlyAmountCents,
      currency,
      recurring: { interval: "month" },
      metadata: { slug, interval: "month" },
    });

    let priceYearlyId = null;
    if (typeof yearlyAmountCents === "number" && yearlyAmountCents > 0) {
      const priceYearly = await stripe.prices.create({
        product: product.id,
        unit_amount: yearlyAmountCents,
        currency,
        recurring: { interval: "year" },
        metadata: { slug, interval: "year" },
      });
      priceYearlyId = priceYearly.id;
    }

    const sb = assertSupabaseService();
    const { data: inserted, error: insErr } = await sb
      .from("subscription_plans")
      .insert({
        slug,
        name,
        description,
        stripe_product_id: product.id,
        stripe_price_id_monthly: priceMonthly.id,
        stripe_price_id_yearly: priceYearlyId,
        active: true,
        sort_order: sortOrder,
        limits,
      })
      .select()
      .single();

    if (insErr) {
      return res.status(400).json({ error: insErr.message });
    }
    return res.json({ plan: inserted });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao criar plano." });
  }
});

/** Atualiza nome/descrição/ativos/limites; produto Stripe. Preços imutáveis — criar novos valores = novo POST ou endpoint dedicado. */
router.patch("/admin/plans/:slug", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { slug } = req.params;
    const { name, description, active, limits, sortOrder } = req.body || {};
    const sb = assertSupabaseService();
    const { data: row, error: findErr } = await sb
      .from("subscription_plans")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (findErr || !row) {
      return res.status(404).json({ error: "Plano não encontrado." });
    }

    const stripe = getStripe();
    await stripe.products.update(row.stripe_product_id, {
      name: name ?? row.name,
      description: description !== undefined ? description : row.description,
      active: active !== undefined ? active : row.active,
    });

    const patch = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) patch.name = name;
    if (description !== undefined) patch.description = description;
    if (active !== undefined) patch.active = active;
    if (limits !== undefined) patch.limits = limits;
    if (sortOrder !== undefined) patch.sort_order = sortOrder;

    const { data: updated, error: upErr } = await sb
      .from("subscription_plans")
      .update(patch)
      .eq("slug", slug)
      .select()
      .single();
    if (upErr) return res.status(400).json({ error: upErr.message });
    return res.json({ plan: updated });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao atualizar plano." });
  }
});

/**
 * Novo preço mensal/anual (Stripe cria novo Price; desativa o anterior no registo).
 * body: { monthlyAmountCents?, yearlyAmountCents? } — pelo menos um
 */
router.post("/admin/plans/:slug/prices", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { slug } = req.params;
    const { monthlyAmountCents, yearlyAmountCents, currency = "brl" } = req.body || {};
    if (
      typeof monthlyAmountCents !== "number" &&
      typeof yearlyAmountCents !== "number"
    ) {
      return res.status(400).json({ error: "Indique monthlyAmountCents ou yearlyAmountCents." });
    }

    const sb = assertSupabaseService();
    const { data: row, error: findErr } = await sb
      .from("subscription_plans")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (findErr || !row) {
      return res.status(404).json({ error: "Plano não encontrado." });
    }

    const stripe = getStripe();
    const patch = { updated_at: new Date().toISOString() };

    if (typeof monthlyAmountCents === "number") {
      const pm = await stripe.prices.create({
        product: row.stripe_product_id,
        unit_amount: monthlyAmountCents,
        currency,
        recurring: { interval: "month" },
        metadata: { slug, interval: "month" },
      });
      if (row.stripe_price_id_monthly) {
        await stripe.prices.update(row.stripe_price_id_monthly, { active: false });
      }
      patch.stripe_price_id_monthly = pm.id;
    }

    if (typeof yearlyAmountCents === "number") {
      const py = await stripe.prices.create({
        product: row.stripe_product_id,
        unit_amount: yearlyAmountCents,
        currency,
        recurring: { interval: "year" },
        metadata: { slug, interval: "year" },
      });
      if (row.stripe_price_id_yearly) {
        await stripe.prices.update(row.stripe_price_id_yearly, { active: false });
      }
      patch.stripe_price_id_yearly = py.id;
    }

    const { data: updated, error: upErr } = await sb
      .from("subscription_plans")
      .update(patch)
      .eq("slug", slug)
      .select()
      .single();
    if (upErr) return res.status(400).json({ error: upErr.message });
    return res.json({ plan: updated });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao atualizar preços." });
  }
});

/** Listar assinaturas Stripe (admin) */
router.get("/admin/subscriptions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const stripe = getStripe();
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const subs = await stripe.subscriptions.list({ limit, status: "all", expand: ["data.customer"] });
    return res.json({ subscriptions: subs.data });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao listar assinaturas." });
  }
});

router.post("/admin/subscriptions/:subscriptionId/cancel", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const { cancelAtPeriodEnd = true } = req.body || {};
    const stripe = getStripe();
    if (cancelAtPeriodEnd) {
      await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
    } else {
      await stripe.subscriptions.cancel(subscriptionId);
    }
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    return res.json({ subscription: sub });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao cancelar." });
  }
});

router.post("/admin/subscriptions/:subscriptionId/pause", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const stripe = getStripe();
    const sub = await stripe.subscriptions.update(subscriptionId, {
      pause_collection: { behavior: "mark_uncollectible" },
    });
    return res.json({ subscription: sub });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao pausar." });
  }
});

router.post("/admin/subscriptions/:subscriptionId/resume", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { subscriptionId } = req.params;
    const stripe = getStripe();
    const sub = await stripe.subscriptions.update(subscriptionId, {
      pause_collection: null,
    });
    return res.json({ subscription: sub });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao retomar." });
  }
});

/** Estado de assinatura do utilizador autenticado */
router.get("/me", requireAuth, async (req, res) => {
  try {
    const token = req.accessToken;
    const sb = createSupabaseWithAuth(token);
    const {
      data: { user },
      error: uErr,
    } = await sb.auth.getUser();
    if (uErr || !user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }
    const { data: perfil, error: pErr } = await sb
      .from("perfis")
      .select(
        "stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan_slug, subscription_current_period_end",
      )
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (pErr) return res.status(500).json({ error: pErr.message });

    let stripeSubscription = null;
    if (perfil?.stripe_subscription_id) {
      try {
        const stripe = getStripe();
        stripeSubscription = await stripe.subscriptions.retrieve(perfil.stripe_subscription_id);
      } catch {
        stripeSubscription = null;
      }
    }

    return res.json({ perfil, stripeSubscription });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro." });
  }
});

/**
 * Checkout Session — subscrição.
 * body: { priceId: string, planSlug?: string, interval?: 'month'|'year' }
 */
router.post("/checkout-session", requireAuth, async (req, res) => {
  try {
    const { priceId, planSlug, interval = "month" } = req.body || {};
    if (!priceId) {
      return res.status(400).json({ error: "priceId é obrigatório." });
    }
    const token = req.accessToken;
    const sb = createSupabaseWithAuth(token);
    const {
      data: { user },
      error: uErr,
    } = await sb.auth.getUser();
    if (uErr || !user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }

    const stripe = getStripe();
    const sbAdmin = assertSupabaseService();
    const { data: perfil } = await sbAdmin
      .from("perfis")
      .select("stripe_customer_id, nome_completo")
      .eq("usuario_id", user.id)
      .maybeSingle();

    let customerId = perfil?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: perfil?.nome_completo || undefined,
        metadata: { usuario_id: user.id },
      });
      customerId = customer.id;
      await sbAdmin.from("perfis").update({ stripe_customer_id: customerId }).eq("usuario_id", user.id);
    }

    const base = publicUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/?checkout=success`,
      cancel_url: `${base}/?checkout=cancel`,
      client_reference_id: user.id,
      metadata: {
        usuario_id: user.id,
        plan_slug: planSlug || "",
        interval,
      },
      subscription_data: {
        metadata: {
          usuario_id: user.id,
          plan_slug: planSlug || "",
        },
      },
    });

    return res.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao criar checkout." });
  }
});

/** Portal de faturação Stripe */
router.post("/billing-portal", requireAuth, async (req, res) => {
  try {
    const token = req.accessToken;
    const sb = createSupabaseWithAuth(token);
    const {
      data: { user },
      error: uErr,
    } = await sb.auth.getUser();
    if (uErr || !user) {
      return res.status(401).json({ error: "Sessão inválida." });
    }
    const sbAdmin = assertSupabaseService();
    const { data: perfil } = await sbAdmin
      .from("perfis")
      .select("stripe_customer_id")
      .eq("usuario_id", user.id)
      .maybeSingle();

    if (!perfil?.stripe_customer_id) {
      return res.status(400).json({ error: "Cliente Stripe ainda não criado. Subscreva um plano primeiro." });
    }

    const stripe = getStripe();
    const base = publicUrl();
    const session = await stripe.billingPortal.sessions.create({
      customer: perfil.stripe_customer_id,
      return_url: `${base}/`,
    });
    return res.json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao abrir portal." });
  }
});

export default router;
