import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginNavLink } from "@/components/auth/LoginNavLink";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl, hasApiUrl } from "@/services/api";
import { PENDING_INVITE_TOKEN_KEY } from "@/lib/authFlowStorage";

function formatInvitePreviewError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (
    /expired|expirad|invalid|inv[aá]lid|not found|404|token|convite/.test(normalized)
  ) {
    return "Este convite está inválido ou expirou. Peça um novo link para seu gestor.";
  }

  return "Não foi possível validar este convite agora. Tente novamente em instantes.";
}

const AcceptInvite = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [emailMasked, setEmailMasked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const loadInvitePreview = useCallback(async () => {
    if (!token) {
      setError("Link de convite incompleto.");
      return;
    }

    if (!hasApiUrl()) {
      setError("Não foi possível validar este convite agora. Tente novamente em instantes.");
      return;
    }

    setLoadingPreview(true);
    setError(null);
    setEmailMasked(null);

    try {
      const res = await fetch(getApiUrl("/api/invites/preview") + "?token=" + encodeURIComponent(token));
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? "Convite inválido");
      setEmailMasked((body as { emailMasked?: string }).emailMasked ?? "****@****");
      sessionStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);
    } catch (e) {
      console.warn("[AcceptInvite] preview:", e);
      setError(formatInvitePreviewError(e));
    } finally {
      setLoadingPreview(false);
    }
  }, [token]);

  useEffect(() => {
    void loadInvitePreview();
  }, [loadInvitePreview]);

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
          <CardTitle className="text-xl text-nubank-text">Convite - cliente gestão</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingPreview && (
            <p className="text-sm text-muted-foreground">Validando convite...</p>
          )}
          {error && (
            <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => void loadInvitePreview()}
                disabled={loadingPreview}
              >
                Tentar novamente
              </Button>
            </div>
          )}
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
