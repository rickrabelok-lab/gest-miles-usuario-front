import { describe, it, expect } from "vitest";
import { reconstruirLotesDeMovimentos, type Movimento } from "@/lib/program-state";

// Helpers de construção enxuta.
const entrada = (data: string, validadeLote: string, milhas: number): Movimento => ({
  id: `e-${data}-${validadeLote}-${milhas}`,
  data,
  tipo: "entrada",
  descricao: "entrada",
  milhas,
  validadeLote,
});

const saida = (data: string, milhas: number, extra: Partial<Movimento> = {}): Movimento => ({
  id: `s-${data}-${milhas}`,
  data,
  tipo: "saida",
  descricao: "saida",
  milhas,
  ...extra,
});

const somaLotes = (lotes: { quantidade: number }[]) => lotes.reduce((s, l) => s + l.quantidade, 0);
const porValidade = (lotes: { validadeLote: string; quantidade: number }[], v: string) =>
  lotes.find((l) => l.validadeLote === v)?.quantidade ?? 0;

describe("reconstruirLotesDeMovimentos", () => {
  it("só entradas: soma por validade", () => {
    const lotes = reconstruirLotesDeMovimentos([
      entrada("2026-01-01", "2027-01-01", 100000),
      entrada("2026-02-01", "2027-01-01", 50000),
      entrada("2026-03-01", "2028-01-01", 30000),
    ]);
    expect(porValidade(lotes, "2027-01-01")).toBe(150000);
    expect(porValidade(lotes, "2028-01-01")).toBe(30000);
    expect(somaLotes(lotes)).toBe(180000);
  });

  it("entrada + saída: debita (sum(lotes) reflete saldo, não só entradas)", () => {
    const lotes = reconstruirLotesDeMovimentos([
      entrada("2026-01-01", "2027-01-01", 100000),
      saida("2026-02-01", 80000),
    ]);
    expect(somaLotes(lotes)).toBe(20000);
  });

  it("FIFO por vencimento: debita o lote que vence antes primeiro", () => {
    // Ambas as entradas existem quando a saída ocorre; a de validade mais curta é debitada.
    const lotes = reconstruirLotesDeMovimentos([
      entrada("2026-01-01", "2027-12-31", 100000),
      entrada("2026-02-01", "2026-06-30", 50000), // vence antes
      saida("2026-03-01", 80000),
    ]);
    expect(lotes.find((l) => l.validadeLote === "2026-06-30")).toBeUndefined(); // zerado removido
    expect(porValidade(lotes, "2027-12-31")).toBe(70000);
    expect(somaLotes(lotes)).toBe(70000);
  });

  it("replay CRONOLÓGICO: saída antes de uma entrada de validade mais curta não a debita retroativamente", () => {
    // A ordem importa: a saída ocorre quando só existe o lote A.
    const lotes = reconstruirLotesDeMovimentos([
      entrada("2026-01-01", "2026-06-30", 50000),
      saida("2026-02-01", 30000), // debita A (único existente) → A=20000
      entrada("2026-03-01", "2026-05-31", 40000), // entra depois, validade mais curta, intacta
    ]);
    // Cronológico: A=20000, B=40000 (não B=10000/A=50000 do soma-depois-debita).
    expect(porValidade(lotes, "2026-06-30")).toBe(20000);
    expect(porValidade(lotes, "2026-05-31")).toBe(40000);
    expect(somaLotes(lotes)).toBe(60000);
  });

  it("saída maior que os lotes: floora em 0, sem negativo, remove zerados", () => {
    const lotes = reconstruirLotesDeMovimentos([
      entrada("2026-01-01", "2027-01-01", 20000),
      saida("2026-02-01", 50000),
    ]);
    expect(lotes).toHaveLength(0);
    expect(somaLotes(lotes)).toBe(0);
  });

  it("movimento sem validade não vira lote; saída sobre saldo-sem-validade não corrompe", () => {
    const lotes = reconstruirLotesDeMovimentos([
      entrada("2026-01-01", "", 30000), // sem validade → não é lote
      saida("2026-02-01", 10000),
    ]);
    expect(lotes).toHaveLength(0);
  });

  it("múltiplas entradas mesma validade mesclam num lote só", () => {
    const lotes = reconstruirLotesDeMovimentos([
      entrada("2026-01-01", "2027-01-01", 10000),
      entrada("2026-02-01", "2027-01-01", 15000),
    ]);
    expect(lotes).toHaveLength(1);
    expect(porValidade(lotes, "2027-01-01")).toBe(25000);
  });

  it("formato de data misto (YYYY-MM-DD e dd/mm/aaaa) não quebra o replay", () => {
    const lotes = reconstruirLotesDeMovimentos([
      entrada("01/01/2026", "2027-01-01", 100000),
      saida("15/02/2026", 40000),
    ]);
    expect(somaLotes(lotes)).toBe(60000);
  });

  it("saída por fornecedor não debita lotes (não consome milhas)", () => {
    const lotes = reconstruirLotesDeMovimentos([
      entrada("2026-01-01", "2027-01-01", 100000),
      saida("2026-02-01", 30000, { emissaoFornecedor: true }),
    ]);
    expect(somaLotes(lotes)).toBe(100000);
  });

  it("array vazio → sem lotes", () => {
    expect(reconstruirLotesDeMovimentos([])).toEqual([]);
  });
});
