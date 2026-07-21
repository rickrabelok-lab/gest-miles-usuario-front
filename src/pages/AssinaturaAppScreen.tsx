import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BadgePercent, Check, Crown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlement } from "@/hooks/useEntitlement";
import {
  getPaywallOfferings,
  isRevenueCatAvailable,
  purchase,
  restorePurchases,
  type PaywallData,
  type PaywallPackage,
} from "@/lib/revenuecat";

/** Recursos liberados no plano pago (mesmos gates RequirePaid do app). */
const RECURSOS_PLUS = [
  "Calendário de preços por milheiro",
  "Ofertas de bônus de transferência",
  "Simulador de compra de milhas",
  "Radar de oportunidades personalizado",
];

const MANAGE_URL = "https://play.google.com/store/account/subscriptions";

type AssinaturaAppScreenProps = {
  /** Seam de teste: nº de tentativas e delay do retry do entitlement pós-compra. */
  retryAttempts?: number;
  retryDelayMs?: number;
};

/** Assinatura via loja (Google Play) — só renderizada no app nativo (AssinaturaRoute). */
export default function AssinaturaAppScreen({
  retryAttempts = 5,
  retryDelayMs = 1500,
}: AssinaturaAppScreenProps = {}) {
  const navigate = useNavigate();
  const { refreshRole } = useAuth();
  const { isPaid } = useEntitlement();
  const [paywall, setPaywall] = useState<PaywallData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const isPaidRef = useRef(isPaid);
  isPaidRef.current = isPaid;

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const data = isRevenueCatAvailable() ? await getPaywallOfferings() : null;
      if (mounted) {
        setPaywall(data);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // O webhook (fonte da verdade) aterrissa em segundos; re-lê o perfil até virar.
  const refreshEntitlementWithRetry = useCallback(async () => {
    for (let i = 0; i < retryAttempts; i++) {
      await refreshRole();
      if (isPaidRef.current) break;
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }, [refreshRole, retryAttempts, retryDelayMs]);

  const handlePurchase = async (pkg: PaywallPackage) => {
    setBusy(pkg.id);
    try {
      const outcome = await purchase(pkg);
      if (outcome === "cancelled") return;
      toast.success("Assinatura ativada! Bem-vindo ao plano completo.");
      await refreshEntitlementWithRetry();
      navigate(-1);
    } catch (err) {
      console.warn("[AssinaturaApp] compra:", err);
      toast.error("Não foi possível concluir a compra. Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    setBusy("restore");
    try {
      const restored = await restorePurchases();
      if (restored) {
        toast.success("Assinatura restaurada.");
        await refreshEntitlementWithRetry();
      } else {
        toast.error("Nenhuma assinatura encontrada nesta conta da loja.");
      }
    } catch (err) {
      console.warn("[AssinaturaApp] restore:", err);
      toast.error("Não foi possível restaurar. Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  const openManage = async () => {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: MANAGE_URL });
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-md bg-nubank-bg px-4 pb-10 pt-[calc(1rem+var(--gm-safe-top))]">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-nubank-text-secondary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar
      </button>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-nubank-primary/10">
          <Crown className="h-5 w-5 text-nubank-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold text-nubank-text">Plano completo</h1>
          <p className="text-sm text-nubank-text-secondary">Assinatura via Google Play</p>
        </div>
      </div>

      <ul className="mb-6 space-y-2">
        {RECURSOS_PLUS.map((r) => (
          <li key={r} className="flex items-start gap-2 text-sm text-nubank-text">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-nubank-primary" aria-hidden="true" />
            {r}
          </li>
        ))}
      </ul>

      {isPaid ? (
        <div className="rounded-2xl border bg-white p-5 dark:bg-card">
          <p className="font-medium text-nubank-text">Sua assinatura está ativa. 🎉</p>
          <p className="mt-1 text-sm text-nubank-text-secondary">
            Renovação, troca de plano e cancelamento são feitos na loja.
          </p>
          <Button className="mt-4 w-full" onClick={() => void openManage()}>
            Gerenciar assinatura
          </Button>
        </div>
      ) : loading ? (
        <div className="rounded-2xl border bg-white p-5 text-sm text-nubank-text-secondary dark:bg-card">
          Carregando planos…
        </div>
      ) : !paywall ? (
        <div className="rounded-2xl border bg-white p-5 dark:bg-card">
          <p className="font-medium text-nubank-text">Assinatura em breve</p>
          <p className="mt-1 text-sm text-nubank-text-secondary">
            Estamos finalizando a publicação na loja. Volte em breve.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {paywall.monthly && (
            <div className="flex flex-col rounded-2xl border bg-white p-4 dark:bg-card">
              <p className="text-sm font-medium text-nubank-text-secondary">Mensal</p>
              <p className="mt-1 text-lg font-semibold text-nubank-text">
                {paywall.monthly.priceString}
              </p>
              <p className="text-xs text-nubank-text-secondary">por mês</p>
              <Button
                className="mt-4"
                disabled={busy !== null}
                onClick={() => void handlePurchase(paywall.monthly!)}
              >
                {busy === paywall.monthly.id ? "Abrindo…" : "Assinar mensal"}
              </Button>
            </div>
          )}
          {paywall.annual && (
            <div className="relative flex flex-col rounded-2xl border-2 border-nubank-primary bg-white p-4 dark:bg-card">
              {paywall.savingsPct !== null && (
                <span className="absolute -top-3 right-3 inline-flex items-center gap-1 rounded-full bg-nubank-primary px-2 py-0.5 text-xs font-medium text-white">
                  <BadgePercent className="h-3 w-3" aria-hidden="true" />
                  Economize {paywall.savingsPct}%
                </span>
              )}
              <p className="text-sm font-medium text-nubank-text-secondary">Anual</p>
              <p className="mt-1 text-lg font-semibold text-nubank-text">
                {paywall.annual.priceString}
              </p>
              <p className="text-xs text-nubank-text-secondary">por ano</p>
              <Button
                className="mt-4"
                disabled={busy !== null}
                onClick={() => void handlePurchase(paywall.annual!)}
              >
                {busy === paywall.annual.id ? "Abrindo…" : "Assinar anual"}
              </Button>
            </div>
          )}
        </div>
      )}

      {!isPaid && (
        <Button
          variant="ghost"
          className="mt-4 w-full text-nubank-text-secondary"
          disabled={busy !== null}
          onClick={() => void handleRestore()}
        >
          {busy === "restore" ? "Restaurando…" : "Restaurar compras"}
        </Button>
      )}

      <p className="mt-6 text-center text-xs text-nubank-text-secondary">
        Ao assinar você concorda com os{" "}
        <Link to="/termos" className="underline">Termos de Uso</Link> e a{" "}
        <Link to="/privacidade" className="underline">Política de Privacidade</Link>.
      </p>
    </div>
  );
}
