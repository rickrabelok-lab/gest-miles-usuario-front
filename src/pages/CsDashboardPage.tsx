import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, Pencil, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useCsGestores } from "@/hooks/useCsGestores";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CsDashboardPage = () => {
  const navigate = useNavigate();
  const { role } = useAuth();
  const enabled = role === "cs" || role === "admin";
  const { data: gestores = [], isLoading, error, invalidate } = useCsGestores(enabled);
  const [editingGestor, setEditingGestor] = useState<{ id: string; nome: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSaveGestor = async () => {
    if (!editingGestor?.id) return;
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from("perfis")
        .update({ nome_completo: editingGestor.nome.trim() || null })
        .eq("usuario_id", editingGestor.id);
      if (err) throw err;
      toast.success("Dados do gestor atualizados.");
      setEditingGestor(null);
      await invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  if (!enabled) {
    navigate("/", { replace: true });
    return null;
  }

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
          <h1 className="text-base font-semibold tracking-tight">Painel CS</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Gestores atribuídos a você. Toque para ver os clientes de cada um.
        </p>

        {isLoading && (
          <p className="text-sm text-muted-foreground">Carregando gestores...</p>
        )}
        {error && (
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Erro ao carregar."}
          </p>
        )}
        {!isLoading && !error && gestores.length === 0 && (
          <Card className="rounded-xl border-border/80">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhum gestor atribuído ao seu usuário CS. Entre em contato com o administrador.
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {gestores.map((g) => (
            <Collapsible key={g.gestorId}>
              <Card className="rounded-xl border-border/80 shadow-nubank transition-all duration-300 ease-out hover:shadow-nubank-hover">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between p-4 text-left"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground [&[data-state=open]]:hidden" />
                      <ChevronDown className="hidden h-5 w-5 shrink-0 text-muted-foreground [&[data-state=open]]:block" />
                      <Users className="h-5 w-5 shrink-0 text-[#8A05BE]" />
                      <span className="truncate font-medium">{g.gestorNome}</span>
                      <span className="text-xs text-muted-foreground">
                        ({g.clientes.length} {g.clientes.length === 1 ? "cliente" : "clientes"})
                      </span>
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="border-t border-border/80 pt-2 pb-4">
                    <div className="flex items-center justify-between px-2 pb-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Clientes
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-[#8A05BE]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingGestor({ id: g.gestorId, nome: g.gestorNome });
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        Editar gestor
                      </Button>
                    </div>
                    <ul className="space-y-1.5">
                      {g.clientes.length === 0 ? (
                        <li className="px-2 py-1 text-sm text-muted-foreground">
                          Nenhum cliente vinculado.
                        </li>
                      ) : (
                        g.clientes.map((c) => (
                          <li
                            key={c.clienteId}
                            className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
                          >
                            <span className="truncate font-medium">{c.clienteNome}</span>
                            <span className="shrink-0 truncate text-xs text-muted-foreground font-mono">
                              {c.clienteId.slice(0, 8)}…
                            </span>
                          </li>
                        ))
                      )}
                    </ul>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      </main>

      <Dialog open={!!editingGestor} onOpenChange={(open) => !open && setEditingGestor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar gestor</DialogTitle>
          </DialogHeader>
          {editingGestor && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="gestor-nome">Nome completo</Label>
                <Input
                  id="gestor-nome"
                  value={editingGestor.nome}
                  onChange={(e) =>
                    setEditingGestor((prev) => prev && { ...prev, nome: e.target.value })
                  }
                  placeholder="Nome do gestor"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingGestor(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveGestor}
              disabled={saving || !editingGestor?.nome?.trim()}
            >
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CsDashboardPage;
