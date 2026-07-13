// Port READ-ONLY da lib do manager (repos não compartilham código — mesmo
// processo do port do ProgramSelectionSheet). Fonte dos dados: RPC
// get_relatorio_economia (guard server-side: cliente lê só o próprio relatório,
// eventos internos já vêm filtrados, economia calculada via CPM real).

export type RelatorioEventoTipo = "cotacao" | "promocao" | "oportunidade" | "nota" | "case_emissao";
export type CotacaoStatus = "entregue" | "fechou" | "nao_fechou" | "expirou";

export const TIPO_EVENTO_LABELS: Record<RelatorioEventoTipo | "emissao", string> = {
  emissao: "Emissão",
  cotacao: "Cotação",
  promocao: "Promoção",
  oportunidade: "Oportunidade",
  nota: "Nota",
  case_emissao: "Emissão destaque",
};

export const COTACAO_STATUS_LABELS: Record<CotacaoStatus, string> = {
  entregue: "Entregue",
  fechou: "Fechou ✓",
  nao_fechou: "Não fechou",
  expirou: "Expirou",
};

/** Cópia local dos rótulos de classe (o manager importa de demandaDisplayUtils). */
export const CLASSE_VOO_LABELS: Record<string, string> = {
  economica: "Econômica",
  "premium-economy": "Premium Economy",
  executiva: "Executiva",
  "primeira-classe": "Primeira classe",
};

export type RelatorioEventoManual = {
  id: string;
  origem: "manual";
  tipo: RelatorioEventoTipo;
  /** YYYY-MM-DD */
  dataEvento: string;
  titulo: string;
  descricao: string;
  visivelCliente: boolean;
  payload: Record<string, unknown>;
};

export type RelatorioEventoEmissao = {
  id: string;
  origem: "emissao";
  tipo: "emissao";
  dataEvento: string;
  titulo: string;
  rotaOrigem: string | null;
  rotaDestino: string | null;
  classe: string | null;
  milhasUtilizadas: number;
  taxaEmbarque: number;
  emissaoFornecedor: boolean;
  tarifaPagante: number | null;
  custoFornecedor: number | null;
  passageiros: number | null;
  /** CPM usado no cálculo automático server-side. */
  cpmMilheiro?: number | null;
  /** Economia calculada server-side (tarifa − custo real). */
  economia: number | null;
};

export type RelatorioEvento = RelatorioEventoManual | RelatorioEventoEmissao;

export type FunilCotacoes = {
  entregues: number;
  fechadas: number;
  naoFechadas: number;
  expiradas: number;
};

export type RelatorioKpis = {
  economiaEmissoes: number;
  economiaTotal: number;
  numEmissoes: number;
  numCotacoes: number;
  funilCotacoes: FunilCotacoes;
  milhasGeradasPromocoes: number;
  milhasCustoZero: number;
  custoMilheiroMedio: number | null;
};

export type RelatorioEconomia = {
  kpis: RelatorioKpis;
  eventos: RelatorioEvento[];
  caseDestaque: Record<string, unknown> | null;
};

export const formatBRL = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatMilhasBR = (v: number): string => v.toLocaleString("pt-BR");

/**
 * Apresentação de um valor de economia. Economia é `tarifa − custo real` e PODE
 * ser negativa (emissão que custou mais que a tarifa paga = prejuízo). O positivo
 * é "Economia" (verde, com "+"); o negativo é "Resultado" (vermelho, com o "-" que
 * o próprio formatBRL já traz — sem "+" pra não sair "+-R$").
 */
