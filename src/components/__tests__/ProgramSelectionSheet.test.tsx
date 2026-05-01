import { describe, it, expect } from "vitest";
import { filterPrograms, highlightSegments } from "../ProgramSelectionSheet";

const OPTIONS = [
  { programId: "latam-pass", name: "Latam Pass", logo: "LP", logoColor: "#1a3a6b" },
  { programId: "livelo",     name: "Livelo",     logo: "Lv", logoColor: "#e91e63" },
  { programId: "smiles",     name: "Smiles",     logo: "Sm", logoColor: "#f59e42" },
];

describe("filterPrograms", () => {
  it("retorna todos quando query é vazia", () => {
    const result = filterPrograms(OPTIONS, "");
    expect(result).toHaveLength(3);
  });

  it("filtra por nome case-insensitive", () => {
    const result = filterPrograms(OPTIONS, "latam");
    expect(result).toHaveLength(1);
    expect(result[0].programId).toBe("latam-pass");
  });

  it("retorna vazio quando nada bate", () => {
    const result = filterPrograms(OPTIONS, "zzz");
    expect(result).toHaveLength(0);
  });
});

describe("highlightSegments", () => {
  it("retorna [{text, highlight:false}] quando query é vazia", () => {
    expect(highlightSegments("Latam Pass", "")).toEqual([
      { text: "Latam Pass", highlight: false },
    ]);
  });

  it("divide em três segmentos quando match está no meio", () => {
    const segs = highlightSegments("Latam Pass", "tam");
    expect(segs).toEqual([
      { text: "La",    highlight: false },
      { text: "tam",   highlight: true  },
      { text: " Pass", highlight: false },
    ]);
  });

  it("retorna [{text, highlight:false}] quando não há match", () => {
    expect(highlightSegments("Livelo", "zzz")).toEqual([
      { text: "Livelo", highlight: false },
    ]);
  });
});
