import { useMemo } from "react";
import { Bell } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useAuth } from "@/contexts/AuthContext";
import {
  useNotificacoes,
  useNotificacoesMarkRead,
  useNotificacoesMarkAllRead,
  type NotificacaoTipo,
} from "@/hooks/useNotificacoes";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "dd/MM HH:mm");
  } catch {
    return iso;
  }
}

export default function NotificationsDropdown() {
  const { user } = useAuth();
  const enabled = !!user?.id;
  const usuarioId = user?.id ?? null;

  const { data, isLoading } = useNotificacoes(enabled, usuarioId);
  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  const markRead = useNotificacoesMarkRead(enabled, usuarioId);
  const markAll = useNotificacoesMarkAllRead(enabled, usuarioId);

  const triggerLabel = useMemo(
    () => (unreadCount > 0 ? `Notificações (${unreadCount} não lidas)` : "Notificações"),
    [unreadCount],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex h-[38px] w-[38px] items-center justify-center rounded-full",
            "border border-primary/20 bg-primary/[0.08] text-primary",
            "transition-all duration-200 hover:bg-primary/[0.15] hover:scale-105 active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          )}
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          <Bell
            className={cn(
              "h-[18px] w-[18px]",
              unreadCount > 0 && "animate-[bell-ring_0.6s_ease-in-out]",
            )}
          />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-background bg-primary px-0.5 text-[9px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-[300px] max-w-[88vw] overflow-hidden rounded-2xl border border-primary/[0.12] p-0 shadow-[0_16px_40px_rgba(138,5,190,0.14),0_4px_12px_rgba(0,0,0,0.06)]"
      >
        <div className="flex items-center justify-between border-b border-primary/10 bg-gradient-to-r from-primary/[0.05] to-primary/[0.02] px-4 py-3">
          <span className="text-[13px] font-bold text-foreground">
            Notificações
            {unreadCount > 0 && <span className="ml-1 text-primary">({unreadCount})</span>}
          </span>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-[11px] font-semibold text-primary transition-opacity hover:opacity-70 disabled:opacity-40"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        <div className="max-h-[52vh] overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              Nenhuma notificação no momento.
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                className="flex w-full cursor-pointer gap-2.5 border-b border-border/50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-primary/[0.04]"
                onClick={() => {
                  void markRead
                    .mutateAsync({
                      id: n.id,
                      tipo: n.tipo as NotificacaoTipo,
                      mensagem: n.mensagem,
                    })
                    .catch((err) => console.error("[notificacoes] markRead failed:", err));
                }}
              >
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold leading-snug text-foreground">{n.titulo}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.mensagem}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">{formatDate(n.data_criacao)}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
