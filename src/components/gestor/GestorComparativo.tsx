import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GestorClienteResumo } from "@/hooks/useGestor";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_SELECT = 3;

type Props = { clients: GestorClienteResumo[] };

const GestorComparativo = ({ clients }: Props) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECT) next.add(id);
      return next;
    });
  };

  const selected = useMemo(
    () => clients.filter((c) => selectedIds.has(c.clienteId)),
    [clients, selectedIds],
  );

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <BarChart3 className="h-4 w-4" />
        Selecione até 3 clientes para comparar
      </p>

      <div className="flex flex-wrap gap-2">
        {clients.map((c) => {
          const isSelected = selectedIds.has(c.clienteId);
          const disabled = !isSelected && selectedIds.size >= MAX_SELECT;
          return (
            <Badge
              key={c.clienteId}
              variant={isSelected ? "default" : "outline"}
              className={cn(
                "cursor-pointer transition-all",
                disabled && "opacity-50 cursor-not-allowed",
              )}
              onClick={() => !disabled && toggle(c.clienteId)}
            >
              {c.nome}
            </Badge>
          );
        })}
      </div>

      {selected.length > 0 && (
        <Card className="rounded-xl border-border/80 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="p-2 text-left font-semibold">Métrica</th>
                    {selected.map((c) => (
                      <th key={c.clienteId} className="p-2 text-right font-semibold max-w-[100px] truncate">
                        {c.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">ROI médio</td>
                    {selected.map((c) => (
                      <td key={c.clienteId} className="p-2 text-right tabular-nums font-medium">
                        {c.roiMedio.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">Custo médio/milheiro (est.)</td>
                    {selected.map((c) => (
                      <td key={c.clienteId} className="p-2 text-right tabular-nums">
                        {c.milhas > 0
                          ? ((c.valorEstimado / c.milhas) * 1000).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                              maximumFractionDigits: 0,
                            })
                          : "-"}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">Economia total</td>
                    {selected.map((c) => (
                      <td key={c.clienteId} className="p-2 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                        {c.economiaTotal.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                          maximumFractionDigits: 0,
                        })}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="p-2 text-muted-foreground">Score estratégico</td>
                    {selected.map((c) => (
                      <td key={c.clienteId} className="p-2 text-right">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold",
                            c.scoreEstrategico >= 70
                              ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                              : c.scoreEstrategico >= 40
                                ? "border-amber-500/30 text-amber-700 dark:text-amber-400"
                                : "border-red-500/30 text-red-700 dark:text-red-400",
                          )}
                        >
                          {c.scoreEstrategico}
                        </Badge>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {selected.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Clique nos nomes acima para adicionar clientes à comparação.
        </p>
      )}
    </div>
  );
};

export default GestorComparativo;
