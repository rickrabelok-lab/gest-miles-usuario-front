import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { hasApiUrl } from "@/services/api";
import { submitContato } from "@/lib/contato";

const FaleConoscoPage = () => {
  const navigate = useNavigate();
  const [assunto, setAssunto] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async () => {
    if (!assunto.trim() || !mensagem.trim()) {
      toast.error("Preencha o assunto e a mensagem.");
      return;
    }
    if (!hasApiUrl()) {
      toast.error("Envio indisponível no momento. Tente novamente mais tarde.");
      return;
    }
    setEnviando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        toast.error("Sua sessão expirou. Entre novamente para enviar.");
        return;
      }
      await submitContato({ assunto, mensagem, token });
      toast.success("Mensagem enviada! Em breve a equipe responde por e-mail.");
      setAssunto("");
      setMensagem("");
    } catch {
      toast.error("Não foi possível enviar sua mensagem agora. Tente novamente em instantes.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm pt-[var(--gm-safe-top)]">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-semibold tracking-tight">Fale Conosco</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-4 p-4">
            <p className="text-sm text-muted-foreground">
              Envie dúvidas, feedbacks ou sugestões sobre a GestMiles.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="assunto">
                Assunto
              </label>
              <Input
                id="assunto"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                maxLength={120}
                placeholder="Ex: Sugestão de melhoria"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="mensagem">
                Mensagem
              </label>
              <Textarea
                id="mensagem"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Conte como podemos ajudar ou o que você gostaria de ver na plataforma."
              />
            </div>
            <Button type="button" className="w-full" onClick={handleSubmit} disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar mensagem"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default FaleConoscoPage;
