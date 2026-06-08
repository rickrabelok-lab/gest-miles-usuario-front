import { Router } from "express";
import { getStripe } from "../lib/stripeClient.js";
import { assertSupabaseService } from "../lib/supabaseService.js";
import { createSupabaseWithAuth } from "../lib/supabase.js";
import { requireAuth } from "../middleware/auth.js";
import { resolvePeriodStart } from "../lib/billingHelpers.js";
import { buildCheckoutLineItems, decideQuantitySync } from "../lib/equipeBillingService.js";

const router = Router();
const TRIAL_DAYS = 14;
const managerUrl = () =>
  (process.env.PUBLIC_MANAGER_URL || "http://localhost:3002").replace(/\/$/, "");

/** Planos B2B ativos (público — página de planos). Só os que têm price ids B2B. */
router.get("/plans", async (_req, res) => {
  try {
    const sb = assertSupabaseService();
    const { data, error } = await sb
      .from("subscription_plans")
      .select("*")
      .eq("active", true)
      .not("stripe_base_price_id", "is", null)
      .order("sort_order", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ plans: data ?? [] });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao listar planos." });
  }
});

// --- helpers internos ---

async function getActor(req) {
  const sbAuth = createSupabaseWithAuth(req.accessToken);
  const { data: { user }, error } = await sbAuth.auth.getUser();
  if (error || !user?.id) return { user: null, perfil: null };
  const sb = assertSupabaseService();
  const { data: perfil } = await sb
    .from("perfis")
    .select("usuario_id, role, equipe_id, nome_completo, email")
    .eq("usuario_id", user.id)
    .maybeSingle();
  return { user, perfil };
}

function isBillingManager(perfil) {
  return perfil?.role === "admin_equipe" && perfil?.equipe_id;
}

async function loadEquipe(sb, equipeId) {
  const { data } = await sb.from("equipes").select("*").eq("id", equipeId).maybeSingle();
  return data;
}

/** Encontra o subscription item do Item B (por-cliente) ou null. */
function findPerClientItem(subscription, perClientPriceId) {
  return subscription?.items?.data?.find((it) => it.price?.id === perClientPriceId) ?? null;
}

// --- endpoints ---

/** Cria a agência (equipe) e promove o usuário atual a admin_equipe. Só se ele NÃO tem equipe. */
router.post("/agency/provision", requireAuth, async (req, res) => {
  try {
    const { user, perfil } = await getActor(req);
    if (!user) return res.status(401).json({ error: "Sessão inválida." });
    if (perfil?.equipe_id) {
      return res.status(409).json({ error: "Usuário já pertence a uma equipe.", code: "already_in_team" });
    }
    const nome = String(req.body?.nomeAgencia || "").trim();
    if (!nome) return res.status(400).json({ error: "nomeAgencia é obrigatório." });

    // Garante que o perfil do usuário existe ANTES de promover. O signup do funil B2B
    // pode não ter criado o perfil (ele nasce no /me do app cliente). ensure_self_cliente_profile
    // é idempotente e roda como o usuário (auth.uid()); cria o perfil (role 'cliente') se faltar.
    const emailLocal = String(user.email || "").split("@")[0];
    const slugBase =
      emailLocal.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
        .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `agencia-${user.id.slice(0, 8)}`;
    const sbUser = createSupabaseWithAuth(req.accessToken);
    const { error: ensureErr } = await sbUser.rpc("ensure_self_cliente_profile", {
      p_slug: slugBase,
      p_nome_completo: perfil?.nome_completo || nome || user.email || "Agência",
    });
    if (ensureErr) return res.status(400).json({ error: ensureErr.message });

    const sb = assertSupabaseService();
    const { data: equipe, error: eErr } = await sb
      .from("equipes").insert({ nome }).select("id, nome").single();
    if (eErr) return res.status(400).json({ error: eErr.message });

    const { data: promoted, error: pErr } = await sb
      .from("perfis")
      .update({ role: "admin_equipe", equipe_id: equipe.id })
      .eq("usuario_id", user.id)
      .is("equipe_id", null) // guarda anti-corrida
      .select("usuario_id")
      .maybeSingle();
    if (pErr || !promoted) {
      await sb.from("equipes").delete().eq("id", equipe.id); // evita equipe órfã
      return res.status(pErr ? 400 : 409).json({
        error: pErr?.message || "Não foi possível promover o perfil (já pertence a uma equipe?).",
        code: pErr ? undefined : "promote_failed",
      });
    }

    return res.status(201).json({ equipe });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao provisionar agência." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const { user, perfil } = await getActor(req);
    if (!user) return res.status(401).json({ error: "Sessão inválida." });
    if (!perfil?.equipe_id) return res.json({ equipe: null, subscription: null });
    const sb = assertSupabaseService();
    const equipe = await loadEquipe(sb, perfil.equipe_id);
    let subscription = null;
    if (equipe?.stripe_subscription_id) {
      try { subscription = await getStripe().subscriptions.retrieve(equipe.stripe_subscription_id); }
      catch { subscription = null; }
    }
    return res.json({ equipe, subscription });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro." });
  }
});

