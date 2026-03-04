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
  classe?: string;
  passageiros?: number;
  taxas?: number;
  tarifaPagante?: number;
  economiaReal?: number;
  custoMilheiroBase?: number;
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

export const emptyProgramState: PersistedProgramState = {
  saldo: 0,
  movimentos: [],
  custoSaldo: 0,
  custoMedioMilheiro: 0,
  lotes: [],
};

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
