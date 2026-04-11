import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AuthFlowShell } from "@/components/auth/AuthFlowShell";
import { LoginNavLink } from "@/components/auth/LoginNavLink";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getApiUrl, hasApiUrl } from "@/services/api";

function hashLooksLikeSupabaseRecovery(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hash;
  return /type=recovery|type%3Drecovery/.test(h);
}

const ResetPassword = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const navigate = useNavigate();
  const { signOut } = useAuth();
  /** Fluxo nativo Supabase (link do e-mail Auth) — sem token na query. */
  const [supabaseRecovery, setSupabaseRecovery] = useState(false);
  const [recoveryCheckDone, setRecoveryCheckDone] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      setRecoveryCheckDone(true);
      return;
    }
    if (hashLooksLikeSupabaseRecovery()) {
      setSupabaseRecovery(true);
      setRecoveryCheckDone(true);
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setSupabaseRecovery(true);
        setRecoveryCheckDone(true);
      }
    });
    const t = window.setTimeout(() => setRecoveryCheckDone(true), 800);
    return () => {
      subscription.unsubscribe();
      window.clearTimeout(t);
    };
  }, [token]);

  useEffect(() => {
    if (!supabaseRecovery || token) return;
    void supabase.auth.getSession().then(({ data }) => {
      const em = data.session?.user?.email;
      if (em) setRecoveryEmail(em);
    });
  }, [supabaseRecovery, token]);

  const submit = async () => {
    setMessage(null);
    if (password.length < 6) {
      setMessage("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("As senhas não coincidem.");
      return;
    }

    setPending(true);
    try {
      if (token) {
        if (!hasApiUrl()) {
          setMessage("Configure VITE_API_URL para concluir a recuperação (fluxo Brevo).");
          return;
        }
        const res = await fetch(getApiUrl("/api/auth/complete-password-reset"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? res.statusText);
        setMessage("Senha alterada. Você já pode entrar.");
        setTimeout(() => {
          void (async () => {
            await signOut();
            navigate("/auth", { replace: true });
          })();
        }, 2000);
        return;
      }

      if (!supabaseRecovery || !isSupabaseConfigured) {
        setMessage("Sessão de recuperação não encontrada. Peça um novo link em Esqueci a senha.");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage("Senha alterada. Você já pode entrar.");
      setTimeout(() => {
        void (async () => {
          await signOut();
          navigate("/auth", { replace: true });
        })();
      }, 2000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erro");
    } finally {
      setPending(false);
    }
  };

  if (!token && !recoveryCheckDone) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 bg-nubank-bg p-5">
        <p className="font-display text-[1.35rem] font-bold tracking-tight text-nubank-primary">Gest Miles</p>
        <p className="text-sm text-nubank-text-secondary">A carregar…</p>
      </div>
    );
  }

  if (!token && !supabaseRecovery) {
    return (
      <AuthFlowShell title="Link inválido" description="O link expirou ou já foi utilizado. Peça um novo e-mail de recuperação.">
        <Button
          asChild
          className="h-12 w-full rounded-[16px] text-base font-semibold text-primary-foreground shadow-[0_2px_8px_-2px_rgba(138,5,190,0.25)] transition-all duration-300 ease-out gradient-primary hover:opacity-95"
        >
          <Link to="/auth/forgot-password">Pedir novo link</Link>
        </Button>
        <p className="text-center text-sm text-nubank-text-secondary">
          <LoginNavLink>Voltar ao login</LoginNavLink>
        </p>
      </AuthFlowShell>
    );
  }

  return (
    <AuthFlowShell title="Redefinir senha" description="Digite a sua nova senha para continuar.">
      {recoveryEmail ? (
        <div className="space-y-2">
          <Label htmlFor="recovery-email" className="text-[13px] font-semibold text-nubank-text">
            E-mail
          </Label>
          <Input
            id="recovery-email"
            type="email"
            readOnly
            disabled
            value={recoveryEmail}
            className="h-11 cursor-not-allowed rounded-[16px] border-nubank-border bg-nubank-bg/80 text-[15px] text-nubank-text-secondary"
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="new-password" className="text-[13px] font-semibold text-nubank-text">
          Nova senha
        </Label>
        <Input
          id="new-password"
          type="password"
          className="h-11 rounded-[16px] border-nubank-border text-[15px]"
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password" className="text-[13px] font-semibold text-nubank-text">
          Confirmar nova senha
        </Label>
        <Input
          id="confirm-password"
          type="password"
          className="h-11 rounded-[16px] border-nubank-border text-[15px]"
          placeholder="Repita a senha"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <Button
        type="button"
        className="h-12 w-full rounded-[16px] text-base font-semibold text-primary-foreground shadow-[0_2px_8px_-2px_rgba(138,5,190,0.25)] transition-all duration-300 ease-out gradient-primary hover:opacity-95 hover:shadow-[0_4px_16px_-2px_rgba(138,5,190,0.3)] active:scale-[0.98] disabled:opacity-50"
        disabled={pending}
        onClick={() => void submit()}
      >
        {pending ? "Salvando" : "Redefinir senha"}
      </Button>
      {message && <p className="text-center text-xs leading-relaxed text-nubank-text-secondary">{message}</p>}
      <p className="text-center text-sm text-nubank-text-secondary">
        Lembra-se da senha? <LoginNavLink>Entrar</LoginNavLink>
      </p>
    </AuthFlowShell>
  );
};

export default ResetPassword;
