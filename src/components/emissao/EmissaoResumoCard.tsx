import { useId } from "react";
import { cn } from "@/lib/utils";
import { formatMilhas } from "@/lib/formatMilhas";
import { formatEquipeNomeTicketResumo } from "@/lib/formatEquipeTitulo";

export interface EmissaoResumoCardProps {
  programa: string;
  descricao: string;
  tipoPill: string;
  milhas: number;
  origem: string;
  destino: string;
  companhia: string;
  classe?: string;
  dataDocumento: string;
  dataEmissao: string;
  dataVooIda: string;
  dataVooVolta: string;
  status?: string;
  tarifaPagante?: number;
  custoReal?: number;
  economiaReal?: number;
  taxas?: number;
  /** Modal: tipografia e espaçamentos menores para caber na tela com rolagem confortável. */
  variant?: "default" | "dialog";
  /** Nome(s) do(s) gestor(es) do cliente (carteira atual), exibido acima da faixa do logo. */
  gestorResponsavel?: string;
  /** Nome da equipe (carteira / CRM); destaque visual no cabeçalho do ticket. */
  equipeNome?: string;
  /** PNR / localizador da reserva (opcional). */
  codigoReserva?: string;
  /** Quantidade de passageiros (opcional). */
  passageiros?: number;
  /** Quando true, o rótulo de custo total passa a ser “Custo com fornecedor”. */
  emissaoFornecedor?: boolean;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function GestMilesLogoSvg({ className }: { className?: string }) {
  const gid = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id={`gm-resumo-lg-${gid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6A00A3" />
          <stop offset="100%" stopColor="#B56CFF" />
        </linearGradient>
      </defs>
      <rect width="72" height="72" rx="17" fill={`url(#gm-resumo-lg-${gid})`} />
      <path
        d="M14 58 Q36 12 58 26"
        stroke="rgba(255,255,255,0.38)"
        strokeWidth="1.6"
        fill="none"
        strokeDasharray="2.5 5.5"
        strokeLinecap="round"
      />
      <circle cx="22" cy="46" r="2" fill="rgba(255,255,255,0.55)" />
      <circle cx="36" cy="26" r="2" fill="rgba(255,255,255,0.55)" />
      <circle cx="50" cy="18" r="2" fill="rgba(255,255,255,0.55)" />
      <g transform="translate(55,18) rotate(42) scale(0.56)">
        <path
          d="M0,-22 C2,-20 4,-12 4,-4 L26,10 L22,15 L4,6 L5,19 L12,24 L10,28 L0,25 L-10,28 L-12,24 L-5,19 L-4,6 L-22,15 L-26,10 L-4,-4 C-4,-12 -2,-20 0,-22 Z"
          fill="white"
        />
      </g>
    </svg>
  );
}

/**
 * Card visual “ticket” para resumo de emissão (design GestMiles — screenshot-ready ~390px).
 */
export function EmissaoResumoCard({
  programa,
  descricao,
  tipoPill,
  milhas,
  origem,
  destino,
  companhia,
  classe,
  dataDocumento,
  dataEmissao,
  dataVooIda,
  dataVooVolta,
  status = "Emissão Confirmada",
  tarifaPagante,
  custoReal,
  economiaReal,
  taxas,
  variant = "default",
  gestorResponsavel,
  equipeNome,
  codigoReserva,
  passageiros,
  emissaoFornecedor,
}: EmissaoResumoCardProps) {
  const compact = variant === "dialog";
  const airlineLine = classe ? `${companhia} · ${classe}` : companhia;
  const tipoDetalhe = tipoPill.includes("·")
    ? (tipoPill.split("·")[1]?.trim() ?? "Saída de Milhas")
    : tipoPill;
  const hasEconomiaHero =
    typeof economiaReal === "number" && !Number.isNaN(economiaReal);
  const showFinance =
    (typeof tarifaPagante === "number" && tarifaPagante > 0) ||
    (typeof custoReal === "number" && custoReal > 0) ||
    (typeof taxas === "number" && taxas > 0);

  const equipeTitulo = equipeNome?.trim()
    ? formatEquipeNomeTicketResumo(equipeNome.trim())
    : "";

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-[28px] bg-white shadow-[0_2px_8px_rgba(138,5,190,0.08),0_16px_48px_rgba(138,5,190,0.14),0_1px_0_rgba(0,0,0,0.04)]",
        compact ? "max-w-[min(100%,340px)] rounded-[22px]" : "max-w-[390px]",
      )}
    >
      {gestorResponsavel?.trim() ? (
        <div
          className={cn(
            "border-b border-[#EDE8F5] bg-[#FAF8FD] text-center",
            compact ? "px-3 py-2" : "px-4 py-2.5",
          )}
        >
          <p
            className={cn(
              "font-semibold uppercase tracking-wide text-[#9B8BAA]",
              compact ? "text-[8px]" : "text-[9px]",
            )}
          >
            Gestor responsável
          </p>
          <p
            className={cn(
              "mt-0.5 font-semibold text-[#1F1F1F]",
              compact ? "text-[11px] leading-snug" : "text-xs",
            )}
          >
            {gestorResponsavel.trim()}
          </p>
        </div>
      ) : null}

