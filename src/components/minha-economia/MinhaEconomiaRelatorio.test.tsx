import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MinhaEconomiaRelatorio } from "@/components/minha-economia/MinhaEconomiaRelatorio";
import type { RelatorioEconomia } from "@/lib/relatorio-economia";

const data: RelatorioEconomia = {
  kpis: {
    economiaEmissoes: 11227.71,
    economiaTotal: 11227.71,
    numEmissoes: 1,
    numCotacoes: 2,
    funilCotacoes: { entregues: 1, fechadas: 1, naoFechadas: 0, expiradas: 0 },
    milhasGeradasPromocoes: 302400,
    milhasCustoZero: 302400,
    custoMilheiroMedio: 15.29,
  },
  eventos: [
    {
      id: "em-1", origem: "emissao", tipo: "emissao", dataEvento: "2026-05-18", titulo: "Smiles",
      rotaOrigem: "GIG", rotaDestino: "MCO", classe: "economica", milhasUtilizadas: 852500,
      taxaEmbarque: 2774.4, emissaoFornecedor: false, tarifaPagante: 18680.85, custoFornecedor: null,
      passageiros: 4, cpmMilheiro: 5.49, economia: 11227.71,
    },
    {
      id: "ev-1", origem: "manual", tipo: "promocao", dataEvento: "2026-04-19", titulo: "Itaú → Smiles 80%",
      descricao: "", visivelCliente: true,
      payload: { programaOrigem: "Itaú", programaDestino: "smiles", pontosTransferidos: 151000, bonusPct: 80, milhasGeradas: 271800 },
    },
    {
      id: "case-1", origem: "manual", tipo: "case_emissao", dataEvento: "2026-05-18",
      titulo: "Emissão destaque · GIG → MCO", descricao: "", visivelCliente: true,
      payload: { emissaoId: "em-1", linhas: [], snapshot: { custoTotalInvestido: 7453.14, custoMilheiroReal: 15.29, pctCustoZero: 65.3, economia: 11227.71 } },
    },
  ],
  caseDestaque: {
    id: "case-1",
    dataEvento: "2026-05-18",
    titulo: "Emissão destaque · GIG → MCO",
    payload: {
      emissaoId: "em-1",
      linhas: [
        { origemTipo: "saldo_original", label: "Saldo original", milhas: 273823, custo: 0 },
        { origemTipo: "compra", label: "Livelo 80%", milhas: 306000, custo: 4678.74 },
      ],
      snapshot: { custoTotalInvestido: 7453.14, custoMilheiroReal: 15.29, pctCustoZero: 65.3, economia: 11227.71 },
    },
  },
};

describe("MinhaEconomiaRelatorio", () => {
  it("hero mostra a economia total e o período", () => {
    render(<MinhaEconomiaRelatorio periodoLabel="últimos 12 meses" data={data} />);
    expect(screen.getAllByText(/11\.227,71/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/últimos 12 meses/i)).toBeInTheDocument();
  });

  it("KPIs: emissões, cotações, milhas geradas e milheiro real", () => {
    render(<MinhaEconomiaRelatorio periodoLabel="tudo" data={data} />);
    expect(screen.getAllByText(/302\.400/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/15,29/).length).toBeGreaterThanOrEqual(1);
  });

  it("extrato agrupado por mês com emissão (economia verde) e promoção", () => {
    render(<MinhaEconomiaRelatorio periodoLabel="tudo" data={data} />);
    expect(screen.getByText(/maio de 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/abril de 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/GIG → MCO · Smiles/)).toBeInTheDocument();
    expect(screen.getByText(/271\.800 milhas geradas/)).toBeInTheDocument();
  });

  it("seção do case destaque com composição e stats", () => {
    render(<MinhaEconomiaRelatorio periodoLabel="tudo" data={data} />);
    expect(screen.getAllByText(/emissão destaque/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/7\.453,14/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/65,3%/).length).toBeGreaterThanOrEqual(1);
  });

  it("resumo consolidado com custo com gestão (852,5 × 5,49 + 2.774,40)", () => {
    render(<MinhaEconomiaRelatorio periodoLabel="tudo" data={data} />);
    expect(screen.getByText(/resumo consolidado/i)).toBeInTheDocument();
    expect(screen.getByText(/7\.454,6[23]/)).toBeInTheDocument();
  });

  it("sem eventos mostra estado vazio amigável", () => {
    render(
      <MinhaEconomiaRelatorio periodoLabel="tudo"
        data={{ kpis: { ...data.kpis, numEmissoes: 0, economiaTotal: 0, economiaEmissoes: 0 }, eventos: [], caseDestaque: null }} />,
    );
    expect(screen.getByText(/nenhum evento/i)).toBeInTheDocument();
  });
});
