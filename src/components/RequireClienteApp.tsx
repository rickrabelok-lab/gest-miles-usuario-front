import { type PropsWithChildren, useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { isClienteAppRole, staffWebAppBaseUrlForRole } from "@/lib/staffAppUrls";

/**
 * Restringe o app de utilizadores a `cliente` e `cliente_gestao`.
 * CS / gestor / admin_equipe → redireciona para o front Manager; `admin` → front Admin.
 * Deve ser usado dentro de `RequireAuth` (utilizador já autenticado).
 */
const RequireClienteApp = ({ children }: PropsWithChildren) => {
  const { user, role, roleLoading } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!user || roleLoading) return;
    const base = staffWebAppBaseUrlForRole(role);
    if (base) {
      setRedirecting(true);
      window.location.replace(`${base}/auth`);
    }
  }, [user, role, roleLoading]);

  if (!user) {
    return null;
  }

  if (roleLoading || redirecting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-nubank-bg px-4 text-center text-sm text-nubank-text-secondary">
        <p className="font-display text-[1.35rem] font-bold tracking-tight text-nubank-primary">Gest Miles</p>
        <p>{redirecting ? "A redirecionar para o painel operacional…" : "A validar perfil…"}</p>
      </div>
    );
  }

  if (!isClienteAppRole(role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-nubank-bg px-4 text-center text-sm text-nubank-text-secondary">
        <p className="font-medium text-nubank-text">Acesso reservado a clientes.</p>
        <p className="max-w-sm text-xs">Se é equipa interna, utilize o painel Manager ou Admin (URL configurada pelo projeto).</p>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireClienteApp;
