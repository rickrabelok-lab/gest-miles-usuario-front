import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

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
        role: "cliente",
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 bg-nubank-bg text-sm text-nubank-text-secondary">
      {error ? (
        <>
          <p className="text-center font-medium text-destructive">Erro ao configurar perfil</p>
          <p className="text-center text-muted-foreground">{error}</p>
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            Verifique se o e-mail está confirmado no Supabase (Auth → Users) e se existe um perfil com role &quot;cliente&quot; na tabela perfis.
          </p>
        </>
      ) : (
        "Preparando sua conta..."
      )}
    </div>
  );
};

export default Me;