router.post("/checkout-session", requireAuth, async (req, res) => {
  try {
    const { user, perfil } = await getActor(req);
    if (!user) return res.status(401).json({ error: "Sessão inválida." });
    if (!isBillingManager(perfil)) return res.status(403).json({ error: "Apenas admin da agência." });

    const planSlug = String(req.body?.planSlug || "").trim();
    if (!planSlug) return res.status(400).json({ error: "planSlug é obrigatório." });

    const sb = assertSupabaseService();
    const { data: plan } = await sb.from("subscription_plans").select("*").eq("slug", planSlug).eq("active", true).maybeSingle();
    if (!plan?.stripe_base_price_id) return res.status(404).json({ error: "Plano B2B não encontrado." });

    const equipe = await loadEquipe(sb, perfil.equipe_id);
    if (["trialing", "active", "past_due"].includes(String(equipe?.subscription_status))) {
      return res.status(409).json({ error: "Equipe já tem assinatura. Use o portal.", code: "already_subscribed" });
    }

    const stripe = getStripe();
    let customerId = equipe?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: equipe?.nome || undefined,
        email: perfil.email || user.email || undefined,
        metadata: { equipe_id: perfil.equipe_id },
      });
      customerId = customer.id;
      await sb.from("equipes").update({ stripe_customer_id: customerId }).eq("id", perfil.equipe_id);
    }

    // qty inicial do Item B = clientes já marcados ativos na equipe (normalmente 0 no 1º checkout).
    const { count } = await sb
      .from("perfis").select("usuario_id", { count: "exact", head: true })
      .eq("equipe_id", perfil.equipe_id).eq("plano_ativo", true);

    const base = managerUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: buildCheckoutLineItems(plan, count || 0),
      subscription_data: { trial_period_days: TRIAL_DAYS, metadata: { equipe_id: perfil.equipe_id, plan_slug: planSlug } },
      metadata: { equipe_id: perfil.equipe_id, plan_slug: planSlug },
      success_url: `${base}/?assinatura=sucesso`,
      cancel_url: `${base}/?assinatura=cancelada`,
    });
    return res.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao criar checkout." });
  }
});

router.post("/portal", requireAuth, async (req, res) => {
  try {
    const { user, perfil } = await getActor(req);
    if (!user) return res.status(401).json({ error: "Sessão inválida." });
    if (!isBillingManager(perfil)) return res.status(403).json({ error: "Apenas admin da agência." });
    const sb = assertSupabaseService();
    const equipe = await loadEquipe(sb, perfil.equipe_id);
    if (!equipe?.stripe_customer_id) return res.status(400).json({ error: "Sem cliente Stripe. Assine primeiro." });
    const session = await getStripe().billingPortal.sessions.create({
      customer: equipe.stripe_customer_id, return_url: `${managerUrl()}/`,
    });
    return res.json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao abrir portal." });
  }
});

