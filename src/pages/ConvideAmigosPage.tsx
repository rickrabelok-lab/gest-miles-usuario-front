import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { hasApiUrl } from "@/services/api";
import { enviarConviteIndicacao } from "@/lib/indicacao";

const appOrigin =
  (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "");

const ConvideAmigosPage = () => {
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("indicacao_meu_resumo");
        if (error) throw error;
        if (!ativo) return;
        const resumo = (data ?? {}) as { codigo?: string; total_cadastrados?: number };
        setCodigo(resumo.codigo ?? null);
        setTotal(resumo.total_cadastrados ?? 0);
      } catch {
        if (ativo) setCodigo(null);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const link = codigo ? `${appOrigin}/auth/sign-up?ref=${encodeURIComponent(codigo)}` : "";

  const handleCopiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };

  const handleEnviar = async () => {
    if (!email.trim()) {
      toast.error("Informe o e-mail do amigo.");
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
      await enviarConviteIndicacao({ email, token });
      toast.success("Convite enviado! Seu amigo vai receber o link por e-mail.");
      setEmail("");
    } catch {
      toast.error("Não foi possível enviar o convite agora. Tente novamente em instantes.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-nubank-bg pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-semibold tracking-tight">Convide Amigos</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="space-y-4 px-4 py-6">
        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-4 p-4">
            <p className="text-sm text-muted-foreground">
              Compartilhe a Gest Miles com outros gestores e consultores. Quando seu amigo se
              cadastrar pelo seu link, ele fica vinculado a você.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="ref-link">
                Seu link de indicação
              </label>
              <div className="flex gap-2">
                <Input
                  id="ref-link"
                  readOnly
                  value={link || "Gerando seu link..."}
                  className="text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={handleCopiar}
                  disabled={!link}
                  aria-label="Copiar link"
                >
                  {copiado ? <Check size={16} /> : <Copy size={16} />}
                  <span className="ml-1.5 hidden sm:inline">Copiar</span>
                </Button>
              </div>
            </div>

            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              <strong className="text-foreground">{total}</strong>{" "}
              {total === 1 ? "amigo já se cadastrou" : "amigos já se cadastraram"} pelo seu link.
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-4 p-4">
            <p className="text-sm text-muted-foreground">Prefere convidar por e-mail?</p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                E-mail do convidado
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.com"
              />
            </div>
            <Button type="button" className="w-full" onClick={handleEnviar} disabled={enviando}>
              {enviando ? "Enviando..." : "Enviar convite"}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default ConvideAmigosPage;
