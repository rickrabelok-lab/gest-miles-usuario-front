import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  CATEGORY_META,
  categoryOf,
  filterPrograms,
  groupByCategory,
  highlightSegments,
} from "../programSelectionUtils";
import { ProgramLogo } from "../ProgramSelectionSheet";

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

describe("categoryOf", () => {
  it("mapeia companhias aéreas", () => {
    expect(categoryOf("latam-pass")).toBe("aereas");
    expect(categoryOf("tap")).toBe("aereas");
    expect(categoryOf("american-airlines")).toBe("aereas");
  });

  it("mapeia pontos, bancos, hotéis e outros", () => {
    expect(categoryOf("livelo")).toBe("pontos");
    expect(categoryOf("itau")).toBe("bancos");
    expect(categoryOf("all-accor")).toBe("hoteis");
    expect(categoryOf("coopera")).toBe("outros");
  });

  it("usa 'outros' para programId desconhecido", () => {
    expect(categoryOf("programa-fantasma")).toBe("outros");
  });
});

describe("groupByCategory", () => {
  const rows = [
    { programId: "itau", name: "Itaú" },
    { programId: "latam-pass", name: "LATAM Pass" },
    { programId: "livelo", name: "Livelo" },
    { programId: "all-accor", name: "ALL Accor" },
  ];

  it("agrupa na ordem fixa e ignora seções vazias", () => {
    const sections = groupByCategory(rows);
    expect(sections.map((s) => s.id)).toEqual([
      "aereas",
      "pontos",
      "bancos",
      "hoteis",
    ]);
  });

  it("coloca cada item na seção certa", () => {
    const sections = groupByCategory(rows);
    const aereas = sections.find((s) => s.id === "aereas");
    expect(aereas?.items.map((i) => i.programId)).toEqual(["latam-pass"]);
  });

  it("CATEGORY_META cobre as 5 categorias na ordem", () => {
    expect(CATEGORY_META.map((m) => m.id)).toEqual([
      "aereas",
      "pontos",
      "bancos",
      "hoteis",
      "outros",
    ]);
  });
});

describe("ProgramLogo", () => {
  it("renderiza <img> quando há URL", () => {
    render(
      <ProgramLogo
        logoImageUrl="https://logo.clearbit.com/latam.com"
        logo="LP"
        logoColor="#1a3a6b"
        name="LATAM Pass"
      />,
    );
    const img = screen.getByAltText("LATAM Pass") as HTMLImageElement;
    expect(img.src).toContain("latam.com");
    expect(screen.queryByText("LP")).toBeNull();
  });

  it("cai no wordmark curado quando a imagem falha", () => {
    render(
      <ProgramLogo
        logoImageUrl="https://exemplo.invalido/logo.png"
        logo="QA"
        logoColor="#5a1f3d"
        name="Qatar Airways"
      />,
    );
    fireEvent.error(screen.getByAltText("Qatar Airways"));
    expect(screen.getByText("QATAR")).toBeTruthy();
    expect(screen.queryByAltText("Qatar Airways")).toBeNull();
  });

  it("mostra o chip de iniciais quando não há URL nem wordmark curado", () => {
    render(<ProgramLogo logo="CP" logoColor="#2d6a4f" name="Coopera" />);
    expect(screen.getByText("CP")).toBeTruthy();
  });

  it("mostra o wordmark curado quando não há URL (ex.: Itaú)", () => {
    render(<ProgramLogo logo="It" logoColor="#EC7000" name="Itaú" />);
    expect(screen.getByText("itaú")).toBeTruthy();
  });

  it("símbolo SVG empacotado vence a imagem do branding (ex.: Copa Airlines)", () => {
    const { container } = render(
      <ProgramLogo
        logoImageUrl="https://exemplo.invalido/connectmiles.png"
        logo="CM"
        logoColor="#00458c"
        name="Copa Airlines"
      />,
    );
    expect(screen.queryByAltText("Copa Airlines")).toBeNull();
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain("copa-airlines");
  });
});
