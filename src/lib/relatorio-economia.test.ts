import { describe, it, expect } from "vitest";
import {
  parseRelatorioEconomia,
  groupEventosByMes,
  custoComGestaoEmissao,
  resumoEvento,
  nomePrograma,
  formatBRL,
  apresentacaoEconomia,
  type RelatorioEvento,
  type RelatorioEventoEmissao,
  type RelatorioEventoManual,
} from "@/lib/relatorio-economia";

describe("parseRelatorioEconomia", () => {
  it("normaliza o retorno da RPC com defaults seguros", () => {
    const parsed = parseRelatorioEconomia({
      kpis: { economiaEmissoes: "1266.32", numEmissoes: 2, milhasGeradasPromocoes: 190000 },
      eventos: [{ id: "x", origem: "emissao", tipo: "emissao", dataEvento: "2026-05-18", titulo: "Smiles", milhasUtilizadas: 1000, taxaEmbarque: 50, economia: null }],
    });
    expect(parsed.kpis.economiaEmissoes).toBe(1266.32);
    expect(parsed.kpis.economiaTotal).toBe(1266.32);
    expect(parsed.kpis.milhasGeradasPromocoes).toBe(190000);
    expect(parsed.kpis.custoMilheiroMedio).toBeNull();
    expect(parsed.eventos).toHaveLength(1);
  });

  it("retorno vazio vira relatório zerado", () => {
    const parsed = parseRelatorioEconomia(null);
    expect(parsed.kpis.numEmissoes).toBe(0);
    expect(parsed.eventos).toEqual([]);
    expect(parsed.caseDestaque).toBeNull();
  });
});

describe("groupEventosByMes", () => {
  it("agrupa por mês em ordem decrescente com rótulo PT-BR", () => {
    const eventos = [
      { id: "1", origem: "manual", tipo: "nota", dataEvento: "2026-03-10", titulo: "a", descricao: "", visivelCliente: true, payload: {} },
      { id: "2", origem: "manual", tipo: "nota", dataEvento: "2026-05-02", titulo: "b", descricao: "", visivelCliente: true, payload: {} },
    ] as RelatorioEvento[];
    const grupos = groupEventosByMes(eventos);
    expect(grupos.map((g) => g.chave)).toEqual(["2026-05", "2026-03"]);
    expect(grupos[0].rotulo).toMatch(/maio/i);
  });
});

describe("custoComGestaoEmissao", () => {
  const base: RelatorioEventoEmissao = {
    id: "e1", origem: "emissao", tipo: "emissao", dataEvento: "2026-05-18", titulo: "Tudo Azul",
    rotaOrigem: "VCP", rotaDestino: "MAO", classe: null, milhasUtilizadas: 31680, taxaEmbarque: 46.52,
    emissaoFornecedor: false, tarifaPagante: 1693, custoFornecedor: null, passageiros: null,
    cpmMilheiro: 12, economia: 1266.32,
  };

  it("emissão própria: milhas × CPM + taxas (caso real do banco)", () => {
    expect(custoComGestaoEmissao(base)).toBeCloseTo(426.68, 2);
  });

  it("fornecedor: custo do fornecedor", () => {
    expect(
      custoComGestaoEmissao({ ...base, emissaoFornecedor: true, custoFornecedor: 1290, cpmMilheiro: null }),
    ).toBe(1290);
  });

  it("sem CPM nem fornecedor: incalculável", () => {
    expect(custoComGestaoEmissao({ ...base, cpmMilheiro: null })).toBeNull();
  });
});

describe("resumoEvento", () => {
  it("cotação: rota, classe e valores", () => {
    const ev: RelatorioEventoManual = {
      id: "c1", origem: "manual", tipo: "cotacao", dataEvento: "2026-06-10", titulo: "Cotação",
      descricao: "", visivelCliente: true,
      payload: { origem: "GRU", destino: "MVD", classe: "premium-economy", milhasCotadas: 20000, taxasCotadas: 150, valorPagante: 1500, status: "entregue" },
    };
    const r = resumoEvento(ev);
    expect(r).toContain("GRU → MVD");
    expect(r).toContain("Premium Economy");
    expect(r).toContain("20.000 milhas");
  });

  it("promoção: programas prettificados, pontos+bônus, milhas geradas e custo", () => {
    const ev: RelatorioEventoManual = {
      id: "p1", origem: "manual", tipo: "promocao", dataEvento: "2026-06-10", titulo: "Transferência",
      descricao: "", visivelCliente: true,
      payload: { programaOrigem: "Itaú", programaDestino: "smiles", pontosTransferidos: 100000, bonusPct: 90, milhasGeradas: 190000, custoCliente: 500 },
    };
    const r = resumoEvento(ev);
    expect(r).toContain("Itaú → Smiles");
    expect(r).toContain("100.000 pts +90%");
    expect(r).toContain("190.000 milhas geradas");
    expect(r).toContain("custo");
  });

  it("case destaque: snapshot resumido", () => {
    const ev: RelatorioEventoManual = {
      id: "k1", origem: "manual", tipo: "case_emissao", dataEvento: "2026-05-18", titulo: "Destaque",
      descricao: "", visivelCliente: true,
      payload: { emissaoId: "e1", linhas: [], snapshot: { custoTotalInvestido: 7453.14, custoMilheiroReal: 15.29, pctCustoZero: 65.3 } },
    };
    const r = resumoEvento(ev);
    expect(r).toContain("investido");
    expect(r).toContain("15,29");
    expect(r).toContain("65,3%");
  });
});

describe("nomePrograma", () => {
  it("prettifica slugs e preserva nomes já formatados", () => {
    expect(nomePrograma("smiles")).toBe("Smiles");
    expect(nomePrograma("latam-pass")).toBe("Latam Pass");
    expect(nomePrograma("Itaú")).toBe("Itaú");
  });
});

describe("formatBRL", () => {
  it("formata moeda pt-BR", () => {
    expect(formatBRL(1266.32)).toMatch(/R\$\s?1\.266,32/);
  });
});

describe("apresentacaoEconomia", () => {
  it("positivo: rótulo Economia, prefixo +, verde", () => {
    const ap = apresentacaoEconomia(1266.32);
    expect(ap.rotulo).toBe("Economia");
    expect(ap.texto).toMatch(/^\+R\$\s?1\.266,32/);
    expect(ap.classe).toContain("green");
    expect(ap.negativo).toBe(false);
  });

  it("negativo: rótulo Resultado, sem duplo sinal, vermelho", () => {
    const ap = apresentacaoEconomia(-2899.36);
    expect(ap.rotulo).toBe("Resultado");
    expect(ap.texto).toMatch(/^-R\$\s?2\.899,36/);
    expect(ap.texto).not.toContain("+");
    expect(ap.classe).toContain("red");
    expect(ap.negativo).toBe(true);
  });

  it("zero conta como economia (não negativo)", () => {
    const ap = apresentacaoEconomia(0);
    expect(ap.rotulo).toBe("Economia");
    expect(ap.negativo).toBe(false);
    expect(ap.texto).toMatch(/^\+R\$\s?0,00/);
  });
});
