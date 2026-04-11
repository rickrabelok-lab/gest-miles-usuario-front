import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Copy, Check, ExternalLink, Plus, X, GripVertical, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import type { GestorClienteResumo } from "@/hooks/useGestor";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ProgramFilter =
  | "todos"
  | "smiles"
  | "latam"
  | "azul"
  | "avios"
  | "copa"
  | "allAccor";

const ALL_PROGRAMS = ["smiles", "latam", "azul", "avios", "copa", "allAccor"] as const;

const PROGRAM_LABELS: Record<string, string> = {
  smiles: "Smiles",
  latam: "Latam",
  azul: "Azul",
  avios: "Avios",
  copa: "Copa",
  allAccor: "ALL Accor",
};

type Props = {
  clients: GestorClienteResumo[];
  onOpenClient: (clientId: string) => void;
  onTogglePlanoAcao?: (clientId: string, program: string, active: boolean) => void;
  variant?: "gestor" | "cs";
};

const ACOES_COL_PX = 52;

const RESIZABLE_COLS = [
  "nome",
  "gestores",
  "cpf",
  "dataNascimento",
  "email",
  "telefone",
  "passaporte",
  "endereco",
  "planoAcao",
  "demandas",
] as const;

type ColKey = (typeof RESIZABLE_COLS)[number];

const DEFAULT_COL_WIDTHS: Record<ColKey, number> = {
  nome: 180,
  gestores: 140,
  cpf: 120,
  dataNascimento: 100,
  email: 180,
  endereco: 160,
  passaporte: 100,
  telefone: 110,
  planoAcao: 150,
  demandas: 96,
};

const MIN_COL_WIDTH: Record<ColKey, number> = {
  nome: 100,
  gestores: 88,
  cpf: 88,
  dataNascimento: 72,
  email: 120,
  endereco: 100,
  passaporte: 72,
  telefone: 88,
  planoAcao: 110,
  demandas: 72,
};

const MAX_COL_WIDTH = 520;

const COL_WIDTHS_STORAGE_KEY = "gest-miles:gestor-clients-table:col-widths:v3";

function loadColWidths(): Record<ColKey, number> {
  try {
    const raw = localStorage.getItem(COL_WIDTHS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COL_WIDTHS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next = { ...DEFAULT_COL_WIDTHS };
    for (const k of RESIZABLE_COLS) {
      const v = parsed[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        const min = MIN_COL_WIDTH[k];
        next[k] = Math.round(Math.min(MAX_COL_WIDTH, Math.max(min, v)));
      }
    }
    return next;
  } catch {
    return { ...DEFAULT_COL_WIDTHS };
  }
}

function colPxStyle(w: number): CSSProperties {
  const px = `${w}px`;
  return { width: px, minWidth: px, maxWidth: px };
}

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: ReactMouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label="Redimensionar coluna"
      title="Arraste para ajustar a largura"
      className="absolute right-0 top-0 z-[40] flex h-full w-3 translate-x-1/2 cursor-col-resize items-center justify-center border-0 bg-transparent p-0 outline-none hover:bg-primary/20 active:bg-primary/35"
      onMouseDown={onMouseDown}
      onClick={(e) => e.preventDefault()}
    >
      <GripVertical className="pointer-events-none h-3 w-3 text-muted-foreground/40" aria-hidden />
    </button>
  );
}

/** Fundo opaco para colunas fixas — evita texto das colunas ao fundo aparecer por trás. */
const stickyThClass =
  "border-r border-border/70 bg-muted shadow-[2px_0_12px_-4px_rgba(16,24,40,0.12)] dark:bg-muted dark:shadow-[2px_0_12px_-4px_rgba(0,0,0,0.35)]";

const stickyTdClass =
  "border-r border-border/60 bg-card shadow-[2px_0_8px_-4px_rgba(16,24,40,0.08)] group-hover:bg-muted dark:bg-card dark:shadow-[2px_0_8px_-4px_rgba(0,0,0,0.22)]";

function ResizableTh({
  col,
  width,
  onResizeStart,
  className,
  children,
  stickyLeft,
  stickyZ = 30,
}: {
  col: ColKey;
  width: number;
  onResizeStart: (col: ColKey, e: ReactMouseEvent<HTMLButtonElement>) => void;
  className?: string;
  children: ReactNode;
  /** Quando definido, a coluna fica fixa ao rolar horizontalmente (px). */
  stickyLeft?: number;
  stickyZ?: number;
}) {
  const isSticky = stickyLeft !== undefined;
  return (
    <th
      className={cn("relative select-none", isSticky && stickyThClass, className)}
      style={{
        ...colPxStyle(width),
        ...(isSticky ? { position: "sticky", left: stickyLeft, zIndex: stickyZ } : {}),
      }}
    >
      <div className="min-w-0 overflow-hidden pr-2">{children}</div>
      <ResizeHandle onMouseDown={(e) => onResizeStart(col, e)} />
    </th>
  );
}

