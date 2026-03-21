import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const Me = () => {
  const { user, loading, refreshRole } = useAuth();
  const navigate = useNavigate();
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fallbackSlug = useMemo(() => {
    const fromEmail = user?.email?.split("@")[0] ?? "usuario";
    return slugify(fromEmail) || `user-${Date.now().toString().slice(-6)}`;
  }, [user?.email]);

  useEffect(() => {
    if (loading || !user) return;

    const run = async () => {
      const { data: existing, error: existingError } = await supabase
        .from("perfis")
        .select("slug")
        .eq("usuario_id", user.id)
        .maybeSingle();

      if (existingError) {
        setError(existingError.message);
        return;
      }

      if (existing?.slug) {
        await refreshRole();
        setRedirectTo("/");
        return;
      }

      let slug = fallbackSlug;
      let attempt = 0;
      while (attempt < 5) {
        const { data: collision } = await supabase
          .from("perfis")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (!collision) break;
        attempt += 1;
        slug = `${fallbackSlug}-${attempt + 1}`;
      }

      const { error: insertError } = await supabase.from("perfis").insert({
        usuario_id: user.id,
        slug,
        nome_completo: user.user_metadata?.full_name ?? user.email ?? "Usuário",
      });

      if (insertError) {
        setError(insertError.message);
        return;
      }

      await refreshRole();
      setRedirectTo("/");
    };

    run();
  }, [fallbackSlug, loading, refreshRole, user]);

  if (!loading && !user) return <Navigate to="/auth" replace />;
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {error ? (
        <div className="text-center">
          <p className="font-medium text-destructive">Erro ao configurar perfil</p>
          <p className="text-xs text-muted-foreground break-all">{error}</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => navigate("/")}
          >
            Voltar para a tela inicial
          </button>
        </div>
      ) : (
        "Preparando sua conta..."
      )}
    </div>
  );
};

export default Me;
