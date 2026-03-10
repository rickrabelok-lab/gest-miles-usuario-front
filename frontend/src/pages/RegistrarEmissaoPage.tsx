import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const RegistrarEmissaoPage = () => {
  const navigate = useNavigate();

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-semibold tracking-tight">Registrar Emissão</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <Card className="rounded-xl border-border/80">
          <CardContent className="space-y-4 p-4">
            <p className="text-xs text-muted-foreground">
              Preencha os dados básicos da emissão para registrar no histórico da conta.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="program">
                Programa / Companhia
              </label>
              <Input id="program" placeholder="Ex: Latam Pass, Smiles..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="origem">
                  Origem
                </label>
                <Input id="origem" placeholder="Ex: GRU" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="destino">
                  Destino
                </label>
                <Input id="destino" placeholder="Ex: MIA" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="data-ida">
                  Data ida
                </label>
                <Input id="data-ida" type="date" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="data-volta">
                  Data volta (opcional)
                </label>
                <Input id="data-volta" type="date" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="pax">
                  Passageiros
                </label>
                <Input id="pax" type="number" min={1} placeholder="1" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="milhas">
                  Milhas utilizadas
                </label>
                <Input id="milhas" type="number" min={0} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="obs">
                Observações (opcional)
              </label>
              <Textarea id="obs" rows={3} placeholder="Anote regras tarifárias, stopover, upgrades, etc." />
            </div>
            <Button type="button" className="mt-1 w-full">
              Salvar emissão
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default RegistrarEmissaoPage;

