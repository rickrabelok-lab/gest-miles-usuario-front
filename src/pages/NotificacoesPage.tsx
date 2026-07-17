import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import BottomNav from "@/components/BottomNav";
import { Switch } from "@/components/ui/switch";
import { useNotificationPrefs } from "@/hooks/useNotificationPrefs";

/** Tela de Notificações — hoje só o opt-out de promoções no WhatsApp. */
export default function NotificacoesPage() {
  const navigate = useNavigate();
  const { enabled, loading, saving, error, reload, toggle } = useNotificationPrefs();

  const onToggle = async (next: boolean) => {
    try {
      await toggle(next);
    } catch {
      toast.error("Não foi possível salvar. Tente de novo.");
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-28">
      <div className="flex items-center gap-2.5 px-5 pb-1 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-[16px] border border-nubank-border bg-white text-nubank-text transition-colors hover:bg-nubank-bg"
        >
          <ArrowLeft size={19} strokeWidth={2} />
        </button>
        <h1 className="font-display text-[17px] font-bold tracking-tight text-nubank-text">
          Notificações
        </h1>
      </div>

      <div className="px-5 pt-4">
        {loading ? (
          <p className="text-sm text-nubank-text-secondary">Carregando…</p>
        ) : error ? (
          <div className="rounded-[20px] bg-white p-4 shadow-nubank-card">
            <p className="text-sm text-nubank-text-secondary">
              Não foi possível carregar suas preferências.
            </p>
            <button
              type="button"
              onClick={() => void reload()}
              className="mt-3 rounded-full bg-nubank-tint px-4 py-2 text-sm font-semibold text-nubank-dark transition-colors hover:bg-primary/15"
            >
              Tentar de novo
            </button>
          </div>
        ) : (
          <div className="rounded-[20px] bg-white p-1 shadow-nubank-card">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-nubank-text">
                  Promoções no WhatsApp
                </span>
                <span className="block text-xs text-nubank-text-secondary">
                  Receba as melhores promoções direto no seu grupo.
                </span>
              </span>
              <Switch
                checked={enabled}
                disabled={saving}
                onCheckedChange={onToggle}
                aria-label="Promoções no WhatsApp"
              />
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
