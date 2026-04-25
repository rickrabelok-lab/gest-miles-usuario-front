import { useMemo, useState } from "react";
import { AuthFlowShell } from "@/components/auth/AuthFlowShell";
import { LoginNavLink } from "@/components/auth/LoginNavLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getApiUrl, hasApiUrl } from "@/services/api";

function friendlyNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Não foi possível contactar a API. Inicie o backend (ex.: na raiz do projeto: pnpm run dev:all, ou noutro terminal: cd backend && pnpm run dev na porta 3000) e tente de novo.";
  }
  return msg;
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
      if (hasApiUrl()) {
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
              ? "API não encontrada (404). Confira se o backend está em execução na URL de VITE_API_URL e se o front não usa a mesma porta que a API (ex.: Vite em :3080, Express em :3000)."
              : res.statusText;
          throw new Error(apiErr ?? hint404);
        }
        setMessage((body as { message?: string }).message ?? "Se o email for cadastrado na Gest Miles, enviaremos instruções.");
        return;
      }

      if (!isSupabaseConfigured) {
        setMessage(
          "Configure VITE_SUPABASE_URL no .env.local ou defina VITE_API_URL com o backend (Brevo + service role) para recuperação por e-mail.",
        );
        return;
      }

      const redirectTo = `${window.location.origin}/auth/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo });
      if (error) throw error;
      setMessage(
        "Se o email for cadastrado na Gest Miles, enviaremos instruções. (E-mail do Supabase Auth; em produção, prefira VITE_API_URL + Brevo.)",
      );
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
      {!hasApiUrl() && (
        <p className="rounded-[14px] border border-amber-500/40 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/50 dark:text-amber-100">
          <strong>E-mail da Supabase:</strong> como <span className="font-mono">VITE_API_URL</span> não está definido no{" "}
          <span className="font-mono">.env.local</span>, o envio usa o template do <strong>Supabase Auth</strong>, não a
          Brevo. Para receber o e-mail pela <strong>Brevo</strong>, defina{" "}
          <span className="font-mono">VITE_API_URL=/</span> (com proxy) ou a URL da API, rode o Express em{" "}
          <span className="font-mono">backend/</span> com <span className="font-mono">BREVO_*</span> e{" "}
          <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>, e reinicie o <span className="font-mono">npm run dev</span>{" "}
          do front.
        </p>
      )}
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
