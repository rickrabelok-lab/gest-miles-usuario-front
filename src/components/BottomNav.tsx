import { useState } from "react";
import { Ticket, Layers, Users, ChevronUp, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BottomNavProps {
  activeItem: string;
  onItemChange: (item: string) => void;
  showClientSelector?: boolean;
  clients?: Array<{ id: string; name: string }>;
  selectedClientId?: string | null;
  onClientSelect?: (clientId: string) => void;
  onBackToMyAccount?: () => void;
}

const items = [
  { id: "passagens", label: "Passagens", icon: Ticket },
  { id: "programas", label: "Programas", icon: Layers },
  { id: "vender", label: "Vender", icon: Users },
];

const BottomNav = ({
  activeItem,
  onItemChange,
  showClientSelector = false,
  clients = [],
  selectedClientId,
  onClientSelect,
  onBackToMyAccount,
}: BottomNavProps) => {
  const [openClients, setOpenClients] = useState(false);
  const [pastedClientId, setPastedClientId] = useState("");

  const handleAccessById = () => {
    const id = pastedClientId.trim();
    if (!id) return;
    onClientSelect?.(id);
    setOpenClients(false);
    setPastedClientId("");
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg">
      <div className="mx-auto flex max-w-md items-center justify-around py-2">
        {items.map((item) => {
          const isClientButton = showClientSelector && item.id === "vender";
          const isActive = activeItem === item.id;
          const Icon = item.icon;
          return (
            <div key={item.id} className="relative">
              {isClientButton && openClients && (
                <div className="absolute bottom-14 right-0 z-10 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg max-h-[70vh] overflow-y-auto">
                  {onBackToMyAccount && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mb-3 w-full justify-start gap-2 border-slate-200"
                      onClick={() => {
                        onBackToMyAccount();
                        setOpenClients(false);
                      }}
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Voltar para minha conta
                    </Button>
                  )}
                  <p className="mb-2 text-xs font-medium text-slate-600">
                    Colar ID do cliente
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Cole o ID da conta do cliente"
                      value={pastedClientId}
                      onChange={(e) => setPastedClientId(e.target.value)}
                      className="h-9 flex-1 text-xs font-mono"
                    />
                    <Button
                      size="sm"
                      className="h-9 shrink-0"
                      onClick={handleAccessById}
                      disabled={!pastedClientId.trim()}
                    >
                      Acessar
                    </Button>
                  </div>
                  <div className="my-3 border-t border-slate-200" />
                  <p className="mb-1.5 text-xs font-medium text-slate-600">
                    Clientes na sua carteira
                  </p>
                  {clients.length === 0 ? (
                    <p className="py-3 text-center text-xs text-slate-500">
                      Nenhum cliente vinculado. Use o campo acima para acessar por ID.
                    </p>
                  ) : (
                    <div className="max-h-40 space-y-0.5 overflow-y-auto">
                      {clients.map((client) => {
                        const isSelected = selectedClientId === client.id;
                        return (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => {
                              onClientSelect?.(client.id);
                              setOpenClients(false);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                              isSelected
                                ? "bg-emerald-50 font-semibold text-emerald-700"
                                : "text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <span className="truncate">{client.name}</span>
                            {isSelected && <span>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  if (isClientButton) {
                    setOpenClients((prev) => !prev);
                    return;
                  }
                  onItemChange(item.id);
                }}
                className={`flex flex-col items-center gap-1 px-6 py-1.5 transition-colors ${
                  isActive || openClients ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <div className="relative">
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                  {(isActive || openClients) && (
                    <div className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
                  )}
                </div>
                <span
                  className={`text-xs ${
                    isActive || openClients ? "font-semibold" : "font-medium"
                  }`}
                >
                  {isClientButton ? "Cliente" : item.label}
                </span>
                {isClientButton && (
                  <ChevronUp
                    size={12}
                    className={`transition-transform ${openClients ? "" : "rotate-180"}`}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
      {/* Safe area for iPhones */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
};

export default BottomNav;
