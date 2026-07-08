import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Crown, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, getApiUrl, hasApiUrl } from "@/services/api";

/** Recursos liberados no plano pago (gates RequirePaid do app). */
const RECURSOS_PLUS = [
  "Calendário de preços por milheiro",
  "Ofertas de bônus de transferência",
  "Simulador de compra de milhas",
  "Radar de oportunidades personalizado",
];

type PlanRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  active: boolean;
  sort_order: number;
};

type MeResponse = {
  perfil: {
    subscription_status?: string | null;
    subscription_plan_slug?: string | null;
    subscription_current_period_end?: string | null;
    stripe_customer_id?: string | null;
  } | null;
};

function formatSubscriptionError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (
    /failed to fetch|networkerror|load failed|timeout|stripe|checkout|billing|portal|api|backend|env|vite_|supabase|jwt|rls|permission|unauthorized|forbidden|404|500|502|503/i.test(
      message,
    )
  ) {
    console.warn("[AssinaturaCliente] subscription:", error);
    return fallback;
  }

  if (message.trim()) {
    console.warn("[AssinaturaCliente] subscription:", error);
  }
  return fallback;
}

const MANAGED_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

function hasManagedSubscription(status: string | null | undefined): boolean {
  return MANAGED_SUBSCRIPTION_STATUSES.has(String(status ?? "").toLowerCase());
}

/**
 * Página de assinatura para clientes: listar planos públicos, abrir Stripe Checkout
 * e, com assinatura ativa, o portal de cobrança.
 */
