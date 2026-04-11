import { useState } from "react";
import { Mail } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { apiFetch, hasApiUrl } from "@/services/api";
import { toast } from "sonner";

/**
 * Convite por e-mail para novo utilizador com papel cliente_gestão (requer backend + Brevo).
 */
export default function GestorConviteGestaoCard() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  const send = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("E-mail inválido");
      return;
    }
    if (!hasApiUrl()) {
      toast.error("Configure VITE_API_URL no front e o backend com Brevo / service role.");
      return;
    }
    setPending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada");
        return;
      }
      await apiFetch<{ ok: boolean }>("/api/invites/convidar", {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
        token,
      });
      toast.success("Convite enviado por e-mail.");
      setEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar convite");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="mb-4 rounded-xl border-violet-500/30 bg-white/95 shadow-nubank dark:border-border dark:bg-card">
      <CardHeader className="pb-2 pt-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Mail className="h-4 w-4 text-violet-600" />
          Convidar cliente gestão
        </p>
        <p className="text-xs text-muted-foreground">
          Envia um convite para criar conta com papel <strong>cliente gestão</strong> na sua equipa. Requer API e e-mail
          (Brevo) configurados.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-end">
        <Input
          type="email"
          placeholder="email@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="sm:max-w-md"
        />
        <Button type="button" onClick={() => void send()} disabled={pending}>
          {pending ? "Enviando…" : "Enviar convite"}
        </Button>
      </CardContent>
    </Card>
  );
}
