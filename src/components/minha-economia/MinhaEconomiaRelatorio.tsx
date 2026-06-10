// Relatório "Minha Economia" (port mobile do RelatorioPremium do manager):
// hero compacto Clean Stripe + extrato por mês + case destaque + consolidado.
// Visual puro — recebe o retorno parseado da RPC. Usado na tela E no print.
import { cn } from "@/lib/utils";
import {
  COTACAO_STATUS_LABELS,
  TIPO_EVENTO_LABELS,
  custoComGestaoEmissao,
  formatBRL,
  formatMilhasBR,
  groupEventosByMes,
  resumoEvento,
  type CotacaoStatus,
  type RelatorioEconomia,
  type RelatorioEventoEmissao,
  type RelatorioEventoManual,
} from "@/lib/relatorio-economia";

interface MinhaEconomiaRelatorioProps {
  periodoLabel: string;
  data: RelatorioEconomia;
}

const fmtData = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? ymd
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const CHIP: Record<string, string> = {
  emissao: "bg-purple-50 text-[#8A05BE]",
  cotacao: "bg-sky-50 text-sky-700",
  promocao: "bg-green-50 text-green-700",
  oportunidade: "bg-amber-50 text-amber-700",
  nota: "bg-slate-100 text-slate-600",
  case_emissao: "bg-purple-50 text-[#8A05BE]",
};

