import { Navigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import RequireClienteApp from "@/components/RequireClienteApp";
import Index from "@/pages/Index";
import { adminAppBaseUrl } from "@/lib/staffAppUrls";

/**
 * `/` — clientes veem o dashboard; admin é enviado para o painel Admin (outro front).
 */
const HomeGate = () => {
  const { user, loading, role, roleLoading, roleError, refreshRole } = useAuth();

  if (loading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        A carregar...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (roleError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
          <p className="font-medium text-foreground">Falha ao validar perfil</p>
          <p className="mt-2 text-sm text-muted-foreground">{roleError}</p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => {
              void refreshRole();
            }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (role === "admin") {
    if (typeof window !== "undefined") {
      window.location.replace(`${adminAppBaseUrl()}/login`);
    }
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        A redirecionar para o painel admin…
      </div>
    );
  }

  return (
    <RequireClienteApp>
      <Index />
    </RequireClienteApp>
  );
};

export default HomeGate;
