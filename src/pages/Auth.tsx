import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { AuthFlowShell } from "@/components/auth/AuthFlowShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { isEmailNotConfirmedError } from "@/lib/authErrors";
import { isSupabaseConfigured } from "@/lib/supabase";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromInvite = searchParams.get("fromInvite") === "1";
  const { user, loading, signInWithGoogle, signInWithPassword, resendConfirmation } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<"login" | "google" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

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
        <p className="text-sm text-nubank-text-secondary">Carregando...</p>
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
    setNeedsConfirmation(false);
    try {
      const ok = await signInWithPassword(email.trim(), password);
      setMessage("Login realizado com sucesso.");
      if (ok) navigate("/me");
    } catch (error) {
      console.warn("[Auth] login senha:", error);
      if (isEmailNotConfirmedError(error)) {
        setNeedsConfirmation(true);
        setMessage("Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada (e o spam).");
      } else {
        setMessage(formatAuthError(error));
      }
    } finally {
      setPending(false);
      setPendingAction(null);
    }
  };

  const handleResend = async () => {
    if (!isValidEmail) return;
    setPending(true);
    try {
      await resendConfirmation(email.trim());
      setMessage("Reenviamos o e-mail de confirmação. Verifique a caixa de entrada e o spam.");
    } catch (error) {
      console.warn("[Auth] reenvio de confirmação:", error);
      setMessage("Não foi possível reenviar agora. Tente novamente em alguns instantes.");
    } finally {
      setPending(false);
    }
  };

  const signUpHref = fromInvite ? "/auth/sign-up?fromInvite=1" : "/auth/sign-up";

  return (
    <AuthFlowShell
      title=""
      description="Suas milhas, saldos e emissões — tudo num lugar só, com a sua gestão junto."
    >
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
      <div className="rounded-[16px] border border-nubank-border bg-white px-4 py-2.5 transition-shadow focus-within:border-nubank-primary focus-within:shadow-[0_0_0_3px_rgba(138,5,190,0.1)]">
        <Label
          htmlFor="auth-email"
          className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
        >
          E-mail
        </Label>
        <Input
          id="auth-email"
          type="email"
          className="h-7 rounded-none border-0 bg-transparent p-0 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="voce@email.com"
          autoComplete="email"
        />
      </div>
      <div>
        <div className="rounded-[16px] border border-nubank-border bg-white px-4 py-2.5 transition-shadow focus-within:border-nubank-primary focus-within:shadow-[0_0_0_3px_rgba(138,5,190,0.1)]">
          <Label
            htmlFor="auth-password"
            className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            Senha
          </Label>
          <Input
            id="auth-password"
            type="password"
            className="h-7 rounded-none border-0 bg-transparent p-0 text-[15px] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mínimo 6 caracteres"
            autoComplete="current-password"
          />
        </div>
        <div className="mt-2.5 flex justify-end">
          <Link
            to="/auth/forgot-password"
            className="text-[13px] font-semibold text-nubank-primary underline-offset-4 hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>
      </div>
      <Button
        type="button"
        className="h-[52px] w-full rounded-[18px] text-[15.5px] font-bold text-primary-foreground shadow-[0_6px_18px_-4px_rgba(138,5,190,0.5)] transition-all duration-300 ease-out gradient-primary hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
        disabled={!canSubmit || pending}
        onClick={() => void handleLogin()}
      >
        {pendingAction === "login" ? "Entrando" : "Entrar"}
      </Button>
      {password.length > 0 && password.length < 6 && (
        <p className="text-center text-xs text-destructive">A senha precisa de pelo menos 6 caracteres.</p>
      )}
      <div className="flex items-center gap-3 text-nubank-text-secondary/70">
        <span className="h-px flex-1 bg-[#E4E3E8]" />
        <span className="text-xs font-medium">ou</span>
        <span className="h-px flex-1 bg-[#E4E3E8]" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-[50px] w-full gap-2.5 rounded-[16px] border-nubank-border bg-white text-sm font-semibold text-nubank-text shadow-none transition-colors hover:bg-white/70"
        disabled={pending && pendingAction !== "google"}
        onClick={() => void handleGoogle()}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-2 3.3-4.9 3.3-8.2z" />
          <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.6H2.1v2.9A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.8 14a6.6 6.6 0 0 1 0-4.2V6.9H2.1a11 11 0 0 0 0 10z" />
          <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 6.9L5.8 9.8c.9-2.7 3.3-4.4 6.2-4.4z" />
        </svg>
        {pendingAction === "google" ? "Abrindo…" : "Continuar com Google"}
      </Button>
      {message && (
        <p className="text-center text-xs leading-relaxed text-nubank-text-secondary" role="status">
          {message}
        </p>
      )}
      {needsConfirmation && (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-[16px] border-nubank-border bg-white text-[15px] font-semibold text-nubank-text shadow-sm transition-colors hover:bg-nubank-bg"
          disabled={pending || !isValidEmail}
          onClick={() => void handleResend()}
        >
          Reenviar e-mail de confirmação
        </Button>
      )}
      <p className="pt-1 text-center text-[13.5px] text-nubank-text-secondary">
        Não tem uma conta?{" "}
        <Link to={signUpHref} className="font-bold text-nubank-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </AuthFlowShell>
  );
};

export default Auth;