export function MinhaEconomiaRelatorio({ periodoLabel, data }: MinhaEconomiaRelatorioProps) {
  const { kpis, eventos, caseDestaque } = data;
  // A RPC já filtra eventos internos pro cliente (guard server-side) — sem refiltro aqui.
  const emissoes = eventos.filter((e): e is RelatorioEventoEmissao => e.origem === "emissao");
  const grupos = groupEventosByMes(eventos.filter((e) => e.origem === "emissao" || e.tipo !== "case_emissao"));

  const casePayload = (caseDestaque?.payload ?? null) as
    | { linhas?: Array<Record<string, unknown>>; snapshot?: Record<string, unknown> }
    | null;
  const snapshot = (casePayload?.snapshot ?? null) as
    | { custoTotalInvestido?: number; custoMilheiroReal?: number | null; pctCustoZero?: number | null; economia?: number | null }
    | null;

  const subtotal = emissoes.reduce((s, e) => s + (e.economia ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Hero compacto Clean Stripe */}
      <header className="relatorio-bloco overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-nubank">
        <div className="h-[4px] bg-[#8A05BE]" aria-hidden />
        <div className="px-4 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A05BE]">
            Minha economia · {periodoLabel}
          </p>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
            <p className="text-3xl font-extrabold leading-none text-green-600">
              {formatBRL(kpis.economiaTotal)}
            </p>
            <p className="text-xs text-gray-500">economizados com a gestão</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[#f0e9f7] px-3 py-2">
              <p className="text-sm font-extrabold leading-tight">{kpis.numEmissoes}</p>
              <p className="text-[10px] text-gray-500">emissões</p>
            </div>
            <div className="rounded-xl border border-[#f0e9f7] px-3 py-2">
              <p className="text-sm font-extrabold leading-tight">{kpis.numCotacoes}</p>
              <p className="text-[10px] text-gray-500">cotações entregues</p>
            </div>
            <div className="rounded-xl border border-[#f0e9f7] px-3 py-2">
              <p className="text-sm font-extrabold leading-tight text-[#8A05BE]">
                {formatMilhasBR(kpis.milhasGeradasPromocoes)}
              </p>
              <p className="text-[10px] text-gray-500">
                milhas geradas{kpis.milhasCustoZero > 0 ? ` (${formatMilhasBR(kpis.milhasCustoZero)} a custo zero)` : ""}
              </p>
            </div>
            <div className="rounded-xl border border-[#f0e9f7] px-3 py-2">
              <p className="text-sm font-extrabold leading-tight">
                {kpis.custoMilheiroMedio !== null ? formatBRL(kpis.custoMilheiroMedio) : "—"}
              </p>
              <p className="text-[10px] text-gray-500">milheiro real</p>
            </div>
          </div>
        </div>
      </header>

      {/* Extrato por mês */}
      <section className="space-y-3">
        {grupos.length === 0 && (
          <p className="rounded-2xl bg-white px-4 py-8 text-center text-xs text-gray-500 shadow-nubank">
            Nenhum evento no período ainda. Sua equipe de gestão registra cotações, promoções e
            emissões aqui — e a economia aparece automaticamente.
          </p>
        )}
        {grupos.map((grupo) => (
          <div key={grupo.chave} className="relatorio-bloco">
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#8A05BE]">{grupo.rotulo}</p>
              <div className="h-px flex-1 bg-gradient-to-r from-[#8A05BE]/25 to-transparent" aria-hidden />
            </div>
            <ul className="space-y-1.5">
              {grupo.eventos.map((ev) => {
                const tipoKey = ev.origem === "emissao" ? "emissao" : ev.tipo;
                const emissao = ev.origem === "emissao" ? (ev as RelatorioEventoEmissao) : null;
                const manual = ev.origem === "manual" ? (ev as RelatorioEventoManual) : null;
                const status = manual?.tipo === "cotacao" ? ((manual.payload.status as CotacaoStatus) ?? "entregue") : null;
                return (
                  <li key={`${ev.origem}-${ev.id}`} className="rounded-2xl border border-gray-100 bg-white px-3.5 py-3 shadow-nubank">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide", CHIP[tipoKey] ?? "bg-slate-100")}>
                            {TIPO_EVENTO_LABELS[tipoKey as keyof typeof TIPO_EVENTO_LABELS]}
                          </span>
                          {status && (
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[9px] font-bold uppercase",
                              status === "fechou" && "bg-green-100 text-green-700",
                              status === "nao_fechou" && "bg-red-50 text-red-600",
                              status === "entregue" && "bg-sky-100 text-sky-700",
                              status === "expirou" && "bg-slate-100 text-slate-500",
                            )}>
                              {COTACAO_STATUS_LABELS[status]}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400">{fmtData(ev.dataEvento)}</span>
                        </div>
                        <p className="mt-0.5 text-[13px] font-semibold leading-tight text-gray-900">
                          {emissao ? `${emissao.rotaOrigem ?? "?"} → ${emissao.rotaDestino ?? "?"} · ${emissao.titulo}` : ev.titulo}
                        </p>
                        {emissao && (
                          <p className="text-[11px] text-gray-600">
                            {emissao.emissaoFornecedor
                              ? `via fornecedor${emissao.custoFornecedor ? ` · custo ${formatBRL(emissao.custoFornecedor)}` : ""}`
                              : `${formatMilhasBR(emissao.milhasUtilizadas)} milhas${emissao.taxaEmbarque ? ` + ${formatBRL(emissao.taxaEmbarque)} taxas` : ""}`}
                          </p>
                        )}
                        {manual && resumoEvento(manual) && (
                          <p className="text-[11px] text-gray-600">{resumoEvento(manual)}</p>
                        )}
                        {manual?.descricao && (
                          <p className="mt-0.5 text-[11px] text-gray-500">{manual.descricao}</p>
                        )}
                      </div>
                      {emissao?.economia != null && (
                        <div className="shrink-0 text-right">
                          <p className="text-[8.5px] font-bold uppercase tracking-widest text-green-700/70">Economia</p>
                          <p className="text-[13px] font-extrabold text-green-600">+{formatBRL(emissao.economia)}</p>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      {/* Case destaque */}
      {caseDestaque && casePayload?.linhas && casePayload.linhas.length > 0 && (
        <section className="relatorio-bloco overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-nubank">
          <div className="h-[4px] bg-gradient-to-r from-[#8A05BE] to-[#5d03a0]" aria-hidden />
          <div className="space-y-2.5 px-4 py-3.5">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A05BE]">
              Emissão destaque — como suas milhas foram construídas
            </h2>
            <p className="text-[13px] font-semibold text-gray-900">{String(caseDestaque.titulo ?? "")}</p>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[9px] uppercase tracking-wide text-gray-400">
                  <th className="py-1.5 pr-2 font-bold">Origem das milhas</th>
                  <th className="py-1.5 pr-2 text-right font-bold">Milhas</th>
                  <th className="py-1.5 text-right font-bold">Custo</th>
                </tr>
              </thead>
              <tbody>
                {casePayload.linhas.map((l, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-1.5 pr-2">{String(l.label ?? l.origemTipo ?? "")}</td>
                    <td className="py-1.5 pr-2 text-right">{formatMilhasBR(Number(l.milhas) || 0)}</td>
                    <td className="py-1.5 text-right">
                      {Number(l.custo) > 0 ? formatBRL(Number(l.custo)) : <span className="font-semibold text-green-600">custo zero</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {snapshot && (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-[#f5eeff] px-3 py-2">
                  <p className="text-[13px] font-extrabold">{formatBRL(Number(snapshot.custoTotalInvestido) || 0)}</p>
                  <p className="text-[9px] text-gray-500">custo total investido</p>
                </div>
                <div className="rounded-xl bg-[#f5eeff] px-3 py-2">
                  <p className="text-[13px] font-extrabold">
                    {snapshot.custoMilheiroReal != null ? formatBRL(Number(snapshot.custoMilheiroReal)) : "—"}
                  </p>
                  <p className="text-[9px] text-gray-500">milheiro real</p>
                </div>
                <div className="rounded-xl bg-[#f5eeff] px-3 py-2">
                  <p className="text-[13px] font-extrabold">
                    {snapshot.pctCustoZero != null ? `${Number(snapshot.pctCustoZero).toLocaleString("pt-BR")}%` : "—"}
                  </p>
                  <p className="text-[9px] text-gray-500">das milhas a custo zero</p>
                </div>
                <div className="rounded-xl bg-green-50 px-3 py-2">
                  <p className="text-[13px] font-extrabold text-green-600">
                    {snapshot.economia != null ? `+${formatBRL(Number(snapshot.economia))}` : "—"}
                  </p>
                  <p className="text-[9px] text-gray-500">economia nesta emissão</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Resumo consolidado */}
      {emissoes.length > 0 && (
        <section className="relatorio-bloco rounded-2xl border border-gray-100 bg-white px-4 py-3.5 shadow-nubank">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8A05BE]">Resumo consolidado</h2>
          <table className="mt-2 w-full text-[11px]">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[9px] uppercase tracking-wide text-gray-400">
                <th className="py-1.5 pr-2 font-bold">Data</th>
                <th className="py-1.5 pr-2 font-bold">Operação</th>
                <th className="py-1.5 pr-2 text-right font-bold">Custo</th>
                <th className="py-1.5 text-right font-bold">Economia</th>
              </tr>
            </thead>
            <tbody>
              {emissoes.map((e) => {
                const custo = custoComGestaoEmissao(e);
                return (
                  <tr key={e.id} className="border-b border-gray-50">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{fmtData(e.dataEvento)}</td>
                    <td className="py-1.5 pr-2">
                      {e.rotaOrigem ?? "?"} → {e.rotaDestino ?? "?"}
                      {e.emissaoFornecedor ? " (fornecedor)" : ""}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{custo != null ? formatBRL(custo) : "—"}</td>
                    <td className="py-1.5 text-right font-semibold text-green-600">
                      {e.economia != null ? `+${formatBRL(e.economia)}` : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={3} className="py-2 pr-2 text-right text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  Total
                </td>
                <td className="py-2 text-right text-[13px] font-extrabold text-green-600">+{formatBRL(subtotal)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Metodologia */}
      <footer className="relatorio-bloco rounded-2xl bg-white/70 px-4 py-3 text-[10px] leading-relaxed text-gray-500 print:bg-white">
        Os valores de economia são calculados automaticamente pela sua equipe de gestão: preço de
        mercado da passagem no dia de cada emissão, menos o seu custo real — milhas valoradas pelo
        custo médio do milheiro da sua conta no momento da emissão (ou custo do fornecedor), mais
        taxas de embarque.
      </footer>
    </div>
  );
}
