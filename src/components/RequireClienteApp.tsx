import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { isClienteAppRole, staffAppEntryUrl } from "@/lib/staffAppUrls";

type Props = {
  children: JSX.Element;
};

/**
 * Dentro de RequireAuth: só clientes (cliente / cliente_gestao) ficam na app.
 * Equipe interna é enviada para Manager ou Admin.
 */
const RequireClienteApp = ({ children }: Props) => {
  const { role, roleLoading, roleError, refreshRole } = useAuth();

  useEffect(() => {
    if (roleLoading || !role) return;
    const url = staffAppEntryUrl(role);
    if (url) window.location.replace(url);
  }, [role, roleLoading]);

  if (roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando perfil...
      </div>
    );
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

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando perfil...
      </div>
    );
  }

  if (staffAppEntryUrl(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Redirecionando...
      </div>
    );
  }

  if (!isClienteAppRole(role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <p>Acesso reservado a clientes.</p>
        <p className="max-w-md">Use o painel da equipe no endereço indicado pela sua organização.</p>
      </div>
    );
  }

  return children;
};

export default RequireClienteApp;
