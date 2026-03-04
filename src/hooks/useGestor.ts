import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { parseMovimentoDate } from "@/lib/program-state";

export type RiscoCarteira = "baixo" | "medio" | "alto";

export type GestorClienteResumo = {
  clienteId: string;
  nome: string;
  milhas: number;
  valorEstimado: number;
  pontosVencendo90d: number;
  roiMedio: number;
  ultimaAtualizacao: string | null;
  /** Economia total gerada (soma economiaReal das saídas) */
  economiaTotal: number;
  /** Melhor economia por milheiro já obtida em uma emissão (R$/milheiro) */
  melhorMilheiro: number | null;
  /** Data da última movimentação (qualquer tipo) */
  ultimaMovimentacao: string | null;
  /** Maior % de milhas em um único programa (0-100) */
  concentracaoMaxima: number;
  /** Score estratégico 0-100 */
  scoreEstrategico: number;
  riscoCarteira: RiscoCarteira;
};

export type DrePeriodo = {
  entradasTotal: number;
  economiaTotal: number;
  roiPercentual: number;
  lucroEstrategico: number;
};

export type GestorDreConsolidado = {
  ultimos30dias: DrePeriodo;
  ultimos90dias: DrePeriodo;
  ultimos12meses: DrePeriodo;
  totalHistorico: DrePeriodo;
};

export type GestorVencimentoItem = {
  clienteId: string;
  clienteNome: string;
  programId: string;
  programName: string;
  data: string;
  diasRestantes: number;
  quantidade: number;
};

