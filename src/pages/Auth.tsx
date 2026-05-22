import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { AuthFlowShell } from "@/components/auth/AuthFlowShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabase";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromInvite = searchParams.get("fromInvite") === "1";
  const { user, loading, signInWithGoogle, signInWithPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<"login" | "google" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isValidEmail = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    [email],
  );

  const canSubmit = isValidEmail && password.length >= 6;

  const formatAuthError = (error: unknown): string => {
    const msg = error instanceof Error ? error.message : String(error ?? "");
    if (/failed to fetch|networkerror|load failed|timeout/i.test(msg)) {
      return "Não foi possível entrar agora. Verifique sua conexão e tente de novo em alguns instantes.";
    }
    if (/invalid login credentials|invalid credentials|email not confirmed|email.*confirm|otp|token|expired|unauthorized|forbidden|auth|supabase|jwt|rls|permission/i.test(msg)) {
      return "Não foi possível entrar com esses dados. Confira e-mail, senha e confirmação da conta.";
    }
    return "Não foi possível entrar agora. Tente novamente em alguns instantes.";
  };

  if (!loading && user) {
    return <Navigate to="/me" replace />;
  }

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 bg-nubank-bg p-5">
        <p className="font-display text-[1.35rem] font-bold tracking-tight text-nubank-primary">Gest Miles</p>
        <p className="text-sm text-nubank-text-secondary">A carregar…</p>
      </div>
    );
  }

  const handleGoogle = async () => {
    setPending(true);
    setPendingAction("google");
    setMessage(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.warn("[Auth] login Google:", error);
      setMessage(formatAuthError(error));
      setPending(false);
      setPendingAction(null);
    }
  };

  const handleLogin = async () => {
    if (!canSubmit) return;
    setPending(true);
    setPendingAction("login");
    setMessage(null);
    try {
      const ok = await signInWithPassword(email.trim(), password);
      setMessage("Login realizado com sucesso.");
      if (ok) navigate("/me");
    } catch (error) {
      console.warn("[Auth] login senha:", error);
      setMessage(formatAuthError(error));
    } finally {
      setPending(false);
      setPendingAction(null);
    }
  };

  const signUpHref = fromInvite ? "/auth/sign-up?fromInvite=1" : "/auth/sign-up";

  return (
    <AuthFlowShell title="Login" description="Entre com as suas credenciais para aceder ao sistema.">
      {!isSupabaseConfigured && (
        <p className="rounded-[14px] border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/50 dark:text-amber-100">
          Login indisponível agora. Tente novamente em alguns minutos.
        </p>
      )}
      {fromInvite && (
        <p className="rounded-[14px] border border-nubank-border bg-gradient-primary-subtle px-3 py-2.5 text-xs leading-relaxed text-nubank-text">
          <strong>Convite:</strong> use o <strong>mesmo e-mail</strong> do convite. O papel cliente gestão será aplicado após criar a conta.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="auth-email" className="text-[13px] font-semibold text-nubank-text">
          E-mail
        </Label>
        <Input
          id="auth-email"
          type="email"
          className="h-11 rounded-[16px] border-nubank-border text-[15px]"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@email.com"
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="auth-password" className="text-[13px] font-semibold text-nubank-text">
          Senha
        </Label>
        <Input
          id="auth-password"
          type="password"
          className="h-11 rounded-[16px] border-nubank-border text-[15px]"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Mínimo 6 caracteres"
          autoComplete="current-password"
        />
      </div>
      <div className="flex justify-end pt-0.5">
        <Link
          to="/auth/forgot-password"
          className="text-sm font-semibold text-nubank-primary underline-offset-4 hover:underline"
        >
          Esqueci minha senha
        </Link>
      </div>
      <Button
        type="button"
        className="h-12 w-full rounded-[16px] text-base font-semibold text-primary-foreground shadow-[0_2px_8px_-2px_rgba(138,5,190,0.25)] transition-all duration-300 ease-out gradient-primary hover:opacity-95 hover:shadow-[0_4px_16px_-2px_rgba(138,5,190,0.3)] active:scale-[0.98] disabled:opacity-50"
        disabled={!canSubmit || pending}
        onClick={() => void handleLogin()}
      >
        {pendingAction === "login" ? "Entrando" : "Entrar"}
      </Button>
      {password.length > 0 && password.length < 6 && (
        <p className="text-center text-xs text-red-600">A senha precisa de pelo menos 6 caracteres.</p>
      )}
      <div className="border-t border-nubank-border pt-5">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-[16px] border-nubank-border bg-white text-[15px] font-semibold text-nubank-text shadow-sm transition-colors hover:bg-nubank-bg"
          disabled={pending && pendingAction !== "google"}
          onClick={() => void handleGoogle()}
        >
          {pendingAction === "google" ? "A abrir…" : "Entrar com Google"}
        </Button>
      </div>
      {message && (
        <p className="text-center text-xs leading-relaxed text-nubank-text-secondary" role="status">
          {message}
        </p>
      )}
      <p className="text-center text-sm text-nubank-text-secondary">
        Não tem uma conta?{" "}
        <Link
          to={signUpHref}
          className="font-semibold text-nubank-primary underline-offset-4 hover:underline"
        >
          Cadastre-se
        </Link>
      </p>
    </AuthFlowShell>
  );
};

export default Auth;
