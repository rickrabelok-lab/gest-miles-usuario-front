import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginNavLink } from "@/components/auth/LoginNavLink";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl, hasApiUrl } from "@/services/api";
import { PENDING_INVITE_TOKEN_KEY } from "@/lib/authFlowStorage";

const AcceptInvite = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [emailMasked, setEmailMasked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !hasApiUrl()) {
      if (!hasApiUrl()) setError("Configure VITE_API_URL (backend) para validar o convite.");
      else setError("Token em falta.");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`${getApiUrl("/api/invites/preview")}?token=${encodeURIComponent(token)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? "Convite inválido");
        setEmailMasked((body as { emailMasked?: string }).emailMasked ?? "****@****");
        sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro");
      }
    })();
  }, [token]);

  const goRegister = () => {
    void (async () => {
      try {
        await signOut();
      } catch {
        // continua para o login / cadastro com convite
      }
      navigate("/auth/sign-up?fromInvite=1");
    })();
  };

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 p-5">
        <p className="text-sm text-muted-foreground">Link de convite incompleto.</p>
        <LoginNavLink className="text-sm">Ir ao login</LoginNavLink>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-nubank-bg p-5">
      <Card className="w-full max-w-sm gradient-card-subtle shadow-nubank">
        <CardHeader>
          <CardTitle className="text-xl text-nubank-text">Convite — cliente gestão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && emailMasked && (
            <>
              <p className="text-sm text-muted-foreground">
                Este convite é para <strong>{emailMasked}</strong>. Crie a conta com <strong>o mesmo e-mail</strong>.
              </p>
              <Button type="button" className="w-full" onClick={goRegister}>
                Continuar para cadastro / login
              </Button>
            </>
          )}
          <LoginNavLink className="px-0 text-sm font-normal">Voltar</LoginNavLink>
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvite;
