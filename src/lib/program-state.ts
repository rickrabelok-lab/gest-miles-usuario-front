export type MovimentoTipo = "entrada" | "saida";

export type Movimento = {
  id: string;
  data: string;
  tipo: MovimentoTipo;
  descricao: string;
  milhas: number;
  lucrativa?: boolean;
  valorPago?: number;
  entradaTipo?: string;
  validadeLote?: string;
  origem?: string;
  destino?: string;
  /** Data do voo / ida (YYYY-MM-DD ou dd/mm/aaaa conforme gravado). */
  dataIda?: string;
  dataVolta?: string;
  /** Data em que a emissão foi registrada (YYYY-MM-DD recomendado). */
  dataEmissao?: string;
  classe?: string;
  passageiros?: number;
  taxas?: number;
  tarifaPagante?: number;
  economiaReal?: number;
  custoMilheiroBase?: number;
  /** Localizador / PNR quando aplicável. */
  codigoReserva?: string;
  /** Sobrenome como na emissão (bilheteira), para cruzar com o localizador. */
  sobrenomeEmissao?: string;
  /** Quem registrou a operação no app (gestor / usuário logado). */
  operadoPorNome?: string;
  /** true quando a emissão foi feita via fornecedor externo (não debita milhas do saldo). */
  emissaoFornecedor?: boolean;
  /** Valor pago ao fornecedor (R$), usado para calcular economia em emissões por fornecedor. */
  custoFornecedor?: number;
};

export type LoteMilhas = {
  id: string;
  validadeLote: string;
  quantidade: number;
};

export type PersistedProgramState = {
  saldo: number;
  movimentos: Movimento[];
  custoSaldo: number;
  custoMedioMilheiro: number;
  lotes: LoteMilhas[];
  /**
   * Marca quando o cliente gravou o estado localmente (ms). Usado para não
   * sobrescrever edições com um snapshot do servidor mais antigo (HMR, refetch).
   */
  _localRevisionMs?: number;
};

export type ProgramaClienteRow = {
  id: number;
  cliente_id: string;
  program_id: string;
  program_name: string;
  logo: string | null;
  logo_color: string | null;
  logo_image_url: string | null;
  clube_nome: string | null;
  saldo: number;
  custo_medio_milheiro: number;
  custo_saldo: number;
  state: PersistedProgramState | null;
  updated_at: string;
  created_at: string;
};

const emptyProgramState: PersistedProgramState = {
  saldo: 0,
  movimentos: [],
  custoSaldo: 0,
  custoMedioMilheiro: 0,
  lotes: [],
};

/** Normaliza JSON vindo do servidor ou do storage (sem metadados só-cliente). */
export function normalizePersistedProgramState(
  rowState: PersistedProgramState | null | undefined,
): PersistedProgramState {
  if (!rowState) return { ...emptyProgramState };
  return {
    saldo: Number(rowState.saldo ?? 0),
    movimentos: Array.isArray(rowState.movimentos) ? rowState.movimentos : [],
    custoSaldo: Number(rowState.custoSaldo ?? 0),
    custoMedioMilheiro: Number(rowState.custoMedioMilheiro ?? 0),
    lotes: Array.isArray(rowState.lotes) ? rowState.lotes : [],
  };
}

/** Payload enviado ao Supabase (sem `_localRevisionMs`). */
export function stripPersistedMetaForServer(state: PersistedProgramState): PersistedProgramState {
  return {
    saldo: state.saldo,
    movimentos: state.movimentos,
    custoSaldo: state.custoSaldo,
    custoMedioMilheiro: state.custoMedioMilheiro,
    lotes: state.lotes,
  };
}

/** Data usada pra ordenar o replay: saída usa quando foi registrada (dataEmissao), senão a data do movimento. */
function dataOrdenacaoMovimento(m: Movimento): Date | null {
  const bruto = m.tipo === "saida" ? (m.dataEmissao ?? m.data) : m.data;
  return parseMovimentoDate(bruto);
}

/** Ordena duas validades por vencimento (menor primeiro); não-parseáveis vão pro fim. */
function comparaValidade(a: string, b: string): number {
  const da = parseMovimentoDate(a);
  const db = parseMovimentoDate(b);
  if (da && db) return da.getTime() - db.getTime();
  if (da) return -1;
  if (db) return 1;
  return a.localeCompare(b);
}

