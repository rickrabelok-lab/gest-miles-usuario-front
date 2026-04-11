import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type LoginNavLinkProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Leva a /auth depois de signOut, para não cair no redirect automático para /me com sessão antiga.
 */
export function LoginNavLink({ children, className }: LoginNavLinkProps) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      className={cn(
        "inline cursor-pointer border-0 bg-transparent p-0 text-center font-semibold text-nubank-primary underline-offset-4 hover:underline disabled:cursor-wait disabled:opacity-70",
        className,
      )}
      onClick={() => {
        void (async () => {
          setBusy(true);
          try {
            await signOut();
          } catch {
            // Mesmo com erro, tentamos mostrar o ecrã de login
          }
          navigate("/auth", { replace: true });
        })();
      }}
    >
      {busy ? "A sair…" : children}
    </button>
  );
}
