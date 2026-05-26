import { useMemo, useState } from "react";
import { AuthFlowShell } from "@/components/auth/AuthFlowShell";
import { LoginNavLink } from "@/components/auth/LoginNavLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getApiUrl, hasAbsoluteApiUrl } from "@/services/api";

function friendlyNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn("[ForgotPassword] request:", err);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Não conseguimos enviar o link agora. Tente novamente em instantes.";
  }
  if (/api não encontrada|404|vite_api_url|supabase_service_role_key|brevo|backend|express|env/i.test(msg)) {
    return "A recuperação de senha está indisponível no momento. Tente novamente em instantes.";
  }
  return "Não conseguimos enviar o link agora. Tente novamente em instantes.";
}

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isValidEmail = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);

  const submit = async () => {
    setMessage(null);
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setMessage("Informe um e-mail válido.");
      return;
    }

    setPending(true);
    try {
      if (hasAbsoluteApiUrl()) {
        const res = await fetch(getApiUrl("/api/auth/request-password-reset"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: em }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const apiErr = (body as { error?: string }).error;
          const hint404 =
            res.status === 404
              ? "Recuperação de senha indisponível no momento."
              : res.statusText;
          throw new Error(apiErr ?? hint404);
        }
        setMessage("Se o e-mail for cadastrado na Gest Miles, enviaremos instruções.");
        return;
      }

      if (!isSupabaseConfigured) {
        setMessage(
          "A recuperação de senha está indisponível no momento. Tente novamente em instantes.",
        );
        return;
      }

      const appOrigin = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, "") || window.location.origin;
      const redirectTo = `${appOrigin}/auth/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo });
      if (error) throw error;
      setMessage("Se o e-mail for cadastrado na Gest Miles, enviaremos o link de recuperação em instantes.");
    } catch (e) {
      setMessage(friendlyNetworkError(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthFlowShell
      title="Recuperar senha"
      description="Digite o seu e-mail para receber um link de recuperação."
    >
      <div className="space-y-2">
        <Label htmlFor="forgot-email" className="text-[13px] font-semibold text-nubank-text">
          E-mail
        </Label>
        <Input
          id="forgot-email"
          type="email"
          className="h-11 rounded-[16px] border-nubank-border text-[15px]"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <Button
        type="button"
        className="h-12 w-full rounded-[16px] text-base font-semibold text-primary-foreground shadow-[0_2px_8px_-2px_rgba(138,5,190,0.25)] transition-all duration-300 ease-out gradient-primary hover:opacity-95 hover:shadow-[0_4px_16px_-2px_rgba(138,5,190,0.3)] active:scale-[0.98] disabled:opacity-50"
        disabled={!isValidEmail || pending}
        onClick={() => void submit()}
      >
        {pending ? "Enviando" : "Enviar link de recuperação"}
      </Button>
      {message && (
        <p className="text-center text-xs leading-relaxed text-nubank-text-secondary" role="status">
          {message}
        </p>
      )}
      <div className="border-t border-nubank-border pt-1">
        <p className="text-center text-sm text-nubank-text-secondary">
          <LoginNavLink>Voltar ao login</LoginNavLink>
        </p>
      </div>
    </AuthFlowShell>
  );
};

export default ForgotPassword;
