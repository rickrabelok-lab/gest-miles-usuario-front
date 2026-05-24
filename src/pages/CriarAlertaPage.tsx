import { useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const DEFAULT_CREATE_ALERT_ERROR = "Não foi possível salvar o alerta agora. Tente novamente em instantes.";

const getCreateAlertErrorMessage = (error: unknown) => {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : "";

  if (message.includes("cliente_criar_alerta_unauthenticated")) {
    return "Sua sessão expirou. Entre novamente para salvar o alerta.";
  }

  if (message.includes("cliente_criar_alerta_forbidden_role")) {
    return "Seu perfil não tem permissão para criar este alerta.";
  }

  if (message.includes("cliente_criar_alerta_invalid_titulo")) {
    return "Revise o título do alerta e tente novamente.";
  }

  if (message.includes("cliente_criar_alerta_invalid_tipo")) {
    return "Revise o tipo do alerta e tente novamente.";
  }

  if (message.includes("cliente_criar_alerta_invalid_programa")) {
    return "O nome do programa está muito longo.";
  }

  if (message.includes("cliente_criar_alerta_invalid_detalhes")) {
    return "Os detalhes estão muito longos.";
  }

  if (message.includes("cliente_criar_alerta_rate_limited")) {
    return "Você atingiu o limite de alertas por enquanto. Tente novamente mais tarde.";
  }

  return DEFAULT_CREATE_ALERT_ERROR;
};

const CriarAlertaPage = () => {
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState("");
  const [dataAlvo, setDataAlvo] = useState("");
  const [programa, setPrograma] = useState("");
  const [detalhes, setDetalhes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedTitulo = titulo.trim();
    const trimmedTipo = tipo.trim();

    if (trimmedTitulo.length < 3) {
      toast.error("Informe um título com pelo menos 3 caracteres.");
      return;
    }

    if (trimmedTipo.length < 3) {
      toast.error("Informe o tipo do alerta.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc("cliente_criar_alerta_self", {
        p_titulo: trimmedTitulo,
        p_tipo: trimmedTipo,
        p_data_alvo: dataAlvo || null,
        p_programa: programa.trim() || null,
        p_detalhes: detalhes.trim() || null,
      });

      if (error) throw error;

      toast.success("Alerta salvo.");
      navigate("/vencimentos", { replace: true });
    } catch (error) {
      toast.error(getCreateAlertErrorMessage(error));
    } finally {
      setIsSubmitting(false);
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
          <h1 className="text-base font-semibold tracking-tight">Adicionar Alerta</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <Card className="rounded-xl border-border/80">
          <CardContent className="p-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <p className="text-xs text-muted-foreground">
                Configure alertas para vencimentos, saldo mínimo ou oportunidades importantes.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="titulo">
                  Título do alerta
                </label>
                <Input
                  id="titulo"
                  value={titulo}
                  onChange={(event) => setTitulo(event.target.value)}
                  maxLength={120}
                  placeholder="Ex: Pontos vencendo em 30 dias"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="tipo">
                  Tipo de alerta
                </label>
                <Input
                  id="tipo"
                  value={tipo}
                  onChange={(event) => setTipo(event.target.value)}
                  maxLength={80}
                  placeholder="Ex: Vencimento, saldo, oportunidade..."
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="data">
                    Data alvo (opcional)
                  </label>
                  <DatePickerField
                    id="data"
                    value={dataAlvo}
                    onChange={setDataAlvo}
                    placeholder="Escolher data"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="programa">
                    Programa (opcional)
                  </label>
                  <Input
                    id="programa"
                    value={programa}
                    onChange={(event) => setPrograma(event.target.value)}
                    maxLength={80}
                    placeholder="Ex: Latam Pass"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="detalhes">
                  Detalhes
                </label>
                <Textarea
                  id="detalhes"
                  value={detalhes}
                  onChange={(event) => setDetalhes(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Descreva quando e como você quer ser lembrado."
                />
              </div>
              <Button type="submit" className="mt-1 w-full" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Salvar alerta"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CriarAlertaPage;