router.post("/clients/:clienteId/activate", requireAuth, async (req, res) => {
  try {
    const { user, perfil } = await getActor(req);
    if (!user) return res.status(401).json({ error: "Sessão inválida." });
    if (!isBillingManager(perfil)) return res.status(403).json({ error: "Apenas admin da agência." });
    const clienteId = String(req.params.clienteId || "").trim();
    const sb = assertSupabaseService();

    const { data: cliente } = await sb.from("perfis").select("usuario_id, equipe_id, plano_ativo").eq("usuario_id", clienteId).maybeSingle();
    if (!cliente || cliente.equipe_id !== perfil.equipe_id) return res.status(404).json({ error: "Cliente não encontrado na sua equipe." });

    const equipe = await loadEquipe(sb, perfil.equipe_id);
    if (!equipe?.stripe_subscription_id) return res.status(409).json({ error: "Equipe sem assinatura ativa." });

    const { data: plan } = await sb.from("subscription_plans").select("stripe_per_client_price_id").eq("slug", equipe.subscription_plan_slug).maybeSingle();
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(equipe.stripe_subscription_id);
    const periodStart = resolvePeriodStart(subscription);

    // já contado neste ciclo?
    const { data: cycleRow } = await sb.from("equipe_ciclo_faturavel")
      .select("cliente_id").eq("equipe_id", perfil.equipe_id).eq("period_start", periodStart).eq("cliente_id", clienteId).maybeSingle();
    const alreadyInCycle = !!cycleRow;

    const item = findPerClientItem(subscription, plan?.stripe_per_client_price_id);
    const currentQty = item ? item.quantity : 0;
    const { quantity, prorationBehavior } = decideQuantitySync({ action: "activate", alreadyInCycle, currentQuantity: currentQty });

    if (item) {
      if (quantity !== currentQty) {
        await stripe.subscriptionItems.update(item.id, { quantity, proration_behavior: prorationBehavior });
      }
    } else if (quantity > 0) {
      await stripe.subscriptionItems.create({ subscription: subscription.id, price: plan.stripe_per_client_price_id, quantity, proration_behavior: prorationBehavior });
    }

    await sb.from("perfis").update({ plano_ativo: true, plano_ativado_em: new Date().toISOString(), cliente_status: "ativo" }).eq("usuario_id", clienteId);
    if (!alreadyInCycle) {
      await sb.from("equipe_ciclo_faturavel").insert({ equipe_id: perfil.equipe_id, period_start: periodStart, cliente_id: clienteId });
    }
    return res.json({ ok: true, plano_ativo: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao ativar cliente." });
  }
});

router.post("/clients/:clienteId/deactivate", requireAuth, async (req, res) => {
  try {
    const { user, perfil } = await getActor(req);
    if (!user) return res.status(401).json({ error: "Sessão inválida." });
    if (!isBillingManager(perfil)) return res.status(403).json({ error: "Apenas admin da agência." });
    const clienteId = String(req.params.clienteId || "").trim();
    const sb = assertSupabaseService();
    const { data: cliente } = await sb.from("perfis").select("usuario_id, equipe_id").eq("usuario_id", clienteId).maybeSingle();
    if (!cliente || cliente.equipe_id !== perfil.equipe_id) return res.status(404).json({ error: "Cliente não encontrado na sua equipe." });
    // plano_ativo=false revoga acesso B2C já; a quantidade no Stripe NÃO muda agora (política "ativo no ciclo = cobra o ciclo").
    await sb.from("perfis").update({ plano_ativo: false, plano_desativado_em: new Date().toISOString(), cliente_status: "inativo" }).eq("usuario_id", clienteId);
    return res.json({ ok: true, plano_ativo: false });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erro ao desativar cliente." });
  }
});

export default router;