const AssinaturaClientePage = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadingMe, setLoadingMe] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    if (!hasApiUrl()) {
      setLoadingPlans(false);
      return;
    }
    setLoadingPlans(true);
    setPlansError(null);
    try {
      const res = await fetch(getApiUrl("/api/stripe/plans"));
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? res.statusText);
      }
      const data = (await res.json()) as { plans: PlanRow[] };
      setPlans(data.plans ?? []);
    } catch (e) {
      setPlansError(
        formatSubscriptionError(
          e,
          "Não conseguimos carregar os planos agora. Tente novamente em instantes.",
        ),
      );
    } finally {
      setLoadingPlans(false);
    }
  }, []);

  const loadMe = useCallback(async () => {
    if (!token || !hasApiUrl()) {
      setMe(null);
      return;
    }
    setLoadingMe(true);
    setMeError(null);
    try {
      const data = await apiFetch<MeResponse>("/api/stripe/me", {
        token,
      });
      setMe(data);
    } catch (e) {
      setMe(null);
      setMeError(
        formatSubscriptionError(
          e,
          "Não conseguimos carregar sua assinatura agora. Tente novamente em instantes.",
        ),
      );
    } finally {
      setLoadingMe(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const checkout = async (plan: PlanRow) => {
    if (!token) {
      setError("Faça login para assinar.");
      return;
    }
    const priceId =
      interval === "year" ? plan.stripe_price_id_yearly : plan.stripe_price_id_monthly;
    if (!priceId) {
      setError(
        interval === "year"
          ? "Este plano não tem preço anual configurado."
          : "Este plano não tem preço mensal configurado.",
      );
      return;
    }
    setBusySlug(plan.slug);
    setError(null);
    try {
      const data = await apiFetch<{ url: string | null }>("/api/stripe/checkout-session", {
        method: "POST",
        token,
        body: JSON.stringify({
          priceId,
          planSlug: plan.slug,
          interval,
        }),
      });
      if (data.url) window.location.href = data.url;
      else setError("Não conseguimos abrir o checkout agora. Tente novamente em instantes.");
    } catch (e) {
      setError(
        formatSubscriptionError(
          e,
          "Não conseguimos abrir o checkout agora. Tente novamente em instantes.",
        ),
      );
    } finally {
      setBusySlug(null);
    }
  };

  const openPortal = async () => {
    if (!token) return;
    setBusySlug("__portal__");
    setError(null);
    try {
      const data = await apiFetch<{ url: string | null }>("/api/stripe/billing-portal", {
        method: "POST",
        token,
        body: JSON.stringify({}),
      });
      if (data.url) window.location.href = data.url;
      else setError("Não conseguimos abrir o portal de cobrança agora. Tente novamente em instantes.");
    } catch (e) {
      setError(
        formatSubscriptionError(
          e,
          "Não conseguimos abrir o portal de cobrança agora. Tente novamente em instantes.",
        ),
      );
    } finally {
      setBusySlug(null);
    }
  };

  if (!hasApiUrl()) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-nubank-bg p-5">
        <div className="flex items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
            className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-nubank-border bg-white text-nubank-text transition-colors hover:bg-nubank-bg"
          >
            <ArrowLeft size={19} strokeWidth={2} />
          </button>
          <h1 className="font-display text-xl font-bold tracking-tight text-nubank-text">
            Assinatura
          </h1>
        </div>
        <div className="mt-5 rounded-[20px] bg-white p-5 shadow-nubank-card">
          <p className="text-[15px] font-semibold text-nubank-text">Assinatura indisponível</p>
          <p className="mt-2 text-[13px] leading-relaxed text-nubank-text-secondary">
            A contratação de planos está temporariamente indisponível. Tente novamente mais tarde
            ou fale com o suporte da GestMiles.
          </p>
        </div>
      </div>
    );
  }

  const status = me?.perfil?.subscription_status;
  const periodEnd = me?.perfil?.subscription_current_period_end;
  const hasCustomer = !!me?.perfil?.stripe_customer_id;
  const managedSubscription = hasManagedSubscription(status);
  const subscriptionStateBlocked = !!token && !!meError;
  const checkoutBlocked = !!token && (loadingMe || !!meError || managedSubscription);

  const statusBadge = loadingMe
    ? "Carregando…"
    : status
      ? ({
          active: "Ativa",
          trialing: "Período de teste",
          past_due: "Pagamento pendente",
          unpaid: "Pagamento pendente",
          paused: "Pausada",
          canceled: "Cancelada",
        }[String(status).toLowerCase()] ?? status)
      : "Gratuito";

  return (
    <div className="mx-auto min-h-screen max-w-md space-y-3.5 bg-nubank-bg p-5 pb-24">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-nubank-border bg-white text-nubank-text transition-colors hover:bg-nubank-bg"
        >
          <ArrowLeft size={19} strokeWidth={2} />
        </button>
        <h1 className="font-display text-xl font-bold tracking-tight text-nubank-text">
          Assinatura
        </h1>
      </div>

      {error && (
        <div className="rounded-[14px] bg-destructive-soft px-4 py-3 text-[13px] font-medium text-destructive-strong">
          {error}
        </div>
      )}

      {token ? (
        <div className="rounded-[20px] bg-white p-4 shadow-nubank-card">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-semibold text-nubank-text">Seu plano hoje</span>
            <span className="rounded-full bg-[#F1F0F3] px-3 py-1.5 text-[11.5px] font-semibold leading-none text-[#54535A]">
              {statusBadge}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-nubank-text-secondary">
            {loadingMe
              ? "Carregando estado da assinatura…"
              : meError
                ? "Não foi possível carregar o estado da assinatura agora."
                : status
                  ? periodEnd
                    ? `Próxima renovação: ${new Date(periodEnd).toLocaleDateString("pt-BR")}.`
                    : "Assinatura registrada."
                  : "Saldos, extrato, alertas de vencimento e busca de passagens — sempre grátis."}
          </p>
          {meError ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void loadMe()}
            >
              Tentar novamente
            </Button>
          ) : null}
          {hasCustomer ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              disabled={busySlug === "__portal__"}
              onClick={() => void openPortal()}
            >
              Gerenciar cobrança e método de pagamento
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex rounded-[16px] bg-[#EDECEF] p-1">
        {(
          [
            { value: "month", label: "Mensal" },
            { value: "year", label: "Anual" },
          ] as const
        ).map((opt) => {
          const active = interval === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => setInterval(opt.value)}
              className={`flex-1 rounded-[13px] py-2.5 text-center text-[13.5px] transition-all ${
                active
                  ? "bg-white font-semibold text-nubank-text shadow-[0_1px_4px_rgba(24,6,38,0.08)]"
                  : "font-medium text-nubank-text-secondary"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {loadingPlans ? (
        <p className="px-1 text-[13px] text-nubank-text-secondary">Carregando planos...</p>
      ) : plansError ? (
        <div className="space-y-3 rounded-[16px] bg-destructive-soft px-4 py-3.5 text-[13px] text-destructive-strong">
          <p>{plansError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadPlans()}>
            Tentar novamente
          </Button>
        </div>
      ) : subscriptionStateBlocked ? (
        <div className="space-y-3 rounded-[16px] bg-warning-soft px-4 py-3.5 text-[13px] text-warning-strong">
          <p>
            Não conseguimos confirmar sua assinatura atual. Recarregue antes de contratar para
            evitar cobrança duplicada.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadMe()}>
            Recarregar assinatura
          </Button>
        </div>
      ) : managedSubscription ? (
        <div className="space-y-3 rounded-[16px] bg-success-soft px-4 py-3.5 text-[13px] text-success-strong">
          <p>
            Você já tem uma assinatura em andamento. Use o portal de cobrança para trocar plano,
            método de pagamento ou regularizar pendências.
          </p>
          {hasCustomer ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busySlug === "__portal__"}
              onClick={() => void openPortal()}
            >
              Gerenciar assinatura
            </Button>
          ) : null}
        </div>
      ) : plans.length === 0 ? (
        <p className="px-1 text-[13px] text-nubank-text-secondary">
          Não há planos ativos. Volte mais tarde ou fale com o suporte.
        </p>
      ) : (
        <div className="space-y-3.5">
          {plans.map((plan) => {
            const canBuy =
              interval === "month"
                ? !!plan.stripe_price_id_monthly
                : !!plan.stripe_price_id_yearly;
            return (
              <div
                key={plan.id}
                className="rounded-3xl border-[1.5px] border-[#E5CCF2] bg-white p-5 shadow-[0_8px_24px_-8px_rgba(138,5,190,0.15)]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-nubank-tint text-nubank-primary">
                    <Crown size={19} strokeWidth={1.9} aria-hidden />
                  </span>
                  <span className="font-display text-[19px] font-bold tracking-tight text-nubank-text">
                    {plan.name}
                  </span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-nubank-text-secondary">
                  {plan.description?.trim()
                    ? plan.description
                    : canBuy
                      ? `Cobrança ${interval === "month" ? "mensal" : "anual"} — o valor exato é confirmado no checkout.`
                      : `Este plano não está disponível para cobrança ${interval === "month" ? "mensal" : "anual"}.`}
                </p>
                <div className="mt-4 flex flex-col gap-2.5">
                  {RECURSOS_PLUS.map((recurso) => (
                    <span key={recurso} className="flex items-center gap-2.5">
                      <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-nubank-tint text-nubank-primary">
                        <Check size={12} strokeWidth={3} aria-hidden />
                      </span>
                      <span className="text-[13.5px] font-medium text-nubank-text">{recurso}</span>
                    </span>
                  ))}
                </div>
                <Button
                  className="mt-5 h-[52px] w-full rounded-[18px] text-[15px] font-bold"
                  disabled={!token || !canBuy || checkoutBlocked || busySlug === plan.slug}
                  onClick={() => void checkout(plan)}
                >
                  {busySlug === plan.slug
                    ? "Redirecionando..."
                    : loadingMe
                      ? "Confirmando assinatura..."
                      : managedSubscription
                        ? "Gerencie pelo portal"
                        : `Assinar ${plan.name}`}
                </Button>
                <p className="mt-2.5 text-center text-[11.5px] text-nubank-text-secondary/70">
                  Pagamento via Stripe · cancele quando quiser
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 rounded-[20px] bg-white px-4 py-3.5 shadow-nubank-card">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] bg-success-soft text-success-strong">
          <ShieldCheck size={18} strokeWidth={1.75} aria-hidden />
        </span>
        <p className="text-[12.5px] leading-relaxed text-nubank-text-secondary">
          Cliente assessorado por agência? Seu plano é ativado pela sua equipe — sem custo extra
          aqui.
        </p>
      </div>

      {!token ? (
        <p className="text-center text-[13px] text-nubank-text-secondary">
          <a href="/auth" className="font-semibold text-primary hover:underline">
            Faça login
          </a>{" "}
          para assinar.
        </p>
      ) : null}
    </div>
  );
};

export default AssinaturaClientePage;
