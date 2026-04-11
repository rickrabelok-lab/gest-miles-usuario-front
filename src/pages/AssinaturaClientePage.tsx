import { useCallback, useEffect, useState } from "react";

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

/**
 * Página de subscrição para clientes: listar planos públicos, abrir Stripe Checkout
 * e, com assinatura ativa, o portal de faturação.
 */
const AssinaturaClientePage = () => {
  const { session } = useAuth();
  const token = session?.access_token ?? null;

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadingMe, setLoadingMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    if (!hasApiUrl()) {
      setLoadingPlans(false);
      return;
    }
    setLoadingPlans(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl("/api/stripe/plans"));
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? res.statusText);
      }
      const data = (await res.json()) as { plans: PlanRow[] };
      setPlans(data.plans ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar planos.");
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
    try {
      const data = await apiFetch<MeResponse>("/api/stripe/me", { token });
      setMe(data);
    } catch {
      setMe(null);
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
      setError("Inicie sessão para subscrever.");
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
      else setError("Resposta sem URL de checkout.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar checkout.");
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
      else setError("Resposta sem URL do portal.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao abrir o portal de faturação.");
    } finally {
      setBusySlug(null);
    }
  };

  if (!hasApiUrl()) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Card>
          <CardHeader>
            <CardTitle>Indisponível</CardTitle>
            <CardDescription>
              Configure <code className="text-xs">VITE_API_URL</code> para usar subscrições (backend com Stripe).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const status = me?.perfil?.subscription_status;
  const periodEnd = me?.perfil?.subscription_current_period_end;
  const hasCustomer = !!me?.perfil?.stripe_customer_id;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-24 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Planos e subscrição</h1>
        <p className="text-sm text-muted-foreground">
          Escolha um plano para aceder às funcionalidades incluídas. O pagamento é processado de forma segura pelo
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
            <CardTitle className="text-lg">A sua subscrição</CardTitle>
            <CardDescription>
              {loadingMe
                ? "A carregar estado…"
                : status
                  ? `Estado: ${status}${periodEnd ? ` · Próxima renovação: ${new Date(periodEnd).toLocaleString("pt-BR")}` : ""}`
                  : "Sem subscrição ativa registada."}
            </CardDescription>
          </CardHeader>
          {hasCustomer ? (
            <CardFooter>
              <Button type="button" variant="outline" disabled={busySlug === "__portal__"} onClick={() => void openPortal()}>
                Gerir faturação e método de pagamento
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
        <p className="text-sm text-muted-foreground">A carregar planos…</p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">Não há planos ativos. Volte mais tarde ou contacte o suporte.</p>
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
                      {interval === "month" ? "Cobrança mensal" : "Cobrança anual"} — o valor exato é confirmado no
                      checkout.
                    </p>
                  ) : (
                    <p>Este plano não está disponível para faturação {interval === "month" ? "mensal" : "anual"}.</p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    disabled={!token || !canBuy || busySlug === plan.slug}
                    onClick={() => void checkout(plan)}
                  >
                    {busySlug === plan.slug ? "A redirecionar…" : "Subscrever"}
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
            Inicie sessão
          </a>{" "}
          para subscrever.
        </p>
      ) : null}
    </div>
  );
};

export default AssinaturaClientePage;
