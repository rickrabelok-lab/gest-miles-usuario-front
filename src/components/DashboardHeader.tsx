import {
  User,
  Menu,
  Zap,
  LogIn,
  LogOut,
  Copy,
  Check,
  FileEdit,
  Bell,
  Users,
  Info,
  UserPlus,
  HelpCircle,
  MessageCircle,
  Calculator,
  Radio,
  CreditCard,
} from "lucide-react";
import GestMilesLogo from "@/components/GestMilesLogo";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { useAuth } from "@/contexts/AuthContext";
import { resolveOptionalHeaderWordmarkImageUrl } from "@/lib/gestMilesBranding";
import { useBrandingConfig } from "@/hooks/useBrandingConfig";
import { useCsGestores } from "@/hooks/useCsGestores";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
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
  const [idCopied, setIdCopied] = useState(false);
  const [managedClientIds, setManagedClientIds] = useState<string[]>([]);
  const [managedClientNames, setManagedClientNames] = useState<Record<string, string>>({});
  const [demandSummary, setDemandSummary] = useState({
    openCount: 0,
    pendingCount: 0,
    inProgressCount: 0,
    lastClientName: null as string | null,
  });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, role, signOut } = useAuth();
  const isGestorView = role === "gestor" || role === "admin";
  const activeClientId = searchParams.get("clientId");
  const canOpenClientProfile =
    Boolean(activeClientId) &&
    (role === "gestor" || role === "admin" || role === "cs" || role === "admin_equipe");

  const { data: csDashboard } = useCsGestores(role === "cs" || role === "admin_equipe");
  const csTeam = csDashboard?.flat ?? [];
  const showDemandOpenBanner = isGestorView || role === "cs" || role === "admin_equipe";

  const { data: brandingData } = useBrandingConfig();
  const optionalHeaderWordmarkImageUrl = useMemo(
    () => resolveOptionalHeaderWordmarkImageUrl(brandingData.brandAssets),
    [brandingData.brandAssets],
  );

  useEffect(() => {
    if (role === "cs" || role === "admin_equipe") {
      const ids = new Set<string>();
      csTeam.forEach((g) => {
        g.clientes.forEach((c) => {
          if (c.clienteId) ids.add(c.clienteId);
        });
      });
      const idList = Array.from(ids);
      setManagedClientIds(idList);
      if (idList.length === 0) {
        setManagedClientNames({});
        return;
      }
      let cancelled = false;
      void (async () => {
        const { data: perfisData } = await supabase
          .from("perfis")
          .select("usuario_id, nome_completo")
          .in("usuario_id", idList);
        if (cancelled) return;
        const names: Record<string, string> = {};
        (perfisData ?? []).forEach((row) => {
          names[row.usuario_id as string] = (row.nome_completo as string) || "Cliente";
        });
        setManagedClientNames(names);
      })();
      return () => {
        cancelled = true;
      };
    }

    if (!isGestorView || !user?.id) {
      setManagedClientIds([]);
      setManagedClientNames({});
      setDemandSummary({
        openCount: 0,
        pendingCount: 0,
        inProgressCount: 0,
        lastClientName: null,
      });
      return;
    }

    let cancelled = false;
    const loadManagedClients = async () => {
      const { data, error } = await supabase
        .from("cliente_gestores")
        .select("cliente_id")
        .eq("gestor_id", user.id);
      if (error || cancelled) return;
      const ids = (data ?? []).map((row) => row.cliente_id as string).filter(Boolean);
      setManagedClientIds(ids);
      if (ids.length === 0) {
        setManagedClientNames({});
        return;
      }
      const { data: perfisData } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", ids);
      if (cancelled) return;
      const names: Record<string, string> = {};
      (perfisData ?? []).forEach((row) => {
        names[row.usuario_id as string] = (row.nome_completo as string) || "Cliente";
      });
      setManagedClientNames(names);
    };

    void loadManagedClients();
    return () => {
      cancelled = true;
    };
  }, [isGestorView, user?.id, role, csTeam]);

  useEffect(() => {
    if (!showDemandOpenBanner || managedClientIds.length === 0) {
      setDemandSummary({
        openCount: 0,
        pendingCount: 0,
        inProgressCount: 0,
        lastClientName: null,
      });
      return;
    }

    const managedIds = new Set(managedClientIds);
    let active = true;

    const loadDemandSummary = async () => {
      const { data, error } = await supabase
        .from("demandas_cliente")
        .select("cliente_id,status,created_at")
        .in("cliente_id", managedClientIds)
        .in("status", ["pendente", "em_andamento"])
        .order("created_at", { ascending: false });

      if (!active || error) return;

      const rows = (data ?? []) as Array<{
        cliente_id?: string;
        status?: string;
      }>;
      const pendingCount = rows.filter((row) => row.status === "pendente").length;
      const inProgressCount = rows.filter((row) => row.status === "em_andamento").length;
      const lastClientId = rows[0]?.cliente_id ? String(rows[0].cliente_id) : null;
      const lastClientName = lastClientId
        ? managedClientNames[lastClientId] ?? "Cliente"
        : null;

      setDemandSummary({
        openCount: rows.length,
        pendingCount,
        inProgressCount,
        lastClientName,
      });
    };

    void loadDemandSummary();

    const channel = supabase
      .channel(
        `header-demandas-open-${
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
        }`,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "demandas_cliente" },
        (payload) => {
          const row = (payload.new ?? payload.old) as { cliente_id?: string } | null;
          const clienteId = String(row?.cliente_id ?? "");
          if (!clienteId || !managedIds.has(clienteId)) return;
          setBannerVisible(true);
          void loadDemandSummary();
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [showDemandOpenBanner, managedClientIds, managedClientNames]);

  const isViewingClient = Boolean(activeClientId) && canOpenClientProfile;
  const displayedAccountId = isViewingClient ? (activeClientId as string) : (user?.id ?? "");
  const displayedAccountLabel = isViewingClient
    ? "ID do cliente em visualização"
    : "ID da sua conta";
  const displayedClientName = isViewingClient
    ? managedClientNames[activeClientId as string] ?? null
    : null;

  const copyAccountId = () => {
    if (!displayedAccountId) return;
    navigator.clipboard
      .writeText(displayedAccountId)
      .then(() => {
        setIdCopied(true);
        toast.success(
          isViewingClient
            ? "ID do cliente copiado."
            : "ID da conta copiado. Envie ao gestor para solicitar acesso.",
        );
        setTimeout(() => setIdCopied(false), 2000);
      })
      .catch(() => toast.error("Não foi possível copiar."));
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/");
    } catch {
      navigate("/");
    }
  };

  const goDemandasPendentes = () => {
    if (role === "cs" || role === "admin_equipe") {
      navigate("/cs?tab=demandas&status=pendente");
    } else {
      navigate("/gestor?tab=demandas&status=pendente");
    }
  };

  return (
    <div className="border-b border-border/20 bg-transparent text-foreground">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-[#8A05BE] to-[#a855f7] text-[13px] font-extrabold text-white shadow-[0_2px_12px_rgba(138,5,190,0.40)] transition-all duration-200 hover:scale-105 hover:shadow-[0_4px_20px_rgba(138,5,190,0.55)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="Menu do usuário"
              >
                {user ? getInitials(user.email) : "?"}
                {user && (
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-green-500" />
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

          <NotificationsDropdown />
        </div>
        <div className="flex flex-1 justify-center">
          <h1 className="m-0 flex min-h-[2rem] items-center justify-center">
            {optionalHeaderWordmarkImageUrl ? (
              <img
                src={optionalHeaderWordmarkImageUrl}
                alt="GestMiles"
                className="h-8 w-auto max-w-[min(160px,42vw)] object-contain object-center sm:h-9 sm:max-w-[180px]"
                loading="eager"
                decoding="async"
              />
            ) : (
              <span className="font-display text-[22px] font-bold leading-none tracking-tight sm:text-2xl">
                <span className="text-foreground">Gest</span>
                <span className="text-[#8A05BE]">Miles</span>
              </span>
            )}
          </h1>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className="rounded-xl p-2 text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground"
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="flex h-full w-3/4 flex-col overflow-hidden p-0 sm:max-w-xs [&>button]:right-4 [&>button]:top-4 [&>button]:text-white [&>button]:hover:bg-white/20 [&>button]:hover:text-white"
          >
            <div className="flex shrink-0 items-center justify-between bg-[#8A05BE] px-4 py-4 pr-12">
              <div className="flex items-center gap-2">
                <GestMilesLogo size={24} variant="light" className="shrink-0" />
                <span className="font-display text-lg font-bold tracking-tight text-white">
                  Gest Miles
                </span>
              </div>
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto bg-white px-4 py-5 dark:bg-gray-50">
              {user ? (
                <>
                  <section className="mb-5">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A05BE]">
                      Conta
                    </p>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-200 dark:bg-gray-100/80">
                      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-600">
                        {displayedAccountLabel}
                      </p>
                      {displayedClientName && (
                        <p className="mt-0.5 text-[12px] font-semibold text-gray-800 dark:text-gray-900">
                          {displayedClientName}
                        </p>
                      )}
                      <SheetClose asChild>
                        <button
                          type="button"
                          onClick={copyAccountId}
                          className="mt-1 flex w-full items-center justify-between gap-2 text-left text-xs font-mono text-gray-900 dark:text-gray-900"
                        >
                          <span className="truncate" title={displayedAccountId}>
                            {displayedAccountId}
                          </span>
                          {idCopied ? (
                            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <Copy className="h-4 w-4 shrink-0 text-[#8A05BE]" />
                          )}
                        </button>
                      </SheetClose>
                    </div>
                    {isViewingClient && user?.id && (
                      <p className="mt-1.5 text-[10px] text-gray-500">
                        Sua conta: <span className="font-mono">{user.id.slice(0, 8)}…</span>
                      </p>
                    )}
                  </section>

                  <section className="mb-5">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A05BE]">
                      Ações rápidas
                    </p>
                    <div className="space-y-0.5">
                      {canOpenClientProfile && (
                        <SheetClose asChild>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                            onClick={() =>
                              navigate(`/perfil?clientId=${encodeURIComponent(activeClientId ?? "")}`)
                            }
                          >
                            <User className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                            <span>Perfil do cliente</span>
                          </button>
                        </SheetClose>
                      )}
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/registrar-emissao")}
                        >
                          <FileEdit className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Registrar Emissão</span>
                        </button>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/alertas/novo")}
                        >
                          <Bell className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Adicionar Alerta</span>
                        </button>
                      </SheetClose>
                      {(role === "gestor" || role === "admin") && (
                        <SheetClose asChild>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                            onClick={() => navigate("/clientes")}
                          >
                            <Users className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                            <span>Clientes</span>
                          </button>
                        </SheetClose>
                      )}
                      {(role === "cs" || role === "admin") && (
                        <SheetClose asChild>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                            onClick={() => navigate("/cs")}
                          >
                            <Users className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                            <span>Painel CS</span>
                          </button>
                        </SheetClose>
                      )}
                      {(role === "admin_equipe" || role === "cs") && (
                        <SheetClose asChild>
                          <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                            onClick={() => navigate("/cs/adicionar-clientes")}
                          >
                            <UserPlus className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                            <span>Adicionar clientes</span>
                          </button>
                        </SheetClose>
                      )}
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/simular-compra-milhas")}
                        >
                          <Calculator className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Simular Compra de Milhas</span>
                        </button>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/radar-oportunidades")}
                        >
                          <Radio className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Radar de Oportunidades</span>
                        </button>
                      </SheetClose>
                    </div>
                  </section>

                  <section className="mb-5">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A05BE]">
                      Saiba mais
                    </p>
                    <div className="space-y-0.5">
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/sobre")}
                        >
                          <Info className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Sobre a GestMiles</span>
                        </button>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/convide-amigos")}
                        >
                          <UserPlus className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Convide Amigos</span>
                        </button>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/duvidas")}
                        >
                          <HelpCircle className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Dúvidas</span>
                        </button>
                      </SheetClose>
                      <SheetClose asChild>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm text-gray-800 transition-colors hover:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200/80"
                          onClick={() => navigate("/fale-conosco")}
                        >
                          <MessageCircle className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                          <span>Fale Conosco</span>
                        </button>
                      </SheetClose>
                    </div>
                  </section>

                  <div className="mt-auto border-t border-gray-200 pt-4 dark:border-gray-200">
                    <SheetClose asChild>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-950/30"
                        onClick={handleLogout}
                      >
                        <LogOut className="h-5 w-5 shrink-0" />
                        <span>Sair</span>
                      </button>
                    </SheetClose>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col justify-center">
                  <p className="mb-4 text-sm text-gray-600 dark:text-gray-600">
                    Entre ou crie uma conta para acessar todos os recursos da GestMiles.
                  </p>
                  <SheetClose asChild>
                    <button
                      type="button"
                      className="w-full rounded-xl bg-[#8A05BE] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-95"
                      onClick={() => navigate("/auth")}
                    >
                      Entrar ou criar conta
                    </button>
                  </SheetClose>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {bannerVisible && (
        <div className="mx-4 mb-2.5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <Zap size={14} className="shrink-0 text-amber-600" aria-hidden />
          {showDemandOpenBanner ? (
            <button
              type="button"
              onClick={goDemandasPendentes}
              className="flex-1 text-left text-[11px] text-amber-800 hover:opacity-90"
            >
              <b>Demandas abertas:</b> {demandSummary.openCount}{" "}
              {demandSummary.openCount === 1 ? "demanda" : "demandas"}{" "}
              {demandSummary.openCount > 0
                ? `(pendentes: ${demandSummary.pendingCount} · andamento: ${demandSummary.inProgressCount})`
                : "no momento."}
            </button>
          ) : (
            <p className="flex-1 text-[11px] leading-snug text-amber-800">
              Bônus de até <span className="font-bold text-amber-700">133%</span> na transferência. Confira
            </p>
          )}
          <button
            onClick={() => setBannerVisible(false)}
            className="shrink-0 text-amber-500 opacity-60 hover:opacity-100"
            aria-label="Fechar"
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
