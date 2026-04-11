import { Navigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import RequireClienteApp from "@/components/RequireClienteApp";
import Index from "@/pages/Index";
import { adminAppBaseUrl } from "@/lib/staffAppUrls";

/**
 * `/` — clientes veem o dashboard; admin é enviado para o painel Admin (outro front).
 */
const HomeGate = () => {
  const { user, loading, role, roleLoading } = useAuth();

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