export function apresentacaoEconomia(v: number): {
  rotulo: "Economia" | "Resultado";
  texto: string;
  classe: string;
  negativo: boolean;
} {
  const n = Number(v);
  const negativo = Number.isFinite(n) && n < 0;
  return {
    rotulo: negativo ? "Resultado" : "Economia",
    texto: (negativo ? "" : "+") + formatBRL(negativo ? n : Number.isFinite(n) ? n : 0),
    classe: negativo ? "text-red-600" : "text-green-600",
    negativo,
  };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Nome amigável do programa: o payload guarda slug ("smiles", "latam-pass") ou
 * texto livre ("Itaú"). Sem registry neste repo — prettifica o slug localmente.
 */
export function nomePrograma(v: string): string {
  const s = v.trim();
  if (!s) return s;
  if (s !== s.toLowerCase()) return s; // já formatado (tem maiúscula)
  return s
    .split("-")
    .map((parte) => (parte ? parte.charAt(0).toUpperCase() + parte.slice(1) : parte))
    .join(" ");
}

const emptyKpis = (): RelatorioKpis => ({
  economiaEmissoes: 0,
  economiaTotal: 0,
  numEmissoes: 0,
  numCotacoes: 0,
  funilCotacoes: { entregues: 0, fechadas: 0, naoFechadas: 0, expiradas: 0 },
  milhasGeradasPromocoes: 0,
  milhasCustoZero: 0,
  custoMilheiroMedio: null,
});

/** Normaliza o jsonb devolvido por get_relatorio_economia. */
export function parseRelatorioEconomia(raw: unknown): RelatorioEconomia {
  const r = (raw ?? {}) as Record<string, unknown>;
  const k = (r.kpis ?? {}) as Record<string, unknown>;
  const f = (k.funilCotacoes ?? {}) as Record<string, unknown>;
  const economiaEmissoes = num(k.economiaEmissoes) ?? 0;
  const kpis: RelatorioKpis = {
    economiaEmissoes,
    economiaTotal: num(k.economiaTotal) ?? economiaEmissoes,
    numEmissoes: num(k.numEmissoes) ?? 0,
    numCotacoes: num(k.numCotacoes) ?? 0,
    funilCotacoes: {
      entregues: num(f.entregues) ?? 0,
      fechadas: num(f.fechadas) ?? 0,
      naoFechadas: num(f.naoFechadas) ?? 0,
      expiradas: num(f.expiradas) ?? 0,
    },
    milhasGeradasPromocoes: num(k.milhasGeradasPromocoes) ?? 0,
    milhasCustoZero: num(k.milhasCustoZero) ?? 0,
    custoMilheiroMedio: num(k.custoMilheiroMedio),
  };
  const eventos = Array.isArray(r.eventos) ? (r.eventos as RelatorioEvento[]) : [];
  const caseDestaque =
    r.caseDestaque && typeof r.caseDestaque === "object"
      ? (r.caseDestaque as Record<string, unknown>)
      : null;
  return { kpis: { ...emptyKpis(), ...kpis }, eventos, caseDestaque };
}

export function groupEventosByMes(
  eventos: RelatorioEvento[],
): Array<{ chave: string; rotulo: string; eventos: RelatorioEvento[] }> {
  const sorted = [...eventos].sort((a, b) => b.dataEvento.localeCompare(a.dataEvento));
  const grupos: Array<{ chave: string; rotulo: string; eventos: RelatorioEvento[] }> = [];
  for (const ev of sorted) {
    const chave = ev.dataEvento.slice(0, 7);
    const atual = grupos[grupos.length - 1];
    if (atual && atual.chave === chave) {
      atual.eventos.push(ev);
    } else {
      const rotulo = new Date(`${chave}-01T12:00:00`).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      });
      grupos.push({ chave, rotulo, eventos: [ev] });
    }
  }
  return grupos;
}

/** Custo real da emissão pro cliente ("custo com gestão" do consolidado). */
export function custoComGestaoEmissao(e: RelatorioEventoEmissao): number | null {
  if (e.emissaoFornecedor) return e.custoFornecedor ?? null;
  const cpm = num(e.cpmMilheiro);
  if (cpm !== null) return (e.milhasUtilizadas / 1000) * cpm + (e.taxaEmbarque || 0);
  return null;
}

/** Linha de detalhes de um evento manual (port do resumoManual do manager). */
export function resumoEvento(ev: RelatorioEventoManual): string | null {
  const p = ev.payload;
  const partes: string[] = [];
  if (ev.tipo === "cotacao") {
    const origem = str(p.origem);
    const destino = str(p.destino);
    if (origem || destino) partes.push(`${origem || "?"} → ${destino || "?"}`);
    const classe = str(p.classe);
    if (classe) partes.push(CLASSE_VOO_LABELS[classe] ?? classe);
    const milhas = num(p.milhasCotadas);
    const taxas = num(p.taxasCotadas);
    if (milhas) partes.push(`${formatMilhasBR(milhas)} milhas${taxas ? ` + ${formatBRL(taxas)}` : ""}`);
    const pagante = num(p.valorPagante);
    if (pagante) partes.push(`pagante ${formatBRL(pagante)}`);
  } else if (ev.tipo === "promocao") {
    const de = str(p.programaOrigem);
    const para = str(p.programaDestino);
    if (de || para) partes.push(`${de ? nomePrograma(de) : "?"} → ${para ? nomePrograma(para) : "?"}`);
    const pontos = num(p.pontosTransferidos);
    const bonus = num(p.bonusPct);
    if (pontos) partes.push(`${formatMilhasBR(pontos)} pts${bonus ? ` +${bonus}%` : ""}`);
    const geradas = num(p.milhasGeradas);
    if (geradas) partes.push(`${formatMilhasBR(geradas)} milhas geradas`);
    const custo = num(p.custoCliente);
    partes.push(custo ? `custo ${formatBRL(custo)}` : "custo zero");
  } else if (ev.tipo === "oportunidade") {
    const origem = str(p.origem);
    const destino = str(p.destino);
    if (origem || destino) partes.push(`${origem || "?"} → ${destino || "?"}`);
    const perdido = num(p.valorEstimadoPerdido);
    if (perdido) partes.push(`valor estimado ${formatBRL(perdido)}`);
  } else if (ev.tipo === "case_emissao") {
    const snap = (p.snapshot ?? null) as
      | { custoTotalInvestido?: number; custoMilheiroReal?: number | null; pctCustoZero?: number | null }
      | null;
    if (snap) {
      const custoTotal = num(snap.custoTotalInvestido);
      if (custoTotal !== null) partes.push(`investido ${formatBRL(custoTotal)}`);
      const cpm = num(snap.custoMilheiroReal);
      if (cpm !== null) partes.push(`milheiro real ${formatBRL(cpm)}`);
      const pct = num(snap.pctCustoZero);
      if (pct !== null) partes.push(`${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% a custo zero`);
    }
  }
  return partes.length > 0 ? partes.join(" · ") : null;
}
