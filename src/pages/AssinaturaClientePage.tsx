import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, getApiUrl, hasApiUrl } from "@/services/api";

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
      <div className="mx-auto max-w-lg p-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-4 -ml-1 h-8 px-2 text-xs text-muted-foreground"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Assinatura indisponível</CardTitle>
            <CardDescription>
              A contratação de planos está temporariamente indisponível. Tente novamente mais tarde ou fale com o
              suporte da GestMiles.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const status = me?.perfil?.subscription_status;
  const periodEnd = me?.perfil?.subscription_current_period_end;
  const hasCustomer = !!me?.perfil?.stripe_customer_id;
  const managedSubscription = hasManagedSubscription(status);
  const subscriptionStateBlocked = !!token && !!meError;
  const checkoutBlocked = !!token && (loadingMe || !!meError || managedSubscription);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-24 md:p-8">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-1 h-8 px-2 text-xs text-muted-foreground"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Button>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planos e assinatura</h1>
        <p className="text-sm text-muted-foreground">
          Escolha um plano para acessar as funcionalidades incluídas. O pagamento é processado de forma segura pelo
          Stripe.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {token ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sua assinatura</CardTitle>
            <CardDescription>
              {loadingMe
                ? "Carregando estado..."
                : meError
                  ? "Não foi possível carregar o estado da assinatura agora."
                  : status
                  ? `Estado: ${status}${periodEnd ? ` · Próxima renovação: ${new Date(periodEnd).toLocaleString("pt-BR")}` : ""}`
                  : "Sem assinatura ativa registrada."}
            </CardDescription>
          </CardHeader>
          {meError ? (
            <CardContent className="space-y-3 text-sm text-destructive">
              <p>{meError}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadMe()}>
                Tentar novamente
              </Button>
            </CardContent>
          ) : null}
          {hasCustomer ? (
            <CardFooter>
              <Button type="button" variant="outline" disabled={busySlug === "__portal__"} onClick={() => void openPortal()}>
                Gerenciar cobrança e método de pagamento
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Label className="text-sm font-medium">Faturação</Label>
        <RadioGroup
          className="flex gap-4"
          value={interval}
          onValueChange={(v) => setInterval(v as "month" | "year")}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="month" id="int-m" />
            <Label htmlFor="int-m" className="font-normal">
              Mensal
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="year" id="int-y" />
            <Label htmlFor="int-y" className="font-normal">
              Anual
            </Label>
          </div>
        </RadioGroup>
      </div>

      {loadingPlans ? (
        <p className="text-sm text-muted-foreground">Carregando planos...</p>
      ) : plansError ? (
        <div className="space-y-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-3 text-sm text-destructive">
          <p>{plansError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadPlans()}>
            Tentar novamente
          </Button>
        </div>
      ) : subscriptionStateBlocked ? (
        <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <p>
            Não conseguimos confirmar sua assinatura atual. Recarregue antes de contratar para evitar cobrança duplicada.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadMe()}>
            Recarregar assinatura
          </Button>
        </div>
      ) : managedSubscription ? (
        <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
          <p>
            Você já tem uma assinatura em andamento. Use o portal de cobrança para trocar plano, método de pagamento ou
            regularizar pendências.
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
        <p className="text-sm text-muted-foreground">Não há planos ativos. Volte mais tarde ou fale com o suporte.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => {
            const canBuy =
              interval === "month"
                ? !!plan.stripe_price_id_monthly
                : !!plan.stripe_price_id_yearly;
            return (
              <Card key={plan.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  {plan.description ? (
                    <CardDescription className="line-clamp-4">{plan.description}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="flex-1 text-sm text-muted-foreground">
                  {canBuy ? (
                    <p>
                      {interval === "month" ? "Cobrança mensal" : "Cobrança anual"} - o valor exato é confirmado no
                      checkout.
                    </p>
                  ) : (
                    <p>Este plano não está disponível para cobrança {interval === "month" ? "mensal" : "anual"}.</p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    disabled={!token || !canBuy || checkoutBlocked || busySlug === plan.slug}
                    onClick={() => void checkout(plan)}
                  >
                    {busySlug === plan.slug
                      ? "Redirecionando..."
                      : loadingMe
                        ? "Confirmando assinatura..."
                        : managedSubscription
                          ? "Gerencie pelo portal"
                          : "Assinar"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {!token ? (
        <p className="text-center text-sm text-muted-foreground">
          <a href="/auth" className="text-primary underline">
            Faça login
          </a>{" "}
          para assinar.
        </p>
      ) : null}
    </div>
  );
};

export default AssinaturaClientePage;
