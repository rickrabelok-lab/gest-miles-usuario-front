import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { AuthFlowShell } from "@/components/auth/AuthFlowShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PENDING_REFERRAL_CODE_KEY } from "@/lib/authFlowStorage";

const SignUp = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromInvite = searchParams.get("fromInvite") === "1";
  const refCode = searchParams.get("ref");
  const { user, loading, signUpWithPassword, signInWithGoogle } = useAuth();

  // Captura o código de indicação (?ref=) antes do cadastro/OAuth; a atribuição
  // acontece após /me (só para conta nova). Ver Me.tsx + indicacao_registrar_self.
  useEffect(() => {
    const code = refCode?.trim();
    if (code) {
      sessionStorage.setItem(PENDING_REFERRAL_CODE_KEY, code);
    }
  }, [refCode]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<"signup" | "google" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isValidEmail = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),
    [email],
  );

  const canSubmit =
    isValidEmail && password.length >= 6 && password === confirmPassword && confirmPassword.length > 0;

  const formatAuthError = (error: unknown): string => {
    const msg = error instanceof Error ? error.message : String(error ?? "");
    if (/failed to fetch|networkerror|load failed|timeout/i.test(msg)) {
      return "Não foi possível criar sua conta agora. Verifique sua conexão e tente de novo.";
    }
    if (/already registered|already exists|user already|email.*exists|email.*registered/i.test(msg)) {
      return "Já existe uma conta com este e-mail. Entre ou recupere sua senha.";
    }
    if (/invalid|weak password|password|email|signup|auth|supabase|jwt|rls|permission|unauthorized|forbidden/i.test(msg)) {
      return "Não foi possível criar a conta com esses dados. Confira e-mail, senha e tente de novo.";
    }
    return "Não foi possível criar sua conta agora. Tente novamente em alguns instantes.";
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
      console.warn("[SignUp] cadastro Google:", error);
      setMessage(formatAuthError(error));
      setPending(false);
      setPendingAction(null);
    }
  };

  const handleSignUp = async () => {
    if (!canSubmit) return;
    setPending(true);
    setPendingAction("signup");
    setMessage(null);
    try {
      const signedIn = await signUpWithPassword(email.trim(), password);
      if (signedIn) {
        setMessage("Conta criada com sucesso. Entrando");
        navigate("/me");
      } else {
        setMessage("Conta criada. Verifique seu e-mail de confirmação para continuar.");
      }
    } catch (error) {
      console.warn("[SignUp] cadastro senha:", error);
      setMessage(formatAuthError(error));
    } finally {
      setPending(false);
      setPendingAction(null);
    }
  };

  const signUpQuery = fromInvite ? "?fromInvite=1" : "";

  return (
    <AuthFlowShell title="Criar conta" description="Preencha os dados abaixo para se cadastrar no Gest Miles.">
      {!isSupabaseConfigured && (
        <p className="rounded-[14px] border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/50 dark:text-amber-100">
          Cadastro indisponível agora. Tente novamente em alguns minutos.
        </p>
      )}
      {fromInvite && (
        <p className="rounded-[14px] border border-nubank-border bg-gradient-primary-subtle px-3 py-2.5 text-xs leading-relaxed text-nubank-text">
          <strong>Convite:</strong> use o <strong>mesmo e-mail</strong> indicado no convite. O papel cliente gestão será
          aplicado após criar a conta.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="signup-email" className="text-[13px] font-semibold text-nubank-text">
          E-mail
        </Label>
        <Input
          id="signup-email"
          type="email"
          className="h-11 rounded-[16px] border-nubank-border text-[15px]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@email.com"
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password" className="text-[13px] font-semibold text-nubank-text">
          Senha
        </Label>
        <Input
          id="signup-password"
          type="password"
          className="h-11 rounded-[16px] border-nubank-border text-[15px]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-confirm" className="text-[13px] font-semibold text-nubank-text">
          Confirmar senha
        </Label>
        <Input
          id="signup-confirm"
          type="password"
          className="h-11 rounded-[16px] border-nubank-border text-[15px]"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repita a senha"
          autoComplete="new-password"
        />
      </div>
      {confirmPassword.length > 0 && password !== confirmPassword && (
        <p className="text-center text-xs text-red-600">As senhas não coincidem.</p>
      )}
      {password.length > 0 && password.length < 6 && (
        <p className="text-center text-xs text-red-600">A senha precisa de pelo menos 6 caracteres.</p>
      )}
      <Button
        type="button"
        className="h-12 w-full rounded-[16px] text-base font-semibold text-primary-foreground shadow-[0_2px_8px_-2px_rgba(138,5,190,0.25)] transition-all duration-300 ease-out gradient-primary hover:opacity-95 hover:shadow-[0_4px_16px_-2px_rgba(138,5,190,0.3)] active:scale-[0.98] disabled:opacity-50"
        disabled={!canSubmit || pending}
        onClick={() => void handleSignUp()}
      >
        {pendingAction === "signup" ? "Criando conta..." : "Criar conta"}
      </Button>
      <div className="border-t border-nubank-border pt-5">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-[16px] border-nubank-border bg-white text-[15px] font-semibold text-nubank-text shadow-sm transition-colors hover:bg-nubank-bg"
          disabled={pending && pendingAction !== "google"}
          onClick={() => void handleGoogle()}
        >
          {pendingAction === "google" ? "Abrindo…" : "Continuar com Google"}
        </Button>
      </div>
      {message && (
        <p className="text-center text-xs leading-relaxed text-nubank-text-secondary" role="status">
          {message}
        </p>
      )}
      <p className="text-center text-sm text-nubank-text-secondary">
        Já tem uma conta?{" "}
        <Link
          to={`/auth${signUpQuery}`}
          className="font-semibold text-nubank-primary underline-offset-4 hover:underline"
        >
          Entrar
        </Link>
      </p>
    </AuthFlowShell>
  );
};

export default SignUp;