const CopyButton = ({ value }: { value: string | null | undefined }) => {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const handleCopy = (e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-1 inline-flex shrink-0 items-center rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
      title="Copiar"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
};

const GestorClientsTable = ({ clients, onOpenClient, onTogglePlanoAcao, variant = "gestor" }: Props) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ProgramFilter>("todos");
  const showGestores = variant === "cs";

  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(() => loadColWidths());

  useEffect(() => {
    try {
      localStorage.setItem(COL_WIDTHS_STORAGE_KEY, JSON.stringify(colWidths));
    } catch {
      /* ignore quota / private mode */
    }
  }, [colWidths]);

  const tableMinWidthPx = useMemo(() => {
    let sum = ACOES_COL_PX;
    sum +=
      colWidths.nome +
      colWidths.cpf +
      colWidths.dataNascimento +
      colWidths.email +
      colWidths.telefone +
      colWidths.passaporte +
      colWidths.endereco +
      colWidths.planoAcao +
      colWidths.demandas;
    if (showGestores) sum += colWidths.gestores;
    return sum;
  }, [colWidths, showGestores]);

  const beginResize = useCallback((col: ColKey, e: ReactMouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[col];
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const min = MIN_COL_WIDTH[col];
      const next = Math.round(Math.min(MAX_COL_WIDTH, Math.max(min, startW + delta)));
      setColWidths((prev) => (prev[col] === next ? prev : { ...prev, [col]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [colWidths]);

  const resetColWidths = useCallback(() => {
    setColWidths({ ...DEFAULT_COL_WIDTHS });
    try {
      localStorage.removeItem(COL_WIDTHS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    toast.success("Larguras das colunas restauradas ao padrão.");
  }, []);

  const filteredClients = useMemo(() => {
    const gestoresHaystack = (c: GestorClienteResumo) =>
      c.gestoresResponsaveis.map((g) => g.nome.toLowerCase()).join(" ");
    const text = search.trim().toLowerCase();
    let list = clients.filter((c) => {
      if (!text) return true;
      return (
        c.nome.toLowerCase().includes(text) ||
        gestoresHaystack(c).includes(text) ||
        (c.cpf ?? "").includes(text) ||
        (c.email ?? "").toLowerCase().includes(text) ||
        (c.telefone ?? "").includes(text)
      );
    });

    if (filter !== "todos") {
      list = list.filter((c) => c.planoAcaoAtivo.includes(filter));
    }

    return list;
  }, [clients, search, filter]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(`${dateStr}T00:00:00`);
      return d.toLocaleDateString("pt-BR");
    } catch {
      return dateStr;
    }
  };

  const handleToggleProgram = useCallback(
    (e: ReactMouseEvent, clientId: string, program: string, currentlyActive: boolean) => {
      e.stopPropagation();
      if (onTogglePlanoAcao) {
        onTogglePlanoAcao(clientId, program, !currentlyActive);
      } else {
        toast.info("Abra o perfil do cliente para editar o plano de ação.");
      }
    },
    [onTogglePlanoAcao],
  );

  const thClass = "p-2.5 text-left text-xs font-semibold align-top whitespace-nowrap";
  const tdClass = "p-2.5 text-xs align-top";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-10 pl-8"
            placeholder="Buscar por cliente, CPF, e-mail ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as ProgramFilter)}>
          <SelectTrigger className="h-10 w-[200px] text-sm">
            <SelectValue placeholder="Programa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os programas</SelectItem>
            <SelectItem value="smiles">Smiles</SelectItem>
            <SelectItem value="latam">Latam</SelectItem>
            <SelectItem value="azul">Azul</SelectItem>
            <SelectItem value="avios">Avios</SelectItem>
            <SelectItem value="copa">Copa</SelectItem>
            <SelectItem value="allAccor">ALL Accor</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" className="h-10 shrink-0 text-xs" onClick={resetColWidths}>
          Larguras padrão
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl">
        <CardContent className="p-0">
          <div className="max-h-[62vh] overflow-x-auto overflow-y-auto">
            <table
              className="w-full table-fixed text-sm"
              style={{ minWidth: Math.max(1100, tableMinWidthPx) }}
            >
              <thead className="sticky top-0 z-20 bg-muted/70 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
                <tr className="border-b border-border">
                  <ResizableTh col="nome" width={colWidths.nome} onResizeStart={beginResize} className={thClass} stickyLeft={0} stickyZ={32}>
                    <span className="text-foreground">Cliente</span>
                  </ResizableTh>
                  {showGestores && (
                    <ResizableTh
                      col="gestores"
                      width={colWidths.gestores}
                      onResizeStart={beginResize}
                      className={thClass}
                      stickyLeft={colWidths.nome}
                      stickyZ={33}
                    >
                      <span className="text-foreground">Gestores</span>
                    </ResizableTh>
                  )}
                  <ResizableTh col="cpf" width={colWidths.cpf} onResizeStart={beginResize} className={thClass}>
                    <span className="text-foreground">CPF</span>
                  </ResizableTh>
                  <ResizableTh col="dataNascimento" width={colWidths.dataNascimento} onResizeStart={beginResize} className={thClass}>
                    <span className="text-foreground">Nascimento</span>
                  </ResizableTh>
                  <ResizableTh col="email" width={colWidths.email} onResizeStart={beginResize} className={thClass}>
                    <span className="text-foreground">E-mail</span>
                  </ResizableTh>
                  <ResizableTh col="telefone" width={colWidths.telefone} onResizeStart={beginResize} className={thClass}>
                    <span className="text-foreground">Telefone</span>
                  </ResizableTh>
                  <ResizableTh col="passaporte" width={colWidths.passaporte} onResizeStart={beginResize} className={thClass}>
                    <span className="text-foreground">Passaporte</span>
                  </ResizableTh>
                  <ResizableTh col="endereco" width={colWidths.endereco} onResizeStart={beginResize} className={thClass}>
                    <span className="text-foreground">Endereço</span>
                  </ResizableTh>
                  <ResizableTh col="planoAcao" width={colWidths.planoAcao} onResizeStart={beginResize} className={thClass}>
                    <span className="text-foreground">Plano de ação</span>
                  </ResizableTh>
                  <ResizableTh col="demandas" width={colWidths.demandas} onResizeStart={beginResize} className={cn(thClass, "text-center")}>
                    <span className="inline-block text-foreground">Demandas</span>
                  </ResizableTh>
                  <th
                    className={cn(thClass, "relative")}
                    style={{ width: ACOES_COL_PX, minWidth: ACOES_COL_PX, maxWidth: ACOES_COL_PX }}
                  />
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => {
                  const dateFormatted = formatDate(c.dataNascimento);
                  const totalDemandas = c.demandasPendentes + c.demandasAndamento;
                  return (
                    <tr
                      key={c.clienteId}
                      className="group border-b border-border/50 transition-colors hover:bg-muted/40"
                    >
                      {/* Cliente — coluna fixa ao rolar horizontalmente */}
                      <td
                        className={cn(tdClass, "min-w-0", stickyTdClass)}
                        style={{
                          ...colPxStyle(colWidths.nome),
                          position: "sticky",
                          left: 0,
                          zIndex: 10,
                        }}
                      >
                        <div className="flex items-center gap-0.5">
                          <span className="min-w-0 truncate font-medium" title={c.nome}>{c.nome}</span>
                          <CopyButton value={c.nome} />
                        </div>
                      </td>
                      {/* Gestores — fixa ao lado do nome (visão CS) */}
                      {showGestores && (
                        <td
                          className={cn(tdClass, "min-w-0", stickyTdClass)}
                          style={{
                            ...colPxStyle(colWidths.gestores),
                            position: "sticky",
                            left: colWidths.nome,
                            zIndex: 11,
                          }}
                        >
                          <div className="flex flex-wrap gap-1">
                            {c.gestoresResponsaveis.length === 0 ? (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            ) : (
                              c.gestoresResponsaveis.map((g) => (
                                <Badge key={g.id} variant="secondary" className="max-w-full truncate px-1.5 py-0 text-[10px] font-normal" title={g.nome}>
                                  {g.nome}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>
                      )}
                      {/* CPF */}
                      <td className={cn(tdClass, "min-w-0 text-muted-foreground tabular-nums")} style={colPxStyle(colWidths.cpf)}>
                        <div className="flex items-center gap-0.5">
                          <span>{c.cpf || "—"}</span>
                          <CopyButton value={c.cpf} />
                        </div>
                      </td>
                      {/* Nascimento */}
                      <td className={cn(tdClass, "min-w-0 text-muted-foreground tabular-nums")} style={colPxStyle(colWidths.dataNascimento)}>
                        <div className="flex items-center gap-0.5">
                          <span>{dateFormatted}</span>
                          {c.dataNascimento && <CopyButton value={dateFormatted} />}
                        </div>
                      </td>
                      {/* E-mail */}
                      <td className={cn(tdClass, "min-w-0 text-muted-foreground")} style={colPxStyle(colWidths.email)}>
                        <div className="flex items-center gap-0.5 min-w-0">
                          <span className="min-w-0 truncate" title={c.email ?? undefined}>{c.email || "—"}</span>
                          <CopyButton value={c.email} />
                        </div>
                      </td>
                      {/* Telefone */}
                      <td className={cn(tdClass, "min-w-0 text-muted-foreground tabular-nums")} style={colPxStyle(colWidths.telefone)}>
                        <div className="flex items-center gap-0.5">
                          <span>{c.telefone || "—"}</span>
                          <CopyButton value={c.telefone} />
                        </div>
                      </td>
                      {/* Passaporte */}
                      <td className={cn(tdClass, "min-w-0 text-muted-foreground tabular-nums")} style={colPxStyle(colWidths.passaporte)}>
                        <div className="flex items-center gap-0.5">
                          <span>{c.passaporte || "—"}</span>
                          <CopyButton value={c.passaporte} />
                        </div>
                      </td>
                      {/* Endereço */}
                      <td className={cn(tdClass, "min-w-0 text-muted-foreground")} style={colPxStyle(colWidths.endereco)}>
                        <span className="block truncate" title={c.endereco ?? undefined}>{c.endereco || "—"}</span>
                      </td>
                      {/* Plano de ação */}
                      <td className={cn(tdClass, "min-w-0")} style={colPxStyle(colWidths.planoAcao)}>
                        <div className="flex flex-wrap items-center gap-1">
                          {c.planoAcaoAtivo.map((prog) => (
                            <Badge
                              key={prog}
                              variant="secondary"
                              className="group relative cursor-default px-1.5 py-0 text-[10px] font-normal pr-4"
                            >
                              {PROGRAM_LABELS[prog] ?? prog}
                              {onTogglePlanoAcao && (
                                <button
                                  type="button"
                                  className="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => handleToggleProgram(e, c.clienteId, prog, true)}
                                  title={`Remover ${PROGRAM_LABELS[prog] ?? prog}`}
                                >
                                  <X className="h-2.5 w-2.5 text-muted-foreground hover:text-destructive" />
                                </button>
                              )}
                            </Badge>
                          ))}
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-dashed border-muted-foreground/40 text-muted-foreground/60 hover:border-primary hover:text-primary transition-colors"
                                title="Adicionar programa"
                              >
                                <Plus className="h-2.5 w-2.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-44 p-2" align="start" side="bottom">
                              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Programas
                              </p>
                              <div className="space-y-1">
                                {ALL_PROGRAMS.map((prog) => {
                                  const active = c.planoAcaoAtivo.includes(prog);
                                  return (
                                    <label
                                      key={prog}
                                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/60"
                                    >
                                      <Checkbox
                                        checked={active}
                                        onCheckedChange={() => {
                                          if (onTogglePlanoAcao) {
                                            onTogglePlanoAcao(c.clienteId, prog, !active);
                                          } else {
                                            toast.info("Abra o perfil do cliente para editar o plano de ação.");
                                          }
                                        }}
                                      />
                                      {PROGRAM_LABELS[prog]}
                                    </label>
                                  );
                                })}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </td>
                      {/* Demandas */}
                      <td className={cn(tdClass, "min-w-0 text-center")} style={colPxStyle(colWidths.demandas)}>
                        {totalDemandas === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            {c.demandasPendentes > 0 && (
                              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0 text-[10px] font-semibold">
                                {c.demandasPendentes}P
                              </Badge>
                            )}
                            {c.demandasAndamento > 0 && (
                              <Badge variant="outline" className="border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400 px-1.5 py-0 text-[10px] font-semibold">
                                {c.demandasAndamento}A
                              </Badge>
                            )}
                          </div>
                        )}
                      </td>
                      {/* Ações */}
                      <td
                        className={cn(tdClass)}
                        style={{ width: ACOES_COL_PX, minWidth: ACOES_COL_PX, maxWidth: ACOES_COL_PX }}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Acessar conta do cliente"
                          onClick={() => onOpenClient(c.clienteId)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredClients.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GestorClientsTable;