      {/* Logo bar */}
      <div
        className={cn(
          "flex items-center gap-2.5 border-b border-[#F0EBF7] bg-white",
          compact ? "gap-2 px-4 pb-3 pt-3.5" : "px-6 pb-4 pt-5",
        )}
      >
        <GestMilesLogoSvg
          className={cn("shrink-0 rounded-[9px]", compact ? "h-7 w-7" : "h-9 w-9")}
        />
        <div className="min-w-0 flex-1 leading-none">
          <p
            className={cn(
              "font-extrabold tracking-tight text-[#1F1F1F]",
              compact ? "text-sm" : "text-base",
            )}
          >
            Gest<span className="text-[#8A05BE]">Miles</span>
          </p>
          {equipeTitulo ? (
            <div
              className={cn(
                "mt-1 flex min-w-0 flex-col items-start",
                compact ? "gap-0.5" : "gap-1",
              )}
            >
              <div
                className={cn(
                  "inline-flex min-w-0 max-w-full w-fit rounded-lg border border-[#E8DDF5]/90 bg-gradient-to-br from-[#FBF8FF] via-white to-[#F5EDFC] px-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_2px_12px_rgba(138,5,190,0.07)]",
                  compact ? "py-0.5" : "py-1",
                )}
              >
                <p
                  className={cn(
                    "min-w-0 max-w-full truncate bg-gradient-to-r from-[#4C0580] via-[#8A05BE] to-[#A855E7] bg-clip-text font-semibold uppercase tracking-[0.14em] text-transparent",
                    compact ? "text-[9px] leading-tight" : "text-[10px] leading-snug",
                  )}
                  title={equipeTitulo}
                >
                  {equipeTitulo}
                </p>
              </div>
              <p
                className={cn(
                  "pl-0.5 font-medium uppercase tracking-[1.35px] text-[#9B8BAA]",
                  compact ? "text-[7px]" : "text-[8px]",
                )}
              >
                Gestão de milhas
              </p>
            </div>
          ) : (
            <p
              className={cn(
                "mt-0.5 font-medium uppercase tracking-[1.5px] text-[#6B6B6B]",
                compact ? "text-[8px]" : "text-[9px]",
              )}
            >
              Gestão de Milhas
            </p>
          )}
        </div>
        <p
          className={cn("shrink-0 font-medium text-[#9B8BAA]", compact ? "text-[10px]" : "text-[11px]")}
        >
          {dataDocumento}
        </p>
      </div>

      {/* Hero */}
      <div
        className={cn(
          "relative overflow-hidden bg-gradient-to-br from-[#6A00A3] via-[#8A05BE] to-[#B56CFF]",
          compact ? "px-4 pb-4 pt-4" : "px-6 pb-7 pt-6",
        )}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-[200px] w-[200px] rounded-full bg-white/[0.06]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-[60px] -left-[30px] h-40 w-40 rounded-full bg-white/[0.04]"
          aria-hidden
        />

