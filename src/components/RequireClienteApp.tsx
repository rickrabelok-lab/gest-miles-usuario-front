import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { isClienteAppRole, staffAppEntryUrl } from "@/lib/staffAppUrls";

type Props = {
  children: JSX.Element;
};

/**
 * Dentro de RequireAuth: só clientes (cliente / cliente_gestao) ficam na app.
 * Equipa interna é enviada para Manager ou Admin.
 */
const RequireClienteApp = ({ children }: Props) => {
  const { role, roleLoading } = useAuth();

  useEffect(() => {
    if (roleLoading || !role) return;
    const url = staffAppEntryUrl(role);
    if (url) window.location.replace(url);
  }, [role, roleLoading]);

  if (roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        A carregar perfil...
      </div>
    );
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        A carregar perfil...
      </div>
    );
  }

  if (staffAppEntryUrl(role)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        A redirecionar...
      </div>
    );
  }

  if (!isClienteAppRole(role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <p>Acesso reservado a clientes.</p>
        <p className="max-w-md">Utiliza o painel da equipa no endereço indicado pela tua organização.</p>
      </div>
    );
  }

  return children;
};

export default RequireClienteApp;
