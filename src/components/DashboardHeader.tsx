import { User, Menu, X, Zap, LogIn, LogOut, Copy, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const getInitials = (email: string | undefined) => {
  if (!email) return "?";
  const part = email.split("@")[0] ?? "";
  const letters = part.replace(/[^a-z]/gi, "").slice(0, 2);
  return (letters || "?").toUpperCase();
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
  const { user, role, signOut } = useAuth();
  const isGestorView = role === "gestor" || role === "admin";

  useEffect(() => {
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
        .from("gestor_clientes")
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
  }, [isGestorView, user?.id]);

  useEffect(() => {
    if (!isGestorView || managedClientIds.length === 0) {
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
      .channel(`header-demandas-open-${Date.now()}`)
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
  }, [isGestorView, managedClientIds, managedClientNames]);

  const copyAccountId = () => {
    if (!user?.id) return;
    navigator.clipboard.writeText(user.id).then(() => {
      setIdCopied(true);
      toast.success("ID da conta copiado. Envie ao gestor para solicitar acesso.");
      setTimeout(() => setIdCopied(false), 2000);
    }).catch(() => toast.error("Não foi possível copiar."));
  };

  const handleLogout = async () => {
    try {
      await signOut();
      navigate("/");
    } catch {
      navigate("/");
    }
  };

  return (
    <div className="gradient-primary text-header-foreground">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-3.5 pb-3.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-[16px] bg-white/15 px-3 py-2 text-sm font-medium backdrop-blur-sm transition-all duration-200 hover:bg-white/25"
            >
              <User size={16} />
              <span>{user ? getInitials(user.email) : "?"}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            {user ? (
              <>
                <DropdownMenuItem disabled className="text-muted-foreground">
                  <span className="truncate">{user.email}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/perfil")}>
                  Meu perfil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={() => navigate("/auth")}>
                  <LogIn className="mr-2 h-4 w-4" />
                  Entrar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/auth")}>
                  Criar conta
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <h1 className="font-display text-xl font-bold tracking-tight">MilesHub</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-[16px] p-2 transition-all duration-200 hover:bg-white/20"
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-72">
            {user ? (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  ID da sua conta (para o gestor solicitar acesso)
                </div>
                <DropdownMenuItem
                  onClick={copyAccountId}
                  className="cursor-pointer font-mono text-xs"
                >
                  <span className="truncate flex-1" title={user.id}>
                    {user.id}
                  </span>
                  {idCopied ? (
                    <Check className="ml-2 h-4 w-4 shrink-0 text-green-600" />
                  ) : (
                    <Copy className="ml-2 h-4 w-4 shrink-0" />
                  )}
                </DropdownMenuItem>
                <div className="px-2 py-1 text-[11px] text-muted-foreground">
                  Clique para copiar. O gestor usará este ID para solicitar acesso; você aceita no app.
                </div>
              </>
            ) : (
              <DropdownMenuItem onClick={() => navigate("/auth")}>
                Criar conta
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Promo banner */}
      {bannerVisible && (
        <div className="mx-4 mb-2.5 flex items-center gap-2 rounded-[14px] border border-white/20 bg-white/95 px-3 py-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
          <Zap size={18} className="shrink-0 text-warning" />
          {isGestorView ? (
            <button
              type="button"
              onClick={() => navigate("/gestor?tab=demandas&status=pendente")}
              className="flex-1 text-left text-sm text-nubank-text hover:opacity-90"
            >
              <span className="font-semibold text-warning">Demandas abertas:</span>{" "}
              {demandSummary.openCount}{" "}
              {demandSummary.openCount === 1 ? "demanda" : "demandas"}{" "}
              {demandSummary.openCount > 0
                ? `(pendentes: ${demandSummary.pendingCount} • em andamento: ${demandSummary.inProgressCount})`
                : "no momento."}{" "}
              {demandSummary.lastClientName ? `Última de ${demandSummary.lastClientName}.` : ""}
            </button>
          ) : (
            <p className="flex-1 text-sm text-nubank-text">
              Bônus de até <span className="font-bold text-warning">133%</span> na transferência.
              Confira
            </p>
          )}
          <button onClick={() => setBannerVisible(false)} className="shrink-0 rounded-full p-1 text-nubank-text-secondary opacity-70 hover:bg-black/5 hover:opacity-100" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default DashboardHeader;
