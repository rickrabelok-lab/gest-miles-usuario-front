import { User, Zap, LogIn, LogOut, CreditCard } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { resolveOptionalHeaderWordmarkImageUrl } from "@/lib/gestMilesBranding";
import { useBrandingConfig } from "@/hooks/useBrandingConfig";
import { useBonusPromotions } from "@/hooks/useBonusPromotions";
import NotificationsDropdown from "@/components/notifications/NotificationsDropdown";

const getInitials = (email: string | undefined) => {
  if (!email) return "?";
  const part = email.split("@")[0] ?? "";
  const letters = part.replace(/[^a-z]/gi, "").slice(0, 2);
  return (letters || "?").toUpperCase();
};

const getDisplayName = (user: { email?: string; user_metadata?: Record<string, unknown> } | null) => {
  if (!user) return "";
  const meta = user.user_metadata?.full_name;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  const prefix = user.email?.split("@")[0] ?? "";
  return prefix
    .split(/[._-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
};

const DashboardHeader = () => {
  const [bannerVisible, setBannerVisible] = useState(true);
  const navigate = useNavigate();

  // Banner de bônus: usa o feed real (mesma query da seção abaixo — cache compartilhado).
  const { promotions: transferPromos } = useBonusPromotions("transfer");
  const maxTransferBonus = useMemo(() => {
    const nums = transferPromos
      .map((p) => p.bonusNumeric)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
    return nums.length ? Math.max(...nums) : null;
  }, [transferPromos]);
  const { user, signOut } = useAuth();

  const { data: brandingData } = useBrandingConfig();
  const optionalHeaderWordmarkImageUrl = useMemo(
    () => resolveOptionalHeaderWordmarkImageUrl(brandingData.brandAssets),
    [brandingData.brandAssets],
  );

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/");
    } catch {
      navigate("/");
    }
  };

  return (
    <div className="bg-transparent text-foreground">
      <div className="flex items-center justify-between px-5 py-3">
        <h1 className="m-0 flex min-h-[2.25rem] items-center">
          {optionalHeaderWordmarkImageUrl ? (
            <img
              src={optionalHeaderWordmarkImageUrl}
              alt="GestMiles"
              className="h-7 w-auto max-w-[min(150px,40vw)] object-contain object-left sm:h-8 sm:max-w-[170px]"
              loading="eager"
              decoding="async"
            />
          ) : (
            <span className="font-display text-lg font-bold leading-none tracking-tight">
              <span className="text-foreground">Gest</span>
              <span className="text-[#8A05BE]">Miles</span>
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <NotificationsDropdown />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] border border-nubank-border bg-white text-[13px] font-extrabold text-[#8A05BE] shadow-nubank transition-colors hover:bg-nubank-bg active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="Menu do usuário"
              >
                {user ? getInitials(user.email) : "?"}
                {user && (
                  <span className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full border-2 border-white bg-green-500" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[220px] overflow-hidden rounded-2xl border border-primary/[0.12] p-0 shadow-[0_16px_40px_rgba(138,5,190,0.14),0_4px_12px_rgba(0,0,0,0.06)]"
            >
              {user ? (
                <>
                  <div className="flex items-center gap-2.5 border-b border-primary/10 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8A05BE] to-[#a855f7] text-[12px] font-extrabold text-white shadow-[0_2px_8px_rgba(138,5,190,0.30)]">
                      {getInitials(user.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold leading-tight text-foreground">
                        {getDisplayName(user)}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-primary/[0.06] hover:text-primary focus:bg-primary/[0.06] focus:text-primary"
                      onClick={() => navigate("/perfil")}
                    >
                      <User className="h-4 w-4 opacity-80" />
                      Meu perfil
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-primary/[0.06] hover:text-primary focus:bg-primary/[0.06] focus:text-primary"
                      onClick={() => navigate("/assinatura")}
                    >
                      <CreditCard className="h-4 w-4 opacity-80" />
                      Planos
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 rounded-lg px-3 py-2.5 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10 focus:bg-destructive/10 focus:text-destructive"
                      onClick={() => void handleLogout()}
                    >
                      <LogOut className="h-4 w-4 opacity-80" />
                      Sair
                    </DropdownMenuItem>
                  </div>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => navigate("/auth")}>
                    <LogIn className="mr-2 h-4 w-4" />
                    Entrar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/auth")}>Criar conta</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {bannerVisible && maxTransferBonus != null && (
        <div className="mx-5 mb-2.5 flex items-center gap-2 rounded-[14px] bg-warning-soft px-3 py-2 text-[11px] text-warning-strong">
          <button
            type="button"
            onClick={() => navigate("/bonus-offers")}
            className="flex flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8A05BE]"
          >
            <Zap size={14} className="shrink-0" aria-hidden />
            <span className="text-[11px] font-medium leading-snug">
              Bônus de até <span className="font-bold">{maxTransferBonus}%</span> na transferência. Confira
            </span>
          </button>
          <button
            onClick={() => setBannerVisible(false)}
            className="shrink-0 opacity-60 hover:opacity-100"
            aria-label="Fechar banner de bônus"
            type="button"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default DashboardHeader;
