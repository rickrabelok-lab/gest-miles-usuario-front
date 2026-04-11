import { Navigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";

type Props = {
  children: JSX.Element;
};

/** Dentro de `RequireAuth`: só utilizadores com `perfis.role === 'admin'`. */
const RequireAdmin = ({ children }: Props) => {
  const { role, roleLoading } = useAuth();

  if (roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        A carregar perfil...
      </div>
    );
  }

  if (role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default RequireAdmin;
