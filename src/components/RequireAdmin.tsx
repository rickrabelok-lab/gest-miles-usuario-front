import { Navigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";

type Props = {
  children: JSX.Element;
};

/** Dentro de `RequireAuth`: só usuários com `perfis.role === 'admin'`. */
const RequireAdmin = ({ children }: Props) => {
  const { role, roleLoading, roleError, refreshRole } = useAuth();

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

  if (role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default RequireAdmin;
