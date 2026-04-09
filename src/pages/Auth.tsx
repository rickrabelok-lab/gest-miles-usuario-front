import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabase";

const Auth = () => {
  const navigate = useNavigate();
  const {
    user,
    loading,
    signInWithGoogle,
    signInWithMagicLink,
    signInWithPassword,
    signUpWithPassword,
  } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isValidEmail = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    [email],
  );

  const formatAuthError = (error: unknown): string => {
    const msg = error instanceof Error ? error.message : "Falha no login.";
    if (/failed to fetch/i.test(msg)) {
      return [
        "Não foi possível contactar o Supabase (rede ou URL).",
        "Confira no .env.local: VITE_SUPABASE_URL (https://….supabase.co) e VITE_SUPABASE_ANON_KEY;",
        "reinicie o npm run dev após alterar o .env;",
        "no painel Supabase, confirme se o projeto não está pausado.",
      ].join(" ");
    }
    return msg;
  };

  if (!loading && user) {
    return <Navigate to="/me" replace />;
  }

  const handleMagicLink = async () => {
    if (!isValidEmail) return;
    setPending(true);
    setMessage(null);
    try {
      await signInWithMagicLink(email.trim());
      setMessage("Link mágico enviado. Verifique seu e-mail.");
    } catch (error) {
      setMessage(formatAuthError(error));
    } finally {
      setPending(false);
    }
  };

  const handleGoogle = async () => {
    setPending(true);
    setMessage(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setMessage(formatAuthError(error));
      setPending(false);
    }
  };

  const handleLogin = async () => {
    if (!isValidEmail || password.length < 6) return;
    setPending(true);
    setMessage(null);
    try {
      const ok = await signInWithPassword(email.trim(), password);
      setMessage("Login realizado com sucesso.");
      if (ok) navigate("/me");
    } catch (error) {
      setMessage(formatAuthError(error));
    } finally {
      setPending(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!isValidEmail || password.length < 6) return;
    setPending(true);
    setMessage(null);
    try {
      const signedIn = await signUpWithPassword(email.trim(), password);
      if (signedIn) {
        setMessage("Conta criada com sucesso. Entrando...");
        navigate("/me");
      } else {
        setMessage(
          "Conta criada, mas o projeto ainda exige confirmação por e-mail no Supabase. Desative 'Confirm email' em Authentication > Providers > Email para entrar direto.",
        );
      }
    } catch (error) {
      setMessage(formatAuthError(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-nubank-bg p-5">
      <Card className="w-full max-w-sm gradient-card-subtle shadow-nubank">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-2xl font-bold tracking-tight text-nubank-text">Login e criação de conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSupabaseConfigured && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              Supabase não configurado: edite <span className="font-mono">.env.local</span> na raiz do projeto com{" "}
              <span className="font-mono">VITE_SUPABASE_URL</span> e <span className="font-mono">VITE_SUPABASE_ANON_KEY</span>{" "}
              (valores em Supabase → Project Settings → API) e reinicie o servidor de desenvolvimento.
            </p>
          )}
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@email.com"
          />
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Senha (mínimo 6 caracteres)"
          />
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              className="w-full"
              onClick={handleLogin}
              disabled={!isValidEmail || password.length < 6 || pending}
            >
              Entrar
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={handleCreateAccount}
              disabled={!isValidEmail || password.length < 6 || pending}
            >
              Criar conta
            </Button>
          </div>
          {password.length > 0 && password.length < 6 && (
            <p className="text-xs text-red-600">
              A senha precisa ter no mínimo 6 caracteres.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleMagicLink}
            disabled={!isValidEmail || pending}
          >
            Entrar com Magic Link
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={handleGoogle}
            disabled={pending}
          >
            Entrar com Google
          </Button>
          {message && (
            <p className="text-xs text-muted-foreground" role="status">
              {message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
