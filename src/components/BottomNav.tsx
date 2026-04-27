import { useMemo, type FC } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Bell, Home, Layers, Ticket, User } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { useNotificacoes } from "@/hooks/useNotificacoes";
import { cn } from "@/lib/utils";

export type BottomNavId = "inicio" | "programas" | "passagens" | "alertas" | "perfil";

const NAV: Array<{
  id: BottomNavId;
  label: string;
  Icon: typeof Home;
  match: (ctx: { pathname: string; search: string }) => boolean;
}> = [
  {
    id: "inicio",
    label: "Início",
    Icon: Home,
    match: ({ pathname, search }) => {
      if (pathname !== "/") return false;
      const v = new URLSearchParams(search).get("view");
      return v !== "programas";
    },
  },
  {
    id: "programas",
    label: "Programas",
    Icon: Layers,
    match: ({ pathname, search }) => {
      if (pathname === "/programas") return true;
      if (pathname === "/") {
        return new URLSearchParams(search).get("view") === "programas";
      }
      return false;
    },
  },
  {
    id: "passagens",
    label: "Passagens",
    Icon: Ticket,
    match: ({ pathname }) =>
      pathname.startsWith("/search-flights") ||
      pathname.startsWith("/price-calendar") ||
      pathname.startsWith("/bonus-offers") ||
      pathname === "/passagens" ||
      pathname === "/registrar-emissao",
  },
  {
    id: "alertas",
    label: "Alertas",
    Icon: Bell,
    match: ({ pathname }) =>
      pathname === "/vencimentos" ||
      pathname === "/alertas" ||
      pathname.startsWith("/alertas/") ||
      pathname === "/radar-oportunidades",
  },
  {
    id: "perfil",
    label: "Perfil",
    Icon: User,
    match: ({ pathname }) =>
      pathname === "/perfil" ||
      pathname === "/preferencias-sugestoes" ||
      pathname === "/convide-amigos" ||
      pathname === "/fale-conosco" ||
      pathname === "/duvidas" ||
      pathname === "/sobre",
  },
];

function getActiveId(pathname: string, search: string): BottomNavId | null {
  const ctx = { pathname, search };
  for (const item of NAV) {
    if (item.match(ctx)) return item.id;
  }
  return null;
}

export interface BottomNavProps {
  activeItem?: string;
  onItemChange?: (item: string) => void;
  showClientSelector?: boolean;
  clients?: Array<{ id: string; name: string }>;
  selectedClientId?: string | null;
  onClientSelect?: (clientId: string) => void;
  onBackToMyAccount?: () => void;
  onRemoveClient?: (clientId: string) => void;
}

const BottomNav: FC<BottomNavProps> = () => {
  const navigate = useNavigate();
  const { pathname, search: locationSearch } = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const notif = useNotificacoes(!!user?.id, user?.id ?? null);
  const badge = notif.data?.unreadCount ?? 0;

  const active = useMemo(
    () => getActiveId(pathname, locationSearch),
    [pathname, locationSearch],
  );

  const goInicio = () => {
    const next = new URLSearchParams();
    const clientId = searchParams.get("clientId");
    if (clientId) next.set("clientId", clientId);
    const q = next.toString();
    navigate(q ? `/?${q}` : "/");
  };

  const goProgramas = () => {
    const next = new URLSearchParams();
    const clientId = searchParams.get("clientId");
    if (clientId) next.set("clientId", clientId);
    next.set("view", "programas");
    navigate(`/?${next.toString()}`);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-200/80 bg-white shadow-[0_-2px_16px_rgba(0,0,0,0.06)]">
      <div className="mx-auto flex max-w-md items-stretch justify-between gap-0 px-1.5 py-1.5 sm:px-2">
        {NAV.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <div key={id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  if (id === "inicio") {
                    goInicio();
                    return;
                  }
                  if (id === "programas") {
                    goProgramas();
                    return;
                  }
                  if (id === "passagens") {
                    navigate("/search-flights");
                    return;
                  }
                  if (id === "alertas") {
                    navigate("/vencimentos");
                    return;
                  }
                  navigate("/perfil");
                }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors",
                  isActive
                    ? "text-nubank-primary"
                    : "text-stone-500 hover:text-stone-800",
                )}
              >
                <span className="relative">
                  <Icon
                    className="h-5 w-5 shrink-0"
                    strokeWidth={isActive ? 2.25 : 1.75}
                    aria-hidden
                  />
                  {id === "alertas" && badge > 0 ? (
                    <span
                      className="absolute -right-1.5 -top-1 min-h-[16px] min-w-[16px] rounded-full bg-rose-500 px-0.5 text-center text-[9px] font-bold leading-4 text-white"
                      aria-label={`${badge} notificações não lidas`}
                    >
                      {badge > 9 ? "9+" : badge}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "max-w-full truncate px-0.5 text-center text-[9px] leading-tight",
                    isActive ? "font-semibold" : "font-medium",
                  )}
                >
                  {label}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
};

export default BottomNav;