        <div className="relative">
          <div
            className={cn(
              "mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.18] font-semibold uppercase tracking-[1.5px] text-white",
              compact ? "px-2 py-0.5 text-[8px]" : "mb-3.5 px-2.5 py-1 text-[10px]",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#B56CFF] shadow-[0_0_6px_rgba(181,108,255,0.8)]" />
            {tipoPill}
          </div>

          <div className={cn("mb-1 flex items-center gap-2", compact ? "gap-1.5" : "mb-1.5 gap-2.5")}>
            <span
              className={cn(
                "font-black tracking-tight text-white tabular-nums",
                compact ? "text-2xl" : "text-4xl",
              )}
            >
              {origem}
            </span>
            <div className="relative flex min-w-0 flex-1 flex-col items-center justify-center">
              <div className="h-px w-full bg-white/35" />
              <svg
                className={cn(
                  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                  compact ? "h-[14px] w-5" : "h-[18px] w-7",
                )}
                viewBox="0 0 28 18"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <g transform="translate(14,9) rotate(90) scale(0.34)">
                  <path
                    d="M0,-22 C2,-20 4,-12 4,-4 L26,10 L22,15 L4,6 L5,19 L12,24 L10,28 L0,25 L-10,28 L-12,24 L-5,19 L-4,6 L-22,15 L-26,10 L-4,-4 C-4,-12 -2,-20 0,-22 Z"
                    fill="rgba(255,255,255,0.9)"
                  />
                </g>
              </svg>
            </div>
            <span
              className={cn(
                "font-black tracking-tight text-white tabular-nums",
                compact ? "text-2xl" : "text-4xl",
              )}
            >
              {destino}
            </span>
          </div>

          <p
            className={cn("font-medium text-white/75", compact ? "mb-3 text-[11px]" : "mb-5 text-[13px]")}
          >
            {airlineLine}
          </p>

          <div className={cn("flex flex-wrap items-end gap-2", compact && "gap-1.5")}>
            {hasEconomiaHero ? (
              <>
                <span
                  className={cn(
                    "font-semibold uppercase leading-tight tracking-wide text-white/65",
                    compact ? "pb-0.5 text-[9px]" : "pb-1 text-[11px]",
                  )}
                >
                  Economia
                  <br />
                  estimada
                </span>
                <span
                  className={cn(
                    "min-w-0 max-w-full font-black leading-none tracking-tighter text-white tabular-nums",
                    compact ? "text-[21px]" : "text-[34px]",
                    economiaReal < 0 ? "text-amber-200" : "",
                  )}
                >
                  {economiaReal < 0 ? "− " : ""}
                  {brl(Math.abs(economiaReal))}
                </span>
              </>
            ) : (
              <>
                <span
                  className={cn(
                    "font-semibold uppercase leading-tight tracking-wide text-white/65",
                    compact ? "pb-0.5 text-[9px]" : "pb-1 text-[11px]",
                  )}
                >
                  Milhas
                  <br />
                  utilizadas
                </span>
                <span
                  className={cn(
                    "font-black leading-none tracking-tighter text-white tabular-nums",
                    compact ? "text-[26px]" : "text-[40px]",
                  )}
                >
                  {formatMilhas(milhas)}
                </span>
                <span
                  className={cn(
                    "font-semibold text-white/75",
                    compact ? "pb-0.5 text-xs" : "pb-1.5 text-sm",
                  )}
                >
                  pts
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ticket divider */}
      <div className="flex items-center bg-[#F7F5FB]">
        <div className="-ml-3 h-6 w-6 shrink-0 rounded-full bg-[#F0EBF7]" aria-hidden />
        <div className="mx-1 flex-1 border-t-2 border-dashed border-[#DDD5EC]" />
        <div className="-mr-3 h-6 w-6 shrink-0 rounded-full bg-[#F0EBF7]" aria-hidden />
      </div>

      {/* Details */}
      <div className={cn("bg-white", compact ? "px-4 pb-4 pt-3.5" : "px-6 pb-6 pt-5")}>
        <p
          className={cn(
            "font-bold uppercase tracking-[2px] text-[#8A05BE]",
            compact ? "mb-2.5 text-[9px]" : "mb-4 text-[10px]",
          )}
        >
          Detalhes da emissão
        </p>
        <div className={cn("grid grid-cols-2", compact ? "gap-x-3 gap-y-2" : "gap-x-4 gap-y-3.5")}>
          <div className="col-span-2 flex flex-col gap-0.5">
            <span
              className={cn(
                "font-semibold uppercase tracking-wide text-[#9B8BAA]",
                compact ? "text-[9px]" : "text-[10px]",
              )}
            >
              Programa
            </span>
            <span className={cn("font-semibold text-[#1F1F1F]", compact ? "text-xs" : "text-sm")}>
              {programa}
            </span>
          </div>
          <div className="col-span-2 flex flex-col gap-0.5">
            <span
              className={cn(
                "font-semibold uppercase tracking-wide text-[#9B8BAA]",
                compact ? "text-[9px]" : "text-[10px]",
              )}
            >
              Descrição
            </span>
            <span className={cn("font-semibold text-[#1F1F1F]", compact ? "text-xs" : "text-sm")}>
              {descricao}
            </span>
          </div>
          {codigoReserva?.trim() ? (
            <div className="col-span-2 flex flex-col gap-0.5">
              <span
                className={cn(
                  "font-semibold uppercase tracking-wide text-[#9B8BAA]",
                  compact ? "text-[9px]" : "text-[10px]",
                )}
              >
                Código da reserva (PNR)
              </span>
              <span
                className={cn(
                  "font-semibold tabular-nums tracking-wide text-[#1F1F1F]",
                  compact ? "font-mono text-xs uppercase" : "font-mono text-sm uppercase",
                )}
              >
                {codigoReserva.trim()}
              </span>
            </div>
          ) : null}
          {typeof passageiros === "number" ? (
            <div className="col-span-2 flex flex-col gap-0.5">
              <span
                className={cn(
                  "font-semibold uppercase tracking-wide text-[#9B8BAA]",
                  compact ? "text-[9px]" : "text-[10px]",
                )}
              >
                Passageiros
              </span>
              <span className={cn("font-semibold tabular-nums text-[#1F1F1F]", compact ? "text-xs" : "text-sm")}>
                {passageiros}
              </span>
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                "font-semibold uppercase tracking-wide text-[#9B8BAA]",
                compact ? "text-[9px]" : "text-[10px]",
              )}
            >
              Tipo
            </span>
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1 rounded-full bg-[#F3E8FF] font-semibold text-[#6A00A3]",
                compact ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-xs",
              )}
            >
              {tipoDetalhe}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                "font-semibold uppercase tracking-wide text-[#9B8BAA]",
                compact ? "text-[9px]" : "text-[10px]",
              )}
            >
              Milhas
            </span>
            <span
              className={cn(
                "font-semibold tabular-nums text-[#8A05BE]",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {formatMilhas(milhas)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                "font-semibold uppercase tracking-wide text-[#9B8BAA]",
                compact ? "text-[9px]" : "text-[10px]",
              )}
            >
              Data da Emissão
            </span>
            <span className={cn("font-semibold text-[#1F1F1F]", compact ? "text-xs" : "text-sm")}>
              {dataEmissao}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                "font-semibold uppercase tracking-wide text-[#9B8BAA]",
                compact ? "text-[9px]" : "text-[10px]",
              )}
            >
              Voo Ida
            </span>
            <span className={cn("font-semibold text-[#1F1F1F]", compact ? "text-xs" : "text-sm")}>
              {dataVooIda}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                "font-semibold uppercase tracking-wide text-[#9B8BAA]",
                compact ? "text-[9px]" : "text-[10px]",
              )}
            >
              Voo Volta
            </span>
            <span className={cn("font-semibold text-[#1F1F1F]", compact ? "text-xs" : "text-sm")}>
              {dataVooVolta}
            </span>
          </div>
        </div>

        {showFinance ? (
          <div className={cn("space-y-2 border-t border-[#EDE8F5]", compact ? "mt-3 pt-3" : "mt-4 pt-4")}>
            {typeof taxas === "number" && taxas > 0 ? (
              <div className={cn("flex justify-between", compact ? "text-xs" : "text-sm")}>
                <span className="text-[#9B8BAA]">Taxas / embarque</span>
                <span className="font-semibold tabular-nums text-[#1F1F1F]">{brl(taxas)}</span>
              </div>
            ) : null}
            {typeof tarifaPagante === "number" && tarifaPagante > 0 ? (
              <div className={cn("flex justify-between", compact ? "text-xs" : "text-sm")}>
                <span className="text-[#9B8BAA]">Tarifa pagante</span>
                <span className="font-semibold tabular-nums text-[#1F1F1F]">{brl(tarifaPagante)}</span>
              </div>
            ) : null}
            {typeof custoReal === "number" && custoReal > 0 ? (
              <div className={cn("flex justify-between", compact ? "text-xs" : "text-sm")}>
                <span className="text-[#9B8BAA]">
                  {emissaoFornecedor ? "Custo com fornecedor" : "Custo real"}
                </span>
                <span className="font-semibold tabular-nums text-[#1F1F1F]">{brl(custoReal)}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div
        className={cn(
          "flex items-center justify-between border-t border-[#EDE8F5] bg-[#FAF8FD]",
          compact ? "px-4 py-2.5" : "px-6 py-3.5",
        )}
      >
        <span
          className={cn(
            "font-medium tracking-wide text-[#B0A0C0]",
            compact ? "max-w-[58%] text-[8px] leading-snug" : "text-[10px]",
          )}
        >
          Gerado pelo Gest Miles · gestmiles.com.br
        </span>
        <span
          className={cn("flex items-center gap-1 font-bold text-[#8A05BE]", compact ? "text-[8px]" : "text-[10px]")}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#8A05BE]" />
          {status}
        </span>
      </div>
    </div>
  );
}