export const useGestor = (enabled = true) => {
  const clientsQuery = useQuery({
    queryKey: ["gestor_clientes"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gestor_clientes")
        .select("cliente_id");
      if (error) throw error;
      return (data ?? []).map((row) => row.cliente_id as string);
    },
  });

  const profilesQuery = useQuery({
    queryKey: ["gestor_clientes_perfis", clientsQuery.data],
    enabled: enabled && !!clientsQuery.data?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perfis")
        .select("usuario_id, nome_completo")
        .in("usuario_id", clientsQuery.data!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const programsQuery = useQuery({
    queryKey: ["gestor_programas_cliente", clientsQuery.data],
    enabled: enabled && !!clientsQuery.data?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programas_cliente")
        .select("cliente_id, program_id, program_name, saldo, custo_medio_milheiro, updated_at, state")
        .in("cliente_id", clientsQuery.data!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const resumoClientes = useMemo<GestorClienteResumo[]>(() => {
    const profiles = new Map<string, string>();
    (profilesQuery.data ?? []).forEach((row) => {
      profiles.set(row.usuario_id as string, (row.nome_completo as string) ?? "Cliente");
    });

    const grouped = new Map<
      string,
      GestorClienteResumo & {
        milhasPorPrograma: Map<string, number>;
        economiaSoma: number;
        roiSoma: number;
        roiCount: number;
        melhorMilheiroVal: number | null;
        ultimaMov: string | null;
      }
    >();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stateRow = (row: (typeof programsQuery.data)[number]) =>
      (row?.state ?? {}) as {
        lotes?: Array<{ validadeLote?: string; quantidade?: number }>;
        movimentos?: Array<{
          tipo?: string;
          economiaReal?: number;
          data?: string;
          valorPago?: number;
          milhas?: number;
        }>;
      };

    (programsQuery.data ?? []).forEach((row) => {
      const clientId = row.cliente_id as string;
      const programId = (row.program_id as string) ?? "";
      const current = grouped.get(clientId);
      const base = {
        clienteId,
        nome: profiles.get(clientId) ?? "Cliente",
        milhas: 0,
        valorEstimado: 0,
        pontosVencendo90d: 0,
        roiMedio: 0,
        ultimaAtualizacao: null as string | null,
        economiaTotal: 0,
        melhorMilheiro: null as number | null,
        ultimaMovimentacao: null as string | null,
        concentracaoMaxima: 0,
        scoreEstrategico: 0,
        riscoCarteira: "baixo" as RiscoCarteira,
        milhasPorPrograma: new Map<string, number>(),
        economiaSoma: 0,
        roiSoma: 0,
        roiCount: 0,
        melhorMilheiroVal: null as number | null,
        ultimaMov: null as string | null,
      };
      const cur = current ?? { ...base, milhasPorPrograma: new Map() };
      if (!current) grouped.set(clientId, cur);

      const saldo = Number(row.saldo ?? 0);
      const cpm = Number(row.custo_medio_milheiro ?? 0);
      cur.milhas += saldo;
      cur.valorEstimado += (saldo / 1000) * cpm;
      cur.milhasPorPrograma.set(programId, (cur.milhasPorPrograma.get(programId) ?? 0) + saldo);

      const state = stateRow(row);
      (state.lotes ?? []).forEach((lote) => {
        if (!lote.validadeLote) return;
        const validade = new Date(`${lote.validadeLote}T00:00:00`);
        const dias = Math.ceil(
          (validade.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (dias >= 0 && dias <= 90) {
          cur.pontosVencendo90d += Number(lote.quantidade ?? 0);
        }
      });

      const movimentos = state.movimentos ?? [];
      const saidas = movimentos.filter((m) => m.tipo === "saida");
      saidas.forEach((m) => {
        const economia = typeof m.economiaReal === "number" ? m.economiaReal : 0;
        cur.economiaSoma += economia;
        if (economia !== 0) {
          cur.roiSoma += economia;
          cur.roiCount += 1;
        }
        const milhas = Number(m.milhas ?? 0);
        if (milhas > 0 && typeof m.economiaReal === "number") {
          const porMilheiro = (m.economiaReal / milhas) * 1000;
          if (cur.melhorMilheiroVal === null || porMilheiro > cur.melhorMilheiroVal) {
            cur.melhorMilheiroVal = porMilheiro;
          }
        }
      });
      movimentos.forEach((m) => {
        if (!m.data) return;
        if (!cur.ultimaMov || m.data > cur.ultimaMov) cur.ultimaMov = m.data;
      });

      if (!cur.ultimaAtualizacao || (row.updated_at as string) > cur.ultimaAtualizacao) {
        cur.ultimaAtualizacao = row.updated_at as string;
      }

      grouped.set(clientId, cur);
    });

    const result: GestorClienteResumo[] = [];
    grouped.forEach((cur) => {
      cur.roiMedio = cur.roiCount > 0 ? cur.roiSoma / cur.roiCount : 0;
      cur.economiaTotal = cur.economiaSoma;
      cur.melhorMilheiro = cur.melhorMilheiroVal;
      cur.ultimaMovimentacao = cur.ultimaMov;
      const totalMilhas = cur.milhas || 1;
      let maxPct = 0;
      cur.milhasPorPrograma.forEach((m) => {
        const pct = (m / totalMilhas) * 100;
        if (pct > maxPct) maxPct = pct;
      });
      cur.concentracaoMaxima = maxPct;

      const roiNorm = Math.min(1, Math.max(0, (cur.roiMedio + 500) / 1000));
      const vencendoNorm = cur.milhas
        ? 1 - Math.min(1, cur.pontosVencendo90d / cur.milhas)
        : 1;
      const diversificacao = 1 - cur.concentracaoMaxima / 100;
      const atividade = cur.ultimaMov ? 1 : 0;
      cur.scoreEstrategico = Math.round(
        roiNorm * 30 + vencendoNorm * 25 + diversificacao * 25 + atividade * 20,
      );
      cur.scoreEstrategico = Math.min(100, Math.max(0, cur.scoreEstrategico));

      const riscoConcentracao = cur.concentracaoMaxima > 60;
      const riscoVencendo = cur.milhas > 0 && cur.pontosVencendo90d / cur.milhas > 0.2;
      const riscoRoi = cur.roiMedio < 0;
      if (riscoConcentracao || riscoVencendo || riscoRoi) {
        cur.riscoCarteira = "alto";
      } else if (
        cur.concentracaoMaxima > 40 ||
        (cur.milhas > 0 && cur.pontosVencendo90d / cur.milhas > 0.1)
      ) {
        cur.riscoCarteira = "medio";
      } else {
        cur.riscoCarteira = "baixo";
      }

      result.push({
        clienteId: cur.clienteId,
        nome: cur.nome,
        milhas: cur.milhas,
        valorEstimado: cur.valorEstimado,
        pontosVencendo90d: cur.pontosVencendo90d,
        roiMedio: cur.roiMedio,
        ultimaAtualizacao: cur.ultimaAtualizacao,
        economiaTotal: cur.economiaTotal,
        melhorMilheiro: cur.melhorMilheiro,
        ultimaMovimentacao: cur.ultimaMovimentacao,
        concentracaoMaxima: cur.concentracaoMaxima,
        scoreEstrategico: cur.scoreEstrategico,
        riscoCarteira: cur.riscoCarteira,
      });
    });

    return result;
  }, [profilesQuery.data, programsQuery.data]);

  const vencimentosTodosClientes = useMemo<GestorVencimentoItem[]>(() => {
    const profiles = new Map<string, string>();
    (profilesQuery.data ?? []).forEach((row) => {
      profiles.set(row.usuario_id as string, (row.nome_completo as string) ?? "Cliente");
    });

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const msDia = 1000 * 60 * 60 * 24;
    const items: GestorVencimentoItem[] = [];

    (programsQuery.data ?? []).forEach((row) => {
      const clientId = row.cliente_id as string;
      const clientName = profiles.get(clientId) ?? "Cliente";
      const programId = (row.program_id as string) ?? "";
      const programName = (row.program_name as string) ?? "Programa";

      const state = (row.state ?? {}) as {
        lotes?: Array<{ validadeLote?: string; quantidade?: number }>;
        movimentos?: Array<{
          tipo?: string;
          validadeLote?: string;
          milhas?: number;
        }>;
      };

      const lotes = (state.lotes ?? [])
        .filter((l) => !!l.validadeLote && (l.quantidade ?? 0) > 0)
        .map((l) => ({
          validadeLote: l.validadeLote as string,
          quantidade: Number(l.quantidade ?? 0),
        }));

      const fallbackLotes =
        lotes.length > 0
          ? lotes
          : (state.movimentos ?? [])
              .filter(
                (m) =>
                  m.tipo === "entrada" &&
                  !!m.validadeLote &&
                  Number(m.milhas ?? 0) > 0,
              )
              .map((m) => ({
                validadeLote: m.validadeLote as string,
                quantidade: Number(m.milhas ?? 0),
              }));

      fallbackLotes.forEach((lote) => {
        const validade = new Date(`${lote.validadeLote}T00:00:00`);
        if (Number.isNaN(validade.getTime())) return;
        const diasRestantes = Math.ceil(
          (validade.getTime() - hoje.getTime()) / msDia,
        );
        if (diasRestantes < 0) return;
        items.push({
          clienteId,
          clienteNome: clientName,
          programId,
          programName,
          data: validade.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
          diasRestantes,
          quantidade: lote.quantidade,
        });
      });
    });

    return items.sort((a, b) => a.diasRestantes - b.diasRestantes);
  }, [profilesQuery.data, programsQuery.data]);

  const kpis = useMemo(() => {
    const totalClientesAtivos = resumoClientes.length;
    const milhasSobGestao = resumoClientes.reduce((acc, c) => acc + c.milhas, 0);
    const valorEstrategicoTotal = resumoClientes.reduce(
      (acc, c) => acc + c.valorEstimado,
      0,
    );
    const milhasVencendo90d = resumoClientes.reduce(
      (acc, c) => acc + c.pontosVencendo90d,
      0,
    );
    const economiaTotalGestao = resumoClientes.reduce(
      (acc, c) => acc + c.economiaTotal,
      0,
    );
    const clientesComVencendo90d = resumoClientes.filter(
      (c) => c.pontosVencendo90d > 0,
    ).length;
    const roiMedio = totalClientesAtivos
      ? resumoClientes.reduce((acc, c) => acc + c.roiMedio, 0) / totalClientesAtivos
      : 0;
    return {
      totalClientesAtivos,
      milhasSobGestao,
      valorEstrategicoTotal,
      milhasVencendo90d,
      roiMedio,
      economiaTotalGestao,
      clientesComVencendo90d,
    };
  }, [resumoClientes]);

  const dreConsolidado = useMemo<GestorDreConsolidado>(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msDay = 1000 * 60 * 60 * 24;
    const periodos = [
      { dias: 30, key: "ultimos30dias" as const },
      { dias: 90, key: "ultimos90dias" as const },
      { dias: 365, key: "ultimos12meses" as const },
      { dias: 365 * 20, key: "totalHistorico" as const },
    ];

    const empty: DrePeriodo = {
      entradasTotal: 0,
      economiaTotal: 0,
      roiPercentual: 0,
      lucroEstrategico: 0,
    };

    const acc: Record<string, { entradas: number; economia: number }> = {
      ultimos30dias: { entradas: 0, economia: 0 },
      ultimos90dias: { entradas: 0, economia: 0 },
      ultimos12meses: { entradas: 0, economia: 0 },
      totalHistorico: { entradas: 0, economia: 0 },
    };

    (programsQuery.data ?? []).forEach((row) => {
      const state = (row.state ?? {}) as {
        movimentos?: Array<{
          tipo?: string;
          data?: string;
          valorPago?: number;
          economiaReal?: number;
        }>;
      };
      (state.movimentos ?? []).forEach((m) => {
        const date = parseMovimentoDate(m.data);
        if (!date) return;
        const t = date.getTime();
        const diasAtras = (today.getTime() - t) / msDay;
        if (diasAtras < 0) return;
        const entradas = m.tipo === "entrada" ? Number(m.valorPago ?? 0) : 0;
        const economia = m.tipo === "saida" ? Number(m.economiaReal ?? 0) : 0;
        periodos.forEach(({ dias, key }) => {
          if (diasAtras <= dias) {
            acc[key].entradas += entradas;
            acc[key].economia += economia;
          }
        });
      });
    });

    const build = (key: keyof typeof acc): DrePeriodo => {
      const e = acc[key].entradas;
      const ec = acc[key].economia;
      return {
        entradasTotal: e,
        economiaTotal: ec,
        roiPercentual: e > 0 ? (ec / e) * 100 : 0,
        lucroEstrategico: ec,
      };
    };

    return {
      ultimos30dias: build("ultimos30dias"),
      ultimos90dias: build("ultimos90dias"),
      ultimos12meses: build("ultimos12meses"),
      totalHistorico: build("totalHistorico"),
    };
  }, [programsQuery.data]);

  return {
    loading:
      clientsQuery.isLoading || profilesQuery.isLoading || programsQuery.isLoading,
    error: clientsQuery.error || profilesQuery.error || programsQuery.error,
    clientsIds: clientsQuery.data ?? [],
    resumoClientes,
    vencimentosTodosClientes,
    kpis,
    dreConsolidado,
  };
};