/**
 * Reconstrói os lotes (milhas com validade) a partir do histórico de movimentos,
 * reproduzindo a MESMA regra viva do app: cada entrada com validade soma no seu
 * lote; cada saída debita FIFO dos lotes que vencem antes (`handleSalvarSaida`).
 *
 * Replay CRONOLÓGICO (por data): garante que uma saída só debita os lotes que já
 * existiam quando ela ocorreu. Sem isso, a reconstrução antiga somava só entradas
 * e ignorava saídas → `sum(lotes) > saldo` (milhas já emitidas apareciam "a vencer").
 *
 * `saldoMax` (quando informado): apara o excedente pra que `sum(lotes) ≤ saldoMax`.
 * O saldo é a verdade; movimentos incompletos/fora de ordem (data de emissão antes
 * do crédito) podem super-contar — o excedente é aparado pelos que vencem antes.
 */
export function reconstruirLotesDeMovimentos(
  movimentos: Movimento[],
  saldoMax?: number,
): LoteMilhas[] {
  const ordenados = (Array.isArray(movimentos) ? movimentos : [])
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const da = dataOrdenacaoMovimento(a.m);
      const db = dataOrdenacaoMovimento(b.m);
      if (da && db) {
        const delta = da.getTime() - db.getTime();
        if (delta !== 0) return delta;
      } else if (da && !db) {
        return -1;
      } else if (!da && db) {
        return 1;
      }
      return a.i - b.i; // estável quando as datas empatam ou faltam
    })
    .map((x) => x.m);

  // Map preserva a ordem de inserção (1ª aparição da validade); qty por validade.
  const porValidade = new Map<string, number>();

  for (const m of ordenados) {
    const milhas = Number(m.milhas) || 0;
    if (m.tipo === "entrada" && m.validadeLote && milhas > 0) {
      porValidade.set(m.validadeLote, (porValidade.get(m.validadeLote) ?? 0) + milhas);
    } else if (m.tipo === "saida" && !m.emissaoFornecedor) {
      // Emissão por fornecedor não debita milhas (não consome lotes). A saída pode
      // vir com sinal negativo (convenção antiga de importação) — debita pela magnitude.
      let restante = Math.abs(milhas);
      const comSaldo = [...porValidade.entries()]
        .filter(([, q]) => q > 0)
        .sort((a, b) => comparaValidade(a[0], b[0])); // FIFO por vencimento
      for (const [validade, qtd] of comSaldo) {
        if (restante <= 0) break;
        const debitado = Math.min(qtd, restante);
        porValidade.set(validade, qtd - debitado);
        restante -= debitado;
      }
      // Sobra (saída > lotes) consumiu saldo sem validade — descartada.
    }
  }

  const resultado = [...porValidade.entries()]
    .filter(([, q]) => q > 0)
    .sort((a, b) => comparaValidade(a[0], b[0]))
    .map(([validadeLote, quantidade]) => ({ id: validadeLote, validadeLote, quantidade }));

  // Invariante de domínio: lotes não podem somar mais que o saldo real. Apara o
  // excedente pelos que vencem antes (FIFO) — os que sobrariam já teriam saído.
  if (typeof saldoMax === "number" && Number.isFinite(saldoMax)) {
    const teto = Math.max(0, saldoMax);
    let excedente = resultado.reduce((s, l) => s + l.quantidade, 0) - teto;
    if (excedente > 0) {
      const aparado: LoteMilhas[] = [];
      for (const lote of resultado) {
        if (excedente <= 0) {
          aparado.push(lote);
          continue;
        }
        const corte = Math.min(lote.quantidade, excedente);
        excedente -= corte;
        const q = lote.quantidade - corte;
        if (q > 0) aparado.push({ ...lote, quantidade: q });
      }
      return aparado;
    }
  }

  return resultado;
}

export const parseMovimentoDate = (value?: string) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{2}\/\d{2}\/\d{2,4}$/.test(value)) {
    const [dd, mm, yy] = value.split("/");
    const year = yy.length === 2 ? Number(`20${yy}`) : Number(yy);
    const d = new Date(year, Number(mm) - 1, Number(dd));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};
